from sqlalchemy import Column, String, DateTime, Enum, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from backend.database import Base


class EventAction(str, enum.Enum):
    # lifecycle
    created         = "created"
    updated         = "updated"
    # AI actions
    ai_classified   = "ai_classified"
    ai_suggested    = "ai_suggested"
    ai_auto_solved  = "ai_auto_solved"
    # routing
    routed          = "routed"
    assigned        = "assigned"
    reassigned      = "reassigned"
    # human actions
    helpdesk_reviewed = "helpdesk_reviewed"
    reply_sent      = "reply_sent"
    escalated       = "escalated"
    # resolution
    resolved        = "resolved"
    reopened        = "reopened"
    closed          = "closed"
    # feedback
    csat_submitted  = "csat_submitted"
    # admin
    rollback        = "rollback"
    # sla
    sla_breach      = "sla_breach"
    sla_escalated   = "sla_escalated"


class TicketEvent(Base):
    """
    Append-only log of every action on a ticket.
    This is what powers:
    - Admin trackback dashboard (full lifecycle view)
    - Rollback (restore previous state from event history)
    - Audit trail (who did what and when)
    """
    __tablename__ = "ticket_events"

    id          = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ticket_id   = Column(String, ForeignKey("tickets.id"), nullable=False, index=True)

    action      = Column(Enum(EventAction), nullable=False)
    actor_id    = Column(String, ForeignKey("users.id"), nullable=True)  # null = AI
    actor_label = Column(String, nullable=True)  # "AI Router", "Helpdesk: John", "Admin: Sara"

    # snapshot of relevant fields at this moment (for rollback)
    prev_status    = Column(String, nullable=True)
    new_status     = Column(String, nullable=True)
    prev_assigned  = Column(String, nullable=True)
    new_assigned   = Column(String, nullable=True)
    prev_priority  = Column(String, nullable=True)
    new_priority   = Column(String, nullable=True)

    notes       = Column(Text, nullable=True)   # reason / comment
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)

    # relationships
    ticket      = relationship("Ticket", back_populates="events")
    actor_user  = relationship("User", back_populates="events")

    def __repr__(self):
        return f"<Event {self.action} on {self.ticket_id[:8]} by {self.actor_label}>"