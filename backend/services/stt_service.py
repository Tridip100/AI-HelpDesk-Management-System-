# backend/services/stt_service.py

import whisper
import tempfile
import os
import logging
from pathlib import Path
import math

logger = logging.getLogger(__name__)

# Better accuracy than "base"
# Options: tiny, base, small, medium, large
MODEL = whisper.load_model("small")


def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Transcribe audio bytes to text using Whisper.

    Returns:
        {
            "transcript": "...",
            "confidence": 0.91,
            "language": "en",
            "duration": 45.3,
            "needs_review": False
        }
    """

    suffix = Path(filename).suffix or ".wav"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        logger.info(
            f"[STT] Transcribing {filename} ({len(audio_bytes)} bytes)"
        )

        result = whisper.transcribe(
            MODEL,
            tmp_path,
            verbose=False,
            language="en",
            initial_prompt="""
            IT support helpdesk conversation.

            Common technical terms:
            VPN
            WiFi
            Windows
            Outlook
            Email
            Laptop
            Desktop
            Printer
            Network
            Login
            Password
            Server
            Internet
            Microsoft
            Teams
            Zoom
            Firewall
            Router
            """
        )

        transcript = result["text"].strip()
        language = result.get("language", "en")

        segments = result.get("segments", [])

        if segments:
            avg_logprob = (
                sum(seg["avg_logprob"] for seg in segments)
                / len(segments)
            )

            confidence = round(math.exp(avg_logprob), 3)

            # Optional debugging
            for seg in segments:
                logger.debug(
                    f"[STT] Segment: {seg['text']} "
                    f"(avg_logprob={seg['avg_logprob']:.3f})"
                )

        else:
            confidence = 1.0

        # Duration from last segment end time
        duration = segments[-1]["end"] if segments else 0.0

        # Human-friendly confidence level
        if confidence >= 0.70:
            confidence_level = "high"
        elif confidence >= 0.40:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        # Flag only very uncertain transcripts
        needs_review = confidence < 0.40

        logger.info(
            f"[STT] Done — {len(transcript)} chars, "
            f"confidence={confidence}, "
            f"level={confidence_level}, "
            f"needs_review={needs_review}"
        )

        return {
            "transcript": transcript,
            "confidence": confidence,
            "confidence_level": confidence_level,
            "language": language,
            "duration": round(duration, 1),
            "needs_review": needs_review,
        }

    finally:
        os.unlink(tmp_path)
        logger.info(
            "[STT] Temp file deleted — audio not stored"
        )


def transcribe_file_path(file_path: str) -> dict:
    """
    Convenience function for testing.
    """

    with open(file_path, "rb") as f:
        audio_bytes = f.read()

    return transcribe_audio(
        audio_bytes,
        Path(file_path).name
    )