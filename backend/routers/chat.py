# backend/routers/chat.py

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
from backend.services import chat_services, ai_pipeline, rag_service
from backend.services.ticket_service import create_ticket_from_input
from backend.channels.channel_router import ingest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessageRequest(BaseModel):
    message:    str
    session_id: Optional[str] = None


class EscalateRequest(BaseModel):
    session_id: str
    reason:     Optional[str] = "User requested human agent"


class ResolveRequest(BaseModel):
    session_id: str


@router.post("/message")
async def chat_message(
    request:      ChatMessageRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    """
    Main chatbot endpoint.
    Runs ai_pipeline.run() (NLP → triage → RAG/Tavily if needed → LLM),
    then streams the resulting text word-by-word for typing UX.
    """
    session_id = request.session_id or str(uuid.uuid4())
    session    = chat_services.get_or_create_session(
        session_id, current_user.id, "chat"
    )

    if session.resolved:
        raise HTTPException(status_code=400, detail="This conversation is already resolved. Start a new one.")
    if session.escalated:
        raise HTTPException(status_code=400, detail="This conversation has been escalated. Check your tickets.")

    chat_services.add_user_message(session_id, request.message)

    logger.info(
        f"[CHAT] Message from user={current_user.id} "
        f"session={session_id} turn={session.turn_count}"
    )

    # Build conversation context (last turns + summary)
    recent_turns, summary = await chat_services.build_context_for_llm(session)
    conversation = []
    if summary:
        conversation.append({"role": "system", "content": f"Previous conversation summary: {summary}"})
    conversation.extend(recent_turns)

    # Run the full AI pipeline
    pipeline_result = await ai_pipeline.run(request.message, conversation=conversation)

    nlp_result = pipeline_result["nlp"]
    response_text = pipeline_result["response"] or ""
    confidence     = pipeline_result["confidence"]

    async def response_stream():
        # Send NLP metadata first
        nlp_meta = {
            "type":       "nlp",
            "tier":       pipeline_result["tier"],
            "category":   nlp_result.category,
            "priority":   nlp_result.priority,
            "severity":   nlp_result.severity,
            "session_id": session_id,
        }
        yield f"data: {json.dumps(nlp_meta)}\n\n"

        # Stream the response word by word (typing effect)
        for word in response_text.split():
            yield f"data: {word} \n\n"

        # Save AI response to session
        chat_services.add_ai_response(session_id, response_text, confidence)

        logger.info(
            f"[CHAT] Response complete — tier={pipeline_result['tier']} "
            f"confidence={confidence} turn={session.turn_count}/{chat_services.MAX_TURNS}"
        )

        # Tier3b/3c — pipeline already says create ticket
        if pipeline_result["should_create_ticket"]:
            ticket = await _create_ticket_from_session(session, nlp_result, db, current_user)
            session.escalated = True
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'session_id': session_id})}\n\n"
            return

        # Otherwise check session-level escalation rules (turn limit, etc.)
        should_esc, reason = chat_services.should_escalate(session, confidence)

        if should_esc:
            logger.info(f"[CHAT] Escalating — {reason}")
            ticket = await _create_ticket_from_session(session, nlp_result, db, current_user)
            session.escalated = True
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'reason': reason, 'session_id': session_id})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'confidence', 'value': confidence, 'session_id': session_id})}\n\n"

    return StreamingResponse(response_stream(), media_type="text/event-stream")


@router.post("/escalate")
async def chat_escalate(
    request:      EscalateRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    session = chat_services.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.escalated:
        raise HTTPException(status_code=400, detail="Already escalated")

    conversation_text = session.to_ticket_content()
    from backend.services import nlp_services
    nlp_result = nlp_services.analyze(conversation_text[:500])

    ticket = await _create_ticket_from_session(session, nlp_result, db, current_user)
    session.escalated = True

    logger.info(f"[CHAT] Manual escalation — session={request.session_id} ticket={ticket.id}")

    return {
        "status":     "escalated",
        "ticket_id":  ticket.id,
        "session_id": request.session_id,
        "message":    "A helpdesk agent will review your ticket shortly."
    }


@router.post("/resolve")
async def chat_resolve(
    request:      ResolveRequest,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db)
):
    session = chat_services.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.resolved = True

    logger.info(f"[CHAT] Resolved — session={request.session_id} turns={session.turn_count}")

    # Continuous learning — store resolved conversation in ChromaDB
    try:
        last_ai = next((t.content for t in reversed(session.turns) if t.role == "assistant"), "")
        first_user = next((t.content for t in session.turns if t.role == "user"), "")
        summary_text = f"PROBLEM: {first_user[:200]}\nRESOLUTION: {last_ai[:300]}"

        from backend.services import nlp_services
        nlp_result = nlp_services.analyze(first_user)

        rag_service.store_resolved_conversation(
            session_summary = summary_text,
            category         = nlp_result.category,
            priority         = nlp_result.priority,
        )
    except Exception as e:
        logger.error(f"[CHAT] Failed to store resolved conversation: {e}")

    chat_services.delete_session(request.session_id)

    return {
        "status":     "resolved",
        "session_id": request.session_id,
        "turns":      session.turn_count,
        "message":    "Great! Glad we could help. Session closed."
    }


@router.get("/history/{session_id}")
async def chat_history(
    session_id:   str,
    current_user: User = Depends(get_current_user),
):
    session = chat_services.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
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


async def _create_ticket_from_session(session, nlp_result, db: Session, current_user: User):
    chat_payload = {
        "session_id": session.session_id,
        "messages": [{"role": t.role, "text": t.content} for t in session.turns]
    }
    ticket_input = ingest(source="chat", payload=chat_payload, user_id=current_user.id)
    ticket = create_ticket_from_input(db, ticket_input)

    logger.info(
        f"[CHAT] Ticket created — {ticket.id} "
        f"category={nlp_result.category} priority={nlp_result.priority}"
    )
    return ticket