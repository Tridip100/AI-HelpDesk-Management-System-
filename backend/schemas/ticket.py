from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime
from backend.models.ticket import TicketStatus, TicketPriority, TicketCategory, ResolutionPath
from backend.models.user import UserRole


# ════════════════════════════════════════════════
# REQUEST SHAPES  (what comes IN from React)
# ════════════════════════════════════════════════

class TicketCreateRequest(BaseModel):
    """
    What React sends when a user submits a new ticket.
    Only 3 fields — the user just describes their problem.
    Everything else (category, priority, AI suggestion) is filled by the backend.
    """
    title:       str
    description: str
    channel:     str = "web"   # web / email / chat / voice


class TicketUpdateRequest(BaseModel):
    """
    What the helpdesk member sends after reviewing the AI card.
    Every field is Optional — they only send what they changed.

    Example: member only changed the priority:
    { "priority": "P2" }

    Example: member edited the draft reply:
    { "ai_draft_reply": "Hi Alice, please try restarting..." }
    """
    category:      Optional[TicketCategory] = None
    priority:      Optional[TicketPriority] = None
    ai_suggestion: Optional[str]            = None
    ai_draft_reply: Optional[str]           = None
    resolution_text: Optional[str]          = None
    status:        Optional[TicketStatus]   = None
    notes:         Optional[str]            = None


class TicketAssignRequest(BaseModel):
    """
    Helpdesk or admin manually assigns a ticket to a specific engineer.
    engineer_id must be a valid user ID with role=engineer.
    """
    engineer_id: str
    notes:       Optional[str] = None


class TicketResolveRequest(BaseModel):
    """
    Helpdesk member or engineer marks ticket as resolved.
    Must provide what the resolution was — stored for knowledge base.
    """
    resolution_text: str
    notes:           Optional[str] = None


class TicketReopenRequest(BaseModel):
    """
    User says the fix didn't work — reopens the ticket.
    reason is optional but encouraged.
    """
    reason: Optional[str] = None


class RollbackRequest(BaseModel):
    """
    Admin only.
    Rolls the ticket back to the state it was in just before the target event.
    event_id: the ID of the event you want to undo.
    reason:   required — admin must explain why they are rolling back.
    """
    event_id: str
    reason:   str


class CSATRequest(BaseModel):
    """
    User submits satisfaction rating after ticket is resolved.
    score: 1 (terrible) to 5 (excellent)
    comment: optional text feedback
    """
    score:   float
    comment: Optional[str] = None

    @field_validator("score")
    @classmethod
    def score_must_be_valid(cls, v):
        if not 1 <= v <= 5:
            raise ValueError("Score must be between 1 and 5")
        return v


class AutoSolveResponseRequest(BaseModel):
    """
    After AI auto-solves a ticket (Path A), the user confirms:
    did_it_work: True  → ticket closes, CSAT prompt shown
    did_it_work: False → ticket escalates to helpdesk (Path B)
    """
    did_it_work: bool
    comment:     Optional[str] = None


# ════════════════════════════════════════════════
# RESPONSE SHAPES  (what goes OUT to React)
# ════════════════════════════════════════════════

class TicketEventOut(BaseModel):
    """
    A single event in the ticket's audit trail / timeline.
    React uses this to render the full ticket history.

    Example:
    {
        "action": "assigned",
        "actor_label": "helpdesk: bob",
        "prev_status": "reviewing",
        "new_status": "assigned",
        "new_assigned": "charlie-engineer-id",
        "notes": "Assigned to Charlie — network issue",
        "created_at": "2024-01-01T10:05:00"
    }
    """
    id:            str
    action:        str
    actor_label:   Optional[str]
    prev_status:   Optional[str]
    new_status:    Optional[str]
    prev_assigned: Optional[str]
    new_assigned:  Optional[str]
    prev_priority: Optional[str]
    new_priority:  Optional[str]
    notes:         Optional[str]
    created_at:    datetime

    class Config:
        from_attributes = True


class TicketOut(BaseModel):
    """
    Full ticket object sent to React.
    Includes the complete event history so React can render the timeline.

    What each role sees in React is filtered on the FRONTEND
    using the role stored in the JWT token — not here.
    Here we send everything, React decides what to display.
    """
    id:              str
    title:           str
    description:     str
    channel:         str

    # AI output fields
    category:        Optional[TicketCategory]
    priority:        TicketPriority
    sentiment_score: Optional[float]    # -1 to 1, filled by AI
    ai_confidence:   Optional[float]    # 0 to 1, filled by AI
    ai_suggestion:   Optional[str]      # suggested fix, filled by AI
    ai_draft_reply:  Optional[str]      # draft reply, filled by AI

    # routing
    resolution_path: Optional[ResolutionPath]  # auto_solve / helpdesk / engineer
    status:          TicketStatus

    # resolution
    resolution_text:  Optional[str]
    resolved_by_path: Optional[ResolutionPath]
    resolved_at:      Optional[datetime]

    # feedback
    csat_score:   Optional[float]
    csat_comment: Optional[str]

    # incident grouping
    parent_ticket_id: Optional[str]
    is_incident:      bool

    # people — just IDs here, use TicketDetailOut for full user objects
    created_by:  str
    assigned_to: Optional[str]

    # timestamps
    created_at:   datetime
    updated_at:   datetime
    sla_deadline: Optional[datetime]

    # full event log — the audit trail / rollback history
    events: List[TicketEventOut] = []

    class Config:
        from_attributes = True


class TicketDetailOut(BaseModel):
    """
    Same as TicketOut but with full user objects embedded.
    Used on the ticket detail page where you want to show
    "Created by: Alice Normal" and "Assigned to: Charlie Engineer"
    instead of just raw IDs.
    """
    id:              str
    title:           str
    description:     str
    channel:         str
    category:        Optional[TicketCategory]
    priority:        TicketPriority
    sentiment_score: Optional[float]
    ai_confidence:   Optional[float]
    ai_suggestion:   Optional[str]
    ai_draft_reply:  Optional[str]
    resolution_path: Optional[ResolutionPath]
    status:          TicketStatus
    resolution_text: Optional[str]
    resolved_by_path: Optional[ResolutionPath]
    resolved_at:     Optional[datetime]
    csat_score:      Optional[float]
    csat_comment:    Optional[str]
    parent_ticket_id: Optional[str]
    is_incident:     bool
    created_at:      datetime
    updated_at:      datetime
    sla_deadline:    Optional[datetime]
    events:          List[TicketEventOut] = []

    # embedded user objects instead of raw IDs
    created_by_user:  Optional[dict] = None   # UserBrief shape
    assigned_to_user: Optional[dict] = None   # UserBrief shape

    class Config:
        from_attributes = True


class TicketListOut(BaseModel):
    """
    Minimal ticket info for list views — dashboard, queue, etc.
    Don't send the full event history here — too much data for a list.
    """
    id:              str
    title:           str
    category:        Optional[TicketCategory]
    priority:        TicketPriority
    status:          TicketStatus
    ai_confidence:   Optional[float]
    resolution_path: Optional[ResolutionPath]
    created_by:      str
    assigned_to:     Optional[str]
    created_at:      datetime
    sla_deadline:    Optional[datetime]
    csat_score:      Optional[float]

    class Config:
        from_attributes = True