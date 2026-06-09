# backend/channels/channel_router.py

from .normalizer import TicketInput
from .email_handler import parse_email
from .chat_handler  import parse_chat
from .call_handler  import parse_call

def ingest(source: str, payload: dict | str, user_id: int) -> TicketInput:
    """
    Single entry point for all channels.
    source: "email" | "chat" | "call"
    payload: raw data from that channel
    """
    if source == "email":
        return parse_email(payload, user_id)
    elif source == "chat":
        return parse_chat(payload, user_id)
    elif source == "call":
        return parse_call(payload, user_id)
    else:
        raise ValueError(f"Unknown channel source: {source}")