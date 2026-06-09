# backend/channels/call_handler.py

from .normalizer import TicketInput

def parse_call(payload: dict, user_id: int) -> TicketInput:
    """
    payload shape:
    {
        "call_id":              "call_xyz",
        "duration_seconds":     240,
        "transcript":           "Agent: Hi how can I help?\nUser: My laptop won't boot...",
        "transcript_confidence": 0.94
    }
    """
    transcript  = payload.get("transcript", "")
    call_id     = payload.get("call_id", "")
    duration    = payload.get("duration_seconds", 0)
    confidence  = payload.get("transcript_confidence", 1.0)

    # Extract first user line as subject
    subject = "Call support request"
    for line in transcript.splitlines():
        if line.lower().startswith("user:"):
            subject = line[5:].strip()[:80]
            break

    return TicketInput(
        source      = "call",
        user_id     = user_id,
        raw_content = transcript,
        subject     = subject,
        metadata    = {
            "call_id":    call_id,
            "duration_seconds": duration,
            "transcript_confidence": confidence,
        }
    )