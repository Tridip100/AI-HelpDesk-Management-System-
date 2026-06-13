# backend/services/stt_service.py

import whisper
import tempfile
import os
import logging
from pathlib import Path
import math

logger = logging.getLogger(__name__)

# "small" — good balance of speed/accuracy, multilingual
MODEL = whisper.load_model("small")

# Common IT terms — helps Whisper recognize technical vocabulary
# regardless of source language
IT_PROMPT = """
IT support helpdesk conversation.
Common technical terms: VPN, WiFi, Windows, Outlook, Email, Laptop,
Desktop, Printer, Network, Login, Password, Server, Internet,
Microsoft, Teams, Zoom, Firewall, Router.
"""


def transcribe_audio(audio_bytes: bytes, filename: str, language: str = None) -> dict:
    """
    Transcribe audio bytes to ENGLISH text using Whisper.

    Uses task="translate" — Whisper auto-detects spoken language
    (Hindi, Bengali, Tamil, etc.) and outputs ENGLISH text directly.
    This means NLP/LLM (English-trained) always receive English,
    regardless of what language the user spoke.

    Args:
        language: optional ISO code to force a specific source
                  language (e.g. "hi" for Hindi). None = auto-detect.

    Returns:
        {
            "transcript":       "English text...",
            "confidence":       0.91,
            "confidence_level": "high"|"medium"|"low",
            "language":         "hi",          # detected SOURCE language
            "language_name":    "hindi",
            "duration":         45.3,
            "needs_review":     False
        }
    """
    suffix = Path(filename).suffix or ".wav"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        logger.info(f"[STT] Transcribing {filename} ({len(audio_bytes)} bytes)")

        options = {
            "verbose": False,
            "task": "translate",     # ← always output English
            "initial_prompt": IT_PROMPT,
        }

        # Only force source language if explicitly given
        # Otherwise Whisper auto-detects it (Hindi, Bengali, etc.)
        if language:
            options["language"] = language
            logger.info(f"[STT] Forced source language: {language}")
        else:
            logger.info("[STT] Auto-detecting source language...")

        result = whisper.transcribe(MODEL, tmp_path, **options)

        transcript      = result["text"].strip()
        detected_lang   = result.get("language", "unknown")

        segments = result.get("segments", [])

        if segments:
            avg_logprob = sum(seg["avg_logprob"] for seg in segments) / len(segments)
            confidence = round(math.exp(avg_logprob), 3)

            for seg in segments:
                logger.debug(
                    f"[STT] Segment: {seg['text']} (avg_logprob={seg['avg_logprob']:.3f})"
                )
        else:
            confidence = 1.0

        duration = segments[-1]["end"] if segments else 0.0

        if confidence >= 0.70:
            confidence_level = "high"
        elif confidence >= 0.40:
            confidence_level = "medium"
        else:
            confidence_level = "low"

        needs_review = confidence < 0.40

        logger.info(
            f"[STT] Done — language={detected_lang}, "
            f"{len(transcript)} chars, confidence={confidence}, "
            f"level={confidence_level}, needs_review={needs_review}"
        )

        return {
            "transcript":       transcript,
            "confidence":       confidence,
            "confidence_level": confidence_level,
            "language":         detected_lang,
            "language_name":    whisper.tokenizer.LANGUAGES.get(detected_lang, detected_lang),
            "duration":         round(duration, 1),
            "needs_review":     needs_review,
        }

    finally:
        os.unlink(tmp_path)
        logger.info("[STT] Temp file deleted — audio not stored")


def transcribe_file_path(file_path: str, language: str = None) -> dict:
    """Convenience function for testing with a file path."""
    with open(file_path, "rb") as f:
        audio_bytes = f.read()
    return transcribe_audio(audio_bytes, Path(file_path).name, language)