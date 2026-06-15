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
from backend.services import chat_services as chat_service
from backend.services import ai_pipeline, rag_service
from backend.services import nlp_services as nlp_service
from backend.services.ticket_service import create_ticket_from_input
from backend.channels.channel_router import ingest
from backend.services.knowledge_gap_service import log_gap
from backend.services.anomaly_services import check_for_incident
from fastapi import Form, UploadFile, File
from backend.services.vision_service import describe_image

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
    Streams: status events (progress) -> nlp metadata -> response tokens -> final event.
    """
    session_id = request.session_id or str(uuid.uuid4())
    session    = chat_service.get_or_create_session(session_id, current_user.id, "chat")

    if session.resolved:
        raise HTTPException(status_code=400, detail="This conversation is already resolved. Start a new one.")
    if session.escalated:
        raise HTTPException(status_code=400, detail="This conversation has been escalated. Check your tickets.")

    chat_service.add_user_message(session_id, request.message)

    logger.info(f"[CHAT] Message from user={current_user.id} session={session_id} turn={session.turn_count}")

    recent_turns, summary = await chat_service.build_context_for_llm(session)
    conversation = []
    if summary:
        conversation.append({"role": "system", "content": f"Previous conversation summary: {summary}"})
    conversation.extend(recent_turns)

    async def response_stream():
        pipeline_result = None
        response_text = ""

        async for event in ai_pipeline.run_streaming(request.message, conversation=conversation):
            if event["type"] == "status":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "result":
                pipeline_result = event
                response_text = event["response"] or ""
            elif event["type"] == "draft":
                yield f"data: {json.dumps(event)}\n\n"

        nlp_result = pipeline_result["nlp"]
        confidence = pipeline_result["confidence"]

        nlp_meta = {
            "type":       "nlp",
            "tier":       pipeline_result["tier"],
            "category":   nlp_result.category if nlp_result else "follow_up",
            "priority":   nlp_result.priority if nlp_result else "P3",
            "severity":   nlp_result.severity if nlp_result else "easy",
            "session_id": session_id,
        }
        yield f"data: {json.dumps(nlp_meta)}\n\n"

        for word in response_text.split():
            yield f"data: {word} \n\n"

        chat_service.add_ai_response(session_id, response_text, confidence)

        logger.info(
            f"[CHAT] Response complete — tier={pipeline_result['tier']} "
            f"confidence={confidence} turn={session.turn_count}/{chat_service.MAX_TURNS}"
        )

        if pipeline_result["should_create_ticket"]:
            log_gap(db, nlp_result, pipeline_result, source="chat")
            effective_nlp = nlp_result or nlp_service.analyze(session.to_ticket_content()[:500])
            ticket = await _create_ticket_from_session(session, effective_nlp, db, current_user)
            session.escalated = True
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'session_id': session_id})}\n\n"
            return

        should_esc, reason = chat_service.should_escalate(session, confidence)

        if should_esc:
            logger.info(f"[CHAT] Escalating — {reason}")
            effective_nlp = nlp_result or nlp_service.analyze(session.to_ticket_content()[:500])
            ticket = await _create_ticket_from_session(session, effective_nlp, db, current_user)
            session.escalated = True
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'reason': reason, 'session_id': session_id})}\n\n"
        else:
            yield f"data: {json.dumps({'type': 'confidence', 'value': confidence, 'session_id': session_id})}\n\n"

    return StreamingResponse(response_stream(), media_type="text/event-stream")

from fastapi import UploadFile, File
from backend.services.vision_service import describe_image


@router.post("/message-with-image")
async def chat_message_with_image(
    message: str = Form(""),
    session_id: str = Form(None),
    image: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Like /chat/message, but accepts an image (screenshot).
    The image is described by a vision model, and that description
    is combined with the user's text message before running the
    normal AI pipeline.
    """
    session_id = session_id or str(uuid.uuid4())
    session = chat_service.get_or_create_session(session_id, current_user.id, "chat")

    if session.resolved:
        raise HTTPException(status_code=400, detail="This conversation is already resolved. Start a new one.")
    if session.escalated:
        raise HTTPException(status_code=400, detail="This conversation has been escalated. Check your tickets.")

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file")

    logger.info(f"[CHAT] Image received from user={current_user.id} session={session_id} ({len(image_bytes)} bytes)")

    description = await describe_image(image_bytes)
    logger.info(f"[CHAT] Vision description: {description[:150]}")

    combined_text = f"{message.strip()}\n\n[Screenshot shows: {description}]" if message.strip() else f"[Screenshot shows: {description}]"

    chat_service.add_user_message(session_id, combined_text)

    recent_turns, summary = await chat_service.build_context_for_llm(session)
    conversation = []
    if summary:
        conversation.append({"role": "system", "content": f"Previous conversation summary: {summary}"})
    conversation.extend(recent_turns)

    async def response_stream():
        # Send vision description first so user sees what AI "saw"
        yield f"data: {json.dumps({'type': 'vision', 'description': description})}\n\n"

        pipeline_result = None
        response_text = ""

        async for event in ai_pipeline.run_streaming(combined_text, conversation=conversation):
            if event["type"] == "status":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "draft":
                yield f"data: {json.dumps(event)}\n\n"
            elif event["type"] == "result":
                pipeline_result = event
                response_text = event["response"] or ""

        nlp_result = pipeline_result["nlp"]
        confidence = pipeline_result["confidence"]

        nlp_meta = {
            "type": "nlp",
            "tier": pipeline_result["tier"],
            "category": nlp_result.category if nlp_result else "follow_up",
            "priority": nlp_result.priority if nlp_result else "P3",
            "severity": nlp_result.severity if nlp_result else "easy",
            "session_id": session_id,
        }
        yield f"data: {json.dumps(nlp_meta)}\n\n"

        for word in response_text.split():
            yield f"data: {word} \n\n"

        chat_service.add_ai_response(session_id, response_text, confidence)

        if pipeline_result["should_create_ticket"]:
            from backend.services.knowledge_gap_service import log_gap
            log_gap(db, nlp_result, pipeline_result, source="chat")

            effective_nlp = nlp_result or nlp_service.analyze(session.to_ticket_content()[:500])
            ticket = await _create_ticket_from_session(session, effective_nlp, db, current_user)
            session.escalated = True
            yield f"data: {json.dumps({'type': 'escalated', 'ticket_id': ticket.id, 'session_id': session_id})}\n\n"
            return

        should_esc, reason = chat_service.should_escalate(session, confidence)
        if should_esc:
            effective_nlp = nlp_result or nlp_service.analyze(session.to_ticket_content()[:500])
            ticket = await _create_ticket_from_session(session, effective_nlp, db, current_user)
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
    session = chat_service.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.escalated:
        raise HTTPException(status_code=400, detail="Already escalated")

    conversation_text = session.to_ticket_content()
    nlp_result = nlp_service.analyze(conversation_text[:500])

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
    session = chat_service.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.resolved = True

    logger.info(f"[CHAT] Resolved — session={request.session_id} turns={session.turn_count}")

    try:
        last_ai = next((t.content for t in reversed(session.turns) if t.role == "assistant"), "")
        first_user = next((t.content for t in session.turns if t.role == "user"), "")
        summary_text = f"PROBLEM: {first_user[:200]}\nRESOLUTION: {last_ai[:300]}"

        nlp_result = nlp_service.analyze(first_user)

        rag_service.store_resolved_conversation(
            session_summary = summary_text,
            category         = nlp_result.category,
            priority         = nlp_result.priority,
        )
    except Exception as e:
        logger.error(f"[CHAT] Failed to store resolved conversation: {e}")

    chat_service.delete_session(request.session_id)

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
    session = chat_service.get_session(session_id)
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
    ticket = create_ticket_from_input(db, ticket_input)
    check_for_incident(db, ticket)


    logger.info(
        f"[CHAT] Ticket created — {ticket.id} "
        f"category={nlp_result.category} priority={nlp_result.priority}"
    )
    return ticket