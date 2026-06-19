# backend/services/sla_service.py
#
# Phase 8 — SLA Escalation Agent
#
# Periodically checks open tickets against their sla_deadline.
# If a ticket has breached its SLA and isn't resolved:
#   - bump priority by one level (P4→P3→P2→P1, capped at P1)
#   - mark status as "escalated"
#   - log a TicketEvent (sla_escalated)
#
# Runs every CHECK_INTERVAL seconds via main.py's lifespan,
# same pattern as imap_poller.

import asyncio
import logging
from datetime import datetime
from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models.ticket import Ticket, TicketStatus, TicketPriority
from backend.models.ticket_event import EventAction, TicketEvent

logger = logging.getLogger(__name__)

CHECK_INTERVAL = 30  # 5 minutes

PRIORITY_ESCALATION = {
    TicketPriority.P4: TicketPriority.P3,
    TicketPriority.P3: TicketPriority.P2,
    TicketPriority.P2: TicketPriority.P1,
    TicketPriority.P1: TicketPriority.P1,  # already top
}

# Statuses considered "still open" — SLA applies
ACTIVE_STATUSES = [
    TicketStatus.open,
    TicketStatus.assigned,
]


def check_sla_breaches(db: Session) -> int:
    """
    Find tickets past their sla_deadline that are still active.
    Escalate priority + status, log event.
    Returns count of tickets escalated.
    """
    now = datetime.utcnow()

    breached = (
        db.query(Ticket)
        .filter(
            Ticket.sla_deadline.isnot(None),
            Ticket.sla_deadline < now,
            Ticket.status.in_(ACTIVE_STATUSES),
        )
        .all()
    )

    count = 0
    for ticket in breached:
        old_priority = ticket.priority
        old_status = ticket.status

        new_priority = PRIORITY_ESCALATION.get(ticket.priority, ticket.priority)

        ticket.priority = new_priority
        ticket.status = TicketStatus.escalated

        event = TicketEvent(
            ticket_id=ticket.id,
            action=EventAction.sla_escalated,
            actor_id=None,
            actor_label="SLA Escalation Agent",
            prev_status=str(old_status.value if hasattr(old_status, "value") else old_status),
            new_status=TicketStatus.escalated.value,
            prev_priority=str(old_priority.value if hasattr(old_priority, "value") else old_priority),
            new_priority=new_priority.value,
            notes=(
                f"SLA breached — deadline was {ticket.sla_deadline.isoformat()}. "
                f"Priority escalated {old_priority} → {new_priority}."
            ),
        )
        db.add(event)

        logger.warning(
            f"[SLA] Ticket {ticket.id[:8]} breached SLA — "
            f"priority {old_priority} → {new_priority}, status → escalated"
        )
        count += 1

    if count:
        db.commit()

    return count


async def start_sla_checker():
    """
    Background loop — checks SLA breaches every CHECK_INTERVAL seconds.
    Started in main.py's lifespan, same pattern as IMAP poller.
    """
    logger.info(f"[SLA] Checker started — checking every {CHECK_INTERVAL}s")

    while True:
        db = SessionLocal()
        try:
            count = check_sla_breaches(db)
            if count:
                logger.warning(f"[SLA] {count} ticket(s) escalated this cycle")
            else:
                logger.info("[SLA] No SLA breaches found")
        except Exception as e:
            logger.error(f"[SLA] Check cycle failed: {e}")
        finally:
            db.close()

        await asyncio.sleep(CHECK_INTERVAL)
