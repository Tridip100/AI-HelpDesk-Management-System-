# backend/routers/chat.py
#
# WHAT THIS FILE DOES:
# The main chatbot endpoint.
# POST /chat/message — user sends a message, AI replies with streaming.
#
# Full flow per message:
#   1. Get or create session (chat_service)
#   2. Run NLP on user message (nlp_service)
#   3. Decide tier (triage)
#   4. Build LLM context (chat_service)
#   5. Stream LLM response (llm_service)
#   6. Check confidence → escalate or continue
#   7. If escalated → create ticket (ticket_service)
#
# POST /chat/escalate  — user manually requests human agent
# POST /chat/resolve   — user confirms issue is resolved
# GET  /chat/history   — get full conversation history

import json
import logging
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.rbac import get_current_user
from backend.models.user import User
from backend.services import nlp_services, llm_services, chat_services
from backend.services.ticket_service import create_ticket_from_input
from backend.channels.chat_handler import parse_chat
from backend.channels.channel_router import ingest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


# ─────────────────────────────────────────
# REQUEST / RESPONSE SCHEMAS
# ─────────────────────────────────────────
class ChatMessageRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None   # None = start new conversation


class EscalateRequest(BaseModel):
    session_id: str
    reason:     Optional[str] = "User requested human agent"


class ResolveRequest(BaseModel):
    session_id: str


# ─────────────────────────────────────────
# POST /chat/message — main chat endpoint
# ─────────────────────────────────────────
@router.post("/message")
async def chat_message(
    request:      ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """
    Main chatbot endpoint with streaming response.

    Request:
    {
        "message":    "My VPN keeps disconnecting",
        "session_id": "sess_abc123"   ← omit for new conversation
    }

    Response: Server-Sent Events stream
    Each event is one of:
        data: Hello                    ← regular token
        data: {"type":"nlp", ...}      ← NLP analysis result
        data: {"type":"confidence"...} ← final confidence score
        data: {"type":"escalated",...} ← ticket created
        data: {"type":"resolved"}      ← conversation resolved
    """

    # Step 1 — session management
    session_id = request.session_id or str(uuid.uuid4())
    session    = chat_services.get_or_create_session(
        session_id, current_user.id, "chat"
    )

    # Guard — don't continue resolved/escalated sessions
    if session.resolved:
        raise HTTPException(
            status_code=400,
            detail="This conversation is already resolved. Start a new one."
        )
    if session.escalated:
        raise HTTPException(
            status_code=400,
            detail="This conversation has been escalated. Check your tickets."
        )

    # Add user message to history
    chat_services.add_user_message(session_id, request.message)

    logger.info(
        f"[CHAT] Message from user={current_user.id} "
        f"session={session_id} turn={session.turn_count}"
    )

    # Step 2 — NLP analysis
    nlp_result = nlp_services.analyze(request.message)

    logger.info(
        f"[CHAT] NLP → tier={nlp_result.tier} "
        f"category={nlp_result.category} "
        f"severity={nlp_result.severity}"
    )

    # Step 3 — immediate escalation for tier3b and tier3c
    # These bypass LLM solving — go straight to helpdesk
    if nlp_result.tier in ("tier3b", "tier3c"):
        logger.info(f"[CHAT] Immediate escalation — {nlp_result.tier}")

        async def escalation_stream():
            # Tell user what we detected
            if nlp_result.tier == "tier3c":
                msg = (
                    f"I've detected a **{nlp_result.severity.upper()}** "
                    f"{nlp_result.category} issue that requires immediate "
                    f"attention from our helpdesk team. "
                    f"I'm creating an urgent ticket for you now."
                )
            else:
                msg = (
                    f"This appears to be a hardware issue that requires "
                    f"physical inspection. I'm connecting you with our "
                    f"helpdesk team who can assist you directly."
                )

            # Stream the message word by word
            for word in msg.split():
                yield f"data: {word} \n\n"

            # Create ticket
            ticket = await _create_ticket_from_session(
                session, nlp_result, db, current_user
            )
            session.escalated = True

            # Send escalation event
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'session_id': session_id})}\n\n"

        return StreamingResponse(
            escalation_stream(),
            media_type="text/event-stream"
        )

    # Step 4 — build LLM context
    recent_turns, summary = await chat_services.build_context_for_llm(session)

    # Prepend summary to context if exists
    conversation = []
    if summary:
        conversation.append({
            "role":    "system",
            "content": f"Previous conversation summary: {summary}"
        })
    conversation.extend(recent_turns)

    # Step 5 — stream LLM response
    async def response_stream():
        full_response = ""
        confidence    = 0.5

        # Send NLP metadata first — frontend uses this to show category/priority
        nlp_meta = {
            "type":     "nlp",
            "tier":     nlp_result.tier,
            "category": nlp_result.category,
            "priority": nlp_result.priority,
            "severity": nlp_result.severity,
            "session_id": session_id
        }
        yield f"data: {json.dumps(nlp_meta)}\n\n"

        # Stream tokens from LLM
        async for token in llm_services.generate_stream(
            nlp_summary    = nlp_result.summary,
            conversation   = conversation,
            raw_message    = request.message,
        ):
            # Check if this is the confidence signal
            if token.startswith('{"type"'):
                try:
                    data       = json.loads(token)
                    confidence = data.get("value", 0.5)
                except json.JSONDecodeError:
                    pass
                # Don't stream this token to frontend — handle internally
                continue

            # Regular token — stream to frontend
            full_response += token
            yield f"data: {token}\n\n"

        # Step 6 — save AI response to session
        chat_services.add_ai_response(session_id, full_response, confidence)

        logger.info(
            f"[CHAT] Response complete — confidence={confidence} "
            f"turn={session.turn_count}/{chat_services.MAX_TURNS}"
        )

        # Step 7 — check escalation
        should_esc, reason = chat_services.should_escalate(session, confidence)

        if should_esc:
            logger.info(f"[CHAT] Escalating — {reason}")

            # Create ticket from conversation
            ticket = await _create_ticket_from_session(
                session, nlp_result, db, current_user
            )
            session.escalated = True

            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'reason': reason, 'session_id': session_id})}\n\n"

        else:
            # Send confidence to frontend
            yield f"data: {json.dumps({'type': 'confidence', 'value': confidence, 'session_id': session_id})}\n\n"

    return StreamingResponse(
        response_stream(),
        media_type="text/event-stream"
    )


# ─────────────────────────────────────────
# POST /chat/escalate — manual escalation
# User clicks "Talk to human" button
# ─────────────────────────────────────────
@router.post("/escalate")
async def chat_escalate(
    request:      EscalateRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """
    User manually requests to talk to a human agent.
    Creates a ticket from the conversation history.
    """
    session = chat_services.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.escalated:
        raise HTTPException(status_code=400, detail="Already escalated")

    # Run NLP on conversation summary for classification
    conversation_text = session.to_ticket_content()
    nlp_result        = nlp_services.analyze(conversation_text[:500])

    ticket = await _create_ticket_from_session(
        session, nlp_result, db, current_user
    )
    session.escalated = True

    logger.info(
        f"[CHAT] Manual escalation — session={request.session_id} "
        f"ticket={ticket.id}"
    )

    return {
        "status":     "escalated",
        "ticket_id":  ticket.id,
        "session_id": request.session_id,
        "message":    "A helpdesk agent will review your ticket shortly."
    }


# ─────────────────────────────────────────
# POST /chat/resolve — user confirms resolved
# ─────────────────────────────────────────
@router.post("/resolve")
async def chat_resolve(
    request:      ResolveRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """
    User confirms the issue is resolved.
    Stores Q&A in ChromaDB (ingestion — built later).
    No ticket created.
    """
    session = chat_services.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.resolved = True

    logger.info(
        f"[CHAT] Resolved — session={request.session_id} "
        f"turns={session.turn_count}"
    )

    # TODO: store Q&A in ChromaDB for future RAG
    # rag_service.store_resolved_conversation(session)

    # Clean up session
    chat_services.delete_session(request.session_id)

    return {
        "status":     "resolved",
        "session_id": request.session_id,
        "turns":      session.turn_count,
        "message":    "Great! Glad we could help. Session closed."
    }


# ─────────────────────────────────────────
# GET /chat/history — get conversation history
# ─────────────────────────────────────────
@router.get("/history/{session_id}")
async def chat_history(
    session_id:   str,
    current_user: User = Depends(get_current_user),
):
    """Get full conversation history for a session."""
    session = chat_services.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Security — users can only see their own sessions
    if session.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return {
        "session_id":  session_id,
        "turn_count":  session.turn_count,
        "resolved":    session.resolved,
        "escalated":   session.escalated,
        "history":     session.get_full_history(),
        "summary":     session.summary,
    }


# ─────────────────────────────────────────
# HELPER — create ticket from session
# ─────────────────────────────────────────
async def _create_ticket_from_session(
    session,
    nlp_result,
    db:           Session,
    current_user: User,
):
    """
    Convert a chat session into a ticket.
    Called on escalation — chat history becomes ticket description.
    """
    # Build chat payload from session
    chat_payload = {
        "session_id": session.session_id,
        "messages": [
            {
                "role":    t.role,
                "text":    t.content
            }
            for t in session.turns
        ]
    }

    # Normalize to TicketInput via chat_handler
    ticket_input = ingest(
        source   = "chat",
        payload  = chat_payload,
        user_id  = current_user.id
    )

    # Create ticket in DB
    ticket = create_ticket_from_input(db, ticket_input)

    logger.info(
        f"[CHAT] Ticket created — {ticket.id} "
        f"category={nlp_result.category} "
        f"priority={nlp_result.priority}"
    )

    return ticket