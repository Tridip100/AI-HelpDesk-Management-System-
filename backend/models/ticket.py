from sqlalchemy import Column, String, Boolean, DateTime, Enum, Float, Text, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum

from backend.database import Base


class TicketStatus(str, enum.Enum):
    open        = "open"        # just created
    ai_pending  = "ai_pending"  # AI is processing
    auto_solved = "auto_solved" # AI solved it directly with user
    reviewing   = "reviewing"   # helpdesk member reviewing AI card
    assigned    = "assigned"    # assigned to an engineer
    in_progress = "in_progress" # engineer is working on it
    resolved    = "resolved"    # closed and resolved
    closed      = "closed"      # closed without resolution
    reopened    = "reopened"    # user said it wasn't fixed


class TicketPriority(str, enum.Enum):
    P1 = "P1"  # critical — whole company affected
    P2 = "P2"  # high — team affected
    P3 = "P3"  # medium — single user affected, work blocked
    P4 = "P4"  # low — minor issue, workaround exists


class TicketCategory(str, enum.Enum):
    network     = "network"
    auth        = "auth"        # login, password, access
    hardware    = "hardware"
    database    = "database"
    cloud_app   = "cloud_app"
    software    = "software"
    security    = "security"
    hr_it       = "hr_it"       # onboarding, offboarding
    other       = "other"


class ResolutionPath(str, enum.Enum):
    auto_solve  = "auto_solve"  # AI solved directly with user
    helpdesk    = "helpdesk"    # helpdesk member resolved
    engineer    = "engineer"    # engineer resolved


class Ticket(Base):
    __tablename__ = "tickets"

    id              = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title           = Column(String, nullable=False)
    description     = Column(Text, nullable=False)
    channel         = Column(String, default="web")  # web / email / chat / voice

    # classification (filled by AI)
    category        = Column(Enum(TicketCategory), nullable=True)
    priority        = Column(Enum(TicketPriority), default=TicketPriority.P3)
    sentiment_score = Column(Float, nullable=True)   # -1 to 1
    ai_confidence   = Column(Float, nullable=True)   # 0 to 1

    # AI output
    ai_suggestion   = Column(Text, nullable=True)    # suggested fix
    ai_draft_reply  = Column(Text, nullable=True)    # draft reply to user
    similar_ticket_ids = Column(String, nullable=True)  # comma-separated IDs

    # routing
    resolution_path = Column(Enum(ResolutionPath), nullable=True)
    status          = Column(Enum(TicketStatus), default=TicketStatus.open)

    # resolution
    resolution_text = Column(Text, nullable=True)
    resolved_by_path = Column(Enum(ResolutionPath), nullable=True)
    resolved_at     = Column(DateTime, nullable=True)

    # CSAT feedback
    csat_score      = Column(Float, nullable=True)   # 1–5
    csat_comment    = Column(Text, nullable=True)

    # linked tickets (duplicate detection)
    parent_ticket_id = Column(String, ForeignKey("tickets.id"), nullable=True)
    is_incident      = Column(Boolean, default=False)  # mass incident parent

    # people
    created_by      = Column(String, ForeignKey("users.id"), nullable=False)
    assigned_to     = Column(String, ForeignKey("users.id"), nullable=True)

    # timestamps
    created_at      = Column(DateTime, default=datetime.utcnow)
    updated_at      = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sla_deadline    = Column(DateTime, nullable=True)

    # relationships
    created_by_user  = relationship("User", back_populates="tickets_raised",
                                    foreign_keys=[created_by])
    assigned_to_user = relationship("User", back_populates="tickets_assigned",
                                    foreign_keys=[assigned_to])
    events           = relationship("TicketEvent", back_populates="ticket",
                                    order_by="TicketEvent.created_at")
    children         = relationship("Ticket", foreign_keys=[parent_ticket_id])

    def __repr__(self):
        return f"<Ticket {self.id[:8]} [{self.status}] P={self.priority}>"