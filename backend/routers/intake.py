# backend/routers/intake.py
#
# WHAT THIS FILE DOES:
# Two FastAPI endpoints:
#   POST /intake/call  — receives audio, transcribes, creates TicketInput
#   POST /intake/email — manual trigger to run one IMAP poll (for testing)
#
# This is the HTTP entry point for call and email channels.
# Chat has its own router (routers/chat.py — built later).

import logging
from fastapi import APIRouter, UploadFile, File, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.middleware.rbac import get_current_user
from backend.models.user import User
from backend.services.stt_service import transcribe_audio
from backend.channels.channel_router import ingest
from backend.channels.imap_poller import poll_once
from backend.services import ai_pipeline
from backend.services.ticket_service import create_ticket_from_input
from backend.services import nlp_services as nlp_service
from backend.services.knowledge_gap_service import log_gap 

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intake", tags=["intake"])


# ─────────────────────────────────────────
# POST /intake/call
# ─────────────────────────────────────────
@router.post("/call")
async def intake_call(
    audio: UploadFile = File(...),
    dry_run: bool = False,           # NEW — if True, skip ticket creation (used by chat voice mode)
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    allowed_types = [
        "audio/wav", "audio/mpeg", "audio/mp4",
        "audio/webm", "audio/ogg", "audio/x-wav"
    ]
    if audio.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {audio.content_type}. Must be audio."
        )

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    logger.info(
        f"[INTAKE/CALL] Received {audio.filename} "
        f"({len(audio_bytes)} bytes) from user_id={current_user.id}"
    )

    stt_result = transcribe_audio(audio_bytes, audio.filename)

    logger.info(
        f"[INTAKE/CALL] Transcribed — confidence={stt_result['confidence']}, "
        f"duration={stt_result['duration']}s"
    )

    call_payload = {
        "call_id":               f"call_{current_user.id}_{audio.filename}",
        "transcript":            stt_result["transcript"],
        "duration_seconds":      stt_result["duration"],
        "transcript_confidence": stt_result["confidence"],
    }

    ticket_input = ingest(
        source   = "call",
        payload  = call_payload,
        user_id  = current_user.id
    )

    logger.info(
        f"[INTAKE/CALL] TicketInput created — "
        f"intake_id={ticket_input.intake_id}, subject={ticket_input.subject}"
    )

    response_payload = {
        "status":      "received",
        "intake_id":   ticket_input.intake_id,
        "source":      ticket_input.source,
        "subject":     ticket_input.subject,
        "transcript":  ticket_input.raw_content,
        "confidence":  stt_result["confidence"],
        "language":    stt_result["language"],
        "language_name": stt_result["language_name"],
        "duration_seconds": stt_result["duration"],
    }

    # dry_run = True: just return the transcript, skip AI pipeline + ticket creation.
    # Used when ChatView records voice and re-sends the transcript through
    # /chat/message — avoids running the pipeline twice and creating duplicate tickets.
    if dry_run:
        response_payload["message"] = "Transcribed — pass to chat for full response."
        return response_payload

    pipeline_result = await ai_pipeline.run(ticket_input.raw_content)
    nlp_result = pipeline_result["nlp"]

    response_payload["tier"] = pipeline_result["tier"]
    response_payload["nlp"] = {
        "category": nlp_result.category,
        "priority": nlp_result.priority,
        "severity": nlp_result.severity,
    }
    response_payload["ai_response"]   = pipeline_result["response"]
    response_payload["ai_confidence"] = pipeline_result["confidence"]

    if pipeline_result["should_create_ticket"]:
        log_gap(db, nlp_result, pipeline_result, source="call")
        ticket = create_ticket_from_input(db, ticket_input)
        response_payload["ticket_id"] = ticket.id
        response_payload["message"] = "Issue escalated — ticket created."
    else:
        response_payload["message"] = "AI resolved — no ticket needed."

    return response_payload

# ─────────────────────────────────────────
# POST /intake/email/poll
# ─────────────────────────────────────────
@router.post("/email/poll")
async def trigger_email_poll(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Manually trigger one IMAP poll cycle.

    Why does this exist?
    The imap_poller runs automatically every 60s in the background.
    But during development you don't want to wait 60s to test.
    Hit this endpoint in Swagger → instantly polls Gmail → processes emails.

    Only admin should use this in production.
    """
    logger.info(
        f"[INTAKE/EMAIL] Manual poll triggered by user_id={current_user.id}"
    )

    count = await poll_once(db)

    return {
        "status":          "ok",
        "emails_processed": count,
        "message":         f"Poll complete. {count} email(s) processed."
    }