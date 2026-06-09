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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/intake", tags=["intake"])


# ─────────────────────────────────────────
# POST /intake/call
# ─────────────────────────────────────────
@router.post("/call")
async def intake_call(
    audio: UploadFile = File(...),           # audio file from frontend
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Receive a call audio file from the frontend.

    Flow:
      1. Read audio bytes from upload
      2. stt_service transcribes audio → text
      3. Build call payload
      4. channel_router.ingest() → TicketInput
      5. Return TicketInput details (AI pipeline wired here later)

    Why is audio an UploadFile?
    FastAPI's UploadFile handles multipart/form-data uploads.
    The frontend sends the audio as a form field named "audio".
    """

    # Validate file type — only accept audio
    allowed_types = [
        "audio/wav", "audio/mpeg", "audio/mp4",
        "audio/webm", "audio/ogg", "audio/x-wav"
    ]
    if audio.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type: {audio.content_type}. Must be audio."
        )

    # Read bytes from upload
    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file")

    logger.info(
        f"[INTAKE/CALL] Received {audio.filename} "
        f"({len(audio_bytes)} bytes) from user_id={current_user.id}"
    )

    # Step 1: Transcribe audio → text
    stt_result = transcribe_audio(audio_bytes, audio.filename)

    logger.info(
        f"[INTAKE/CALL] Transcribed — confidence={stt_result['confidence']}, "
        f"duration={stt_result['duration']}s"
    )

    # Step 2: Build the payload call_handler expects
    call_payload = {
        "call_id":               f"call_{current_user.id}_{audio.filename}",
        "transcript":            stt_result["transcript"],
        "duration_seconds":      stt_result["duration"],
        "transcript_confidence": stt_result["confidence"],
    }

    # Step 3: channel_router normalizes → TicketInput
    ticket_input = ingest(
        source   = "call",
        payload  = call_payload,
        user_id  = current_user.id
    )

    logger.info(
        f"[INTAKE/CALL] TicketInput created — "
        f"intake_id={ticket_input.intake_id}, subject={ticket_input.subject}"
    )

    # Step 4: TODO — pass ticket_input to AI pipeline
    # response = await ai_pipeline.run(ticket_input, db)
    # For now return the normalized data so we can test in Swagger

    return {
        "status":      "received",
        "intake_id":   ticket_input.intake_id,
        "source":      ticket_input.source,
        "subject":     ticket_input.subject,
        "transcript":  ticket_input.raw_content,
        "confidence":  stt_result["confidence"],
        "message":     "Call received and transcribed. AI pipeline pending."
    }


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

    count = poll_once(db)

    return {
        "status":          "ok",
        "emails_processed": count,
        "message":         f"Poll complete. {count} email(s) processed."
    }