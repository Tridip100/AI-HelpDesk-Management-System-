import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.models import user, ticket, ticket_event, knowledge_gap  # registers all models

from datetime import datetime, timedelta
from backend.database import SessionLocal
from backend.models.ticket import Ticket, TicketPriority, TicketStatus
from backend.services.sla_service import check_sla_breaches

db = SessionLocal()

ticket_obj = db.query(Ticket).filter(Ticket.status.in_([
    TicketStatus.open, TicketStatus.ai_pending, TicketStatus.reviewing,
    TicketStatus.assigned, TicketStatus.in_progress
])).first()

if not ticket_obj:
    print("No active ticket found — create one first via chat/email.")
else:
    print(f"Before: ticket={ticket_obj.id[:8]} priority={ticket_obj.priority} status={ticket_obj.status} sla_deadline={ticket_obj.sla_deadline}")
    ticket_obj.sla_deadline = datetime.utcnow() - timedelta(hours=1)
    db.commit()

    count = check_sla_breaches(db)
    print(f"Escalated count: {count}")

    db.refresh(ticket_obj)
    print(f"After:  ticket={ticket_obj.id[:8]} priority={ticket_obj.priority} status={ticket_obj.status}")

db.close()