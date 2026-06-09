# backend/channels/chat_handler.py

from .normalizer import TicketInput

def parse_chat(payload: dict, user_id: int) -> TicketInput:
    """
    payload shape expected from frontend:
    {
        "session_id": "abc123",
        "messages": [
            {"role": "user", "text": "My VPN is broken"},
            {"role": "bot",  "text": "Can you describe the error?"},
            {"role": "user", "text": "It says authentication failed"}
        ]
    }
    """
    session_id = payload.get("session_id", "")
    messages   = payload.get("messages", [])

    # Concatenate full conversation as raw_content
    transcript = "\n".join(
        f"{m['role'].upper()}: {m['text']}"
        for m in messages
    )

    # Subject = first user message (truncated)
    first_user = next(
        (m["text"] for m in messages if m["role"] == "user"), 
        "Chat support request"
    )
    subject = first_user[:80] + ("..." if len(first_user) > 80 else "")

    return TicketInput(
        source      = "chat",
        user_id     = user_id,
        raw_content = transcript,
        subject     = subject,
        metadata    = {"session_id": session_id, "message_count": len(messages)}
    )