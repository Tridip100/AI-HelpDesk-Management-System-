# backend/channels/email_handler.py

import email as email_lib
from email import policy
from .normalizer import TicketInput, ChannelSource

def parse_email(raw_email: str, user_id: int) -> TicketInput:
    """
    Parse a raw RFC-2822 email string into a TicketInput.
    In production this would be called by a mailbox poller (IMAP/webhook).
    """
    msg = email_lib.message_from_string(raw_email, policy=policy.default)

    subject = msg.get("subject", "No subject").strip()
    sender  = msg.get("from", "unknown")

    # Extract plain-text body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                body = part.get_content()
                break
    else:
        body = msg.get_content()

    # Collect attachments (filename only — actual storage handled separately)
    attachments = []
    for part in msg.walk():
        disposition = part.get_content_disposition()
        if disposition == "attachment":
            fname = part.get_filename()
            if fname:
                attachments.append(fname)

    return TicketInput(
        source      = "email",
        user_id     = user_id,
        raw_content = body.strip(),
        subject     = subject,
        attachments = attachments,
        metadata    = {
            "from": sender,
            "cc":   msg.get("cc", ""),
            "message_id": msg.get("message-id", ""),
        }
    )