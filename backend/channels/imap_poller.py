# backend/channels/imap_poller.py

import imaplib
import email as email_lib
from email import policy
import asyncio
import logging
from datetime import datetime

from backend.database import SessionLocal
from backend.services.ticket_service import create_ticket_from_input
from backend.channels.email_handler import parse_email
from backend.channels.normalizer import TicketInput

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────
# CONFIG  (move to config.py later)
# ─────────────────────────────────────────
IMAP_HOST     = "imap.gmail.com"
IMAP_PORT     = 993                  # SSL port
IMAP_USER     = "your@gmail.com"     # helpdesk Gmail account
IMAP_PASSWORD = "your_app_password"  # Gmail App Password (not your real password)
POLL_INTERVAL = 60                   # seconds between polls
MAILBOX       = "INBOX"


# ─────────────────────────────────────────
# STEP 1 — Connect to mailbox
# ─────────────────────────────────────────
def connect_imap() -> imaplib.IMAP4_SSL:
    """
    Open an SSL connection to the IMAP server.
    IMAP4_SSL handles TLS automatically on port 993.
    Returns a logged-in IMAP connection object.
    """
    conn = imaplib.IMAP4_SSL(IMAP_HOST, IMAP_PORT)
    conn.login(IMAP_USER, IMAP_PASSWORD)
    logger.info(f"[IMAP] Connected to {IMAP_HOST} as {IMAP_USER}")
    return conn


# ─────────────────────────────────────────
# STEP 2 — Fetch unread email IDs
# ─────────────────────────────────────────
def fetch_unread_ids(conn: imaplib.IMAP4_SSL) -> list[bytes]:
    """
    Select the mailbox and search for UNSEEN (unread) emails.
    Returns a list of email ID byte strings e.g. [b'1', b'2', b'5']
    """
    conn.select(MAILBOX)
    # UNSEEN = unread flag in IMAP protocol
    status, data = conn.search(None, "UNSEEN")
    if status != "OK" or not data[0]:
        return []
    # data[0] is a space-separated byte string of IDs: b'1 2 5'
    return data[0].split()


# ─────────────────────────────────────────
# STEP 3 — Fetch raw email by ID
# ─────────────────────────────────────────
def fetch_raw_email(conn: imaplib.IMAP4_SSL, email_id: bytes) -> str:
    """
    Fetch the full RFC-2822 raw email string for a given ID.
    RFC822 = fetch the entire message (headers + body).
    """
    status, data = conn.fetch(email_id, "(RFC822)")
    if status != "OK":
        raise Exception(f"Failed to fetch email ID {email_id}")
    # data[0][1] is the raw bytes of the full email
    raw_bytes = data[0][1]
    return raw_bytes.decode("utf-8", errors="replace")


# ─────────────────────────────────────────
# STEP 4 — Mark email as read
# ─────────────────────────────────────────
def mark_as_read(conn: imaplib.IMAP4_SSL, email_id: bytes):
    """
    Add the \\Seen flag so we don't process the same email twice.
    This is critical — without this the poller reprocesses every email
    on every poll cycle.
    """
    conn.store(email_id, "+FLAGS", "\\Seen")


# ─────────────────────────────────────────
# STEP 5 — Resolve sender email → user_id
# ─────────────────────────────────────────
def resolve_user_id(sender_email: str, db) -> int | None:
    """
    Look up the sender's email in the users table.
    Returns user_id if found, None if unknown sender.
    Unknown senders are skipped — we don't create tickets for
    people who aren't registered in the system.
    """
    from models.user import User
    user = db.query(User).filter(User.email == sender_email).first()
    return user.id if user else None


# ─────────────────────────────────────────
# STEP 6 — Extract sender from raw email
# ─────────────────────────────────────────
def extract_sender(raw_email: str) -> str:
    """
    Parse just the From header without processing the full email.
    We need this before calling parse_email() so we can resolve
    the user_id first.
    """
    msg = email_lib.message_from_string(raw_email, policy=policy.default)
    from_header = msg.get("from", "")
    # From header can be "Name <email@domain.com>" or just "email@domain.com"
    # email.utils.parseaddr extracts just the address part
    from email.utils import parseaddr
    _, addr = parseaddr(from_header)
    return addr.lower().strip()


# ─────────────────────────────────────────
# STEP 7 — Process a single email
# ─────────────────────────────────────────
def process_email(raw_email: str, db) -> TicketInput | None:
    """
    Full processing chain for one email:
    1. Extract sender address
    2. Resolve to a user_id in our DB
    3. Parse into TicketInput
    4. Return TicketInput (caller will pass to AI pipeline)
    """
    sender = extract_sender(raw_email)
    if not sender:
        logger.warning("[IMAP] Email with no sender — skipping")
        return None

    user_id = resolve_user_id(sender, db)
    if not user_id:
        logger.warning(f"[IMAP] Unknown sender {sender} — skipping")
        return None

    ticket_input = parse_email(raw_email, user_id)
    logger.info(f"[IMAP] Parsed email from {sender} → intake_id={ticket_input.intake_id}")
    return ticket_input


# ─────────────────────────────────────────
# STEP 8 — One full poll cycle
# ─────────────────────────────────────────
def poll_once(db) -> int:
    """
    Connect → fetch unread → process each → mark read → disconnect.
    Returns count of tickets created this cycle.
    Reconnects every cycle (safer than keeping a long-lived connection).
    """
    processed = 0
    conn = None

    try:
        conn = connect_imap()
        unread_ids = fetch_unread_ids(conn)

        if not unread_ids:
            logger.info("[IMAP] No new emails")
            return 0

        logger.info(f"[IMAP] Found {len(unread_ids)} unread email(s)")

        for email_id in unread_ids:
            try:
                raw = fetch_raw_email(conn, email_id)
                ticket_input = process_email(raw, db)

                if ticket_input:
                    # This will call the AI pipeline once it's wired up
                    # For now just log — we'll replace this with pipeline call
                    logger.info(f"[IMAP] TicketInput ready: {ticket_input.subject}")
                    # TODO: await ai_pipeline.run(ticket_input, db)
                    processed += 1

                mark_as_read(conn, email_id)

            except Exception as e:
                logger.error(f"[IMAP] Failed processing email {email_id}: {e}")
                continue  # don't crash the whole cycle for one bad email

    except Exception as e:
        logger.error(f"[IMAP] Poll cycle failed: {e}")

    finally:
        if conn:
            conn.logout()

    return processed


# ─────────────────────────────────────────
# STEP 9 — Continuous polling loop
# ─────────────────────────────────────────
async def start_poller():
    """
    Async loop that calls poll_once() every POLL_INTERVAL seconds.
    Runs as a background task — started in main.py on app startup.
    Uses asyncio.sleep so it doesn't block FastAPI's event loop.
    """
    logger.info(f"[IMAP] Poller started — checking every {POLL_INTERVAL}s")
    while True:
        db = SessionLocal()
        try:
            count = poll_once(db)
            if count:
                logger.info(f"[IMAP] Cycle complete — {count} ticket(s) queued")
        finally:
            db.close()

        await asyncio.sleep(POLL_INTERVAL)