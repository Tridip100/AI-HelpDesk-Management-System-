# backend/services/stt_service.py
#
# WHAT THIS FILE DOES:
# Takes an audio file, runs it through Whisper locally,
# returns plain text transcript + confidence score.
# This is the ONLY file in the entire project that touches audio.
# Everything else only sees text.

import whisper
import tempfile
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Load model once at module level — not on every request.
# "base" is fast and good enough for helpdesk audio.
# Options: tiny, base, small, medium, large
# Larger = more accurate but slower.
# For production use "small" or "medium".
MODEL = whisper.load_model("base")


def transcribe_audio(audio_bytes: bytes, filename: str) -> dict:
    """
    Transcribe audio bytes to text using Whisper.

    Why bytes and not a file path?
    Because FastAPI gives us UploadFile which is bytes in memory.
    We write it to a temp file, Whisper reads it, we delete it.
    The audio never gets permanently stored — privacy by design.

    Returns:
        {
            "transcript": "User: My VPN isn't working...",
            "confidence": 0.91,       # average token probability
            "language":   "en",
            "duration":   45.3        # seconds
        }
    """
    # Write bytes to a temporary file
    # Whisper needs a file path — it can't read raw bytes directly
    suffix = Path(filename).suffix or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(audio_bytes)
        tmp_path = tmp.name

    try:
        logger.info(f"[STT] Transcribing {filename} ({len(audio_bytes)} bytes)")

        # Run Whisper transcription
        # verbose=False suppresses Whisper's own logging
        result = whisper.transcribe(MODEL, tmp_path, verbose=False)

        transcript = result["text"].strip()
        language   = result.get("language", "en")

        # Calculate average confidence from segment probabilities
        # Whisper returns per-segment avg_logprob (log probability)
        # We convert to a 0–1 confidence score
        segments = result.get("segments", [])
        if segments:
            import math
            avg_logprob = sum(s["avg_logprob"] for s in segments) / len(segments)
            # logprob is negative — closer to 0 = more confident
            # e^avg_logprob gives a 0–1 probability
            confidence = round(math.exp(avg_logprob), 3)
        else:
            confidence = 1.0  # short clips often have no segments

        # Duration from last segment end time
        duration = segments[-1]["end"] if segments else 0.0

        logger.info(f"[STT] Done — {len(transcript)} chars, confidence={confidence}")

        return {
            "transcript": transcript,
            "confidence": confidence,
            "language":   language,
            "duration":   round(duration, 1)
        }

    finally:
        # Always delete temp file — audio never persists on disk
        os.unlink(tmp_path)
        logger.info(f"[STT] Temp file deleted — audio not stored")


def transcribe_file_path(file_path: str) -> dict:
    """
    Convenience function when you already have a file on disk.
    Used for testing — pass a .wav or .mp3 path directly.
    """
    with open(file_path, "rb") as f:
        audio_bytes = f.read()
    return transcribe_audio(audio_bytes, Path(file_path).name)