from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from backend.models.ticket import TicketStatus, TicketPriority, TicketCategory, ResolutionPath


class TicketCreateRequest(BaseModel):
    title: str
    description: str
    channel: str = "web"


class TicketUpdateRequest(BaseModel):
    """Helpdesk member edits before approving"""
    category: Optional[TicketCategory] = None
    priority: Optional[TicketPriority] = None
    ai_suggestion: Optional[str] = None
    ai_draft_reply: Optional[str] = None
    resolution_text: Optional[str] = None
    status: Optional[TicketStatus] = None
    notes: Optional[str] = None


class TicketAssignRequest(BaseModel):
    engineer_id: str
    notes: Optional[str] = None


class TicketResolveRequest(BaseModel):
    resolution_text: str
    notes: Optional[str] = None


class RollbackRequest(BaseModel):
    """Admin only — rollback to a previous event state"""
    event_id: str       # roll back to the state just before this event
    reason: str


class CSATRequest(BaseModel):
    score: float        # 1–5
    comment: Optional[str] = None


# ── Response shapes ──────────────────────────────

class UserBrief(BaseModel):
    id: str
    username: str
    full_name: str
    role: str

    class Config:
        from_attributes = True


class TicketEventOut(BaseModel):
    id: str
    action: str
    actor_label: Optional[str]
    prev_status: Optional[str]
    new_status: Optional[str]
    prev_assigned: Optional[str]
    new_assigned: Optional[str]
    notes: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    id: str
    title: str
    description: str
    channel: str
    category: Optional[TicketCategory]
    priority: TicketPriority
    sentiment_score: Optional[float]
    ai_confidence: Optional[float]
    ai_suggestion: Optional[str]
    ai_draft_reply: Optional[str]
    resolution_path: Optional[ResolutionPath]
    status: TicketStatus
    resolution_text: Optional[str]
    resolved_at: Optional[datetime]
    csat_score: Optional[float]
    created_by: str
    assigned_to: Optional[str]
    created_at: datetime
    updated_at: datetime
    sla_deadline: Optional[datetime]
    events: List[TicketEventOut] = []

    class Config:
        from_attributes = True