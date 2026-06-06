from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.models.ticket import Ticket, TicketStatus, TicketCategory, TicketPriority
from backend.models.ticket_event import EventAction
from backend.schemas.ticket import (
    TicketCreateRequest, TicketUpdateRequest, TicketAssignRequest,
    TicketResolveRequest, RollbackRequest, CSATRequest, TicketOut
)
from backend.middleware.rbac import (
    current_user_any, current_user_helpdesk_or_above,
    current_user_engineer_or_above, current_user_admin
)
from backend.services.ticket_service import (
    create_ticket, apply_ai_classification, assign_to_engineer,
    resolve_ticket, rollback_ticket, log_event, get_tickets_for_user
)
from backend.services.routing_service import decide_routing_path, find_best_engineer

router = APIRouter(prefix="/tickets", tags=["tickets"])


@router.post("/", response_model=TicketOut, status_code=201)
def submit_ticket(
    req: TicketCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_any)
):
    """
    Any logged-in user can submit a ticket.
    AI classification runs immediately after creation (stub for now,
    real NLP pipeline plugs in here in Phase 2 of build).
    """
    ticket = create_ticket(db, req.title, req.description, req.channel, current_user)

    # ── AI classification stub ──────────────────────────────
    # In week 2 of build, replace this with real BERT + VADER + RAG call.
    # For now, we simulate with dummy values so the full flow works end to end.
    stub_confidence = 0.72
    stub_category = TicketCategory.software
    stub_priority = TicketPriority.P3
    stub_sentiment = -0.2
    stub_suggestion = "Please try restarting the application. If the issue persists, clear the app cache from Settings > Storage."
    stub_reply = f"Hi {current_user.full_name}, thanks for reaching out! Please try restarting the application first. Let us know if that resolves it."
    stub_similar = []

    routing_path = decide_routing_path(stub_category, stub_priority, stub_confidence)

    ticket = apply_ai_classification(
        db, ticket,
        category=stub_category,
        priority=stub_priority,
        sentiment_score=stub_sentiment,
        ai_confidence=stub_confidence,
        ai_suggestion=stub_suggestion,
        ai_draft_reply=stub_reply,
        similar_ids=stub_similar,
        resolution_path=routing_path,
    )

    # if routed to engineer, auto-assign to least-busy engineer
    if routing_path.value == "engineer":
        engineer = find_best_engineer(db, stub_category)
        if engineer:
            assign_to_engineer(db, ticket, engineer, assigned_by=None, 
                             notes="Auto-assigned by AI routing agent")

    db.refresh(ticket)
    return ticket


@router.get("/", response_model=List[TicketOut])
def list_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_any)
):
    """
    Returns tickets based on role:
    - user: only their own tickets
    - engineer: only tickets assigned to them
    - helpdesk/admin: all tickets
    """
    return get_tickets_for_user(db, current_user)


@router.get("/{ticket_id}", response_model=TicketOut)
def get_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_any)
):
    """Get a single ticket. Users can only see their own."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # access control: normal users can only see their own tickets
    if current_user.role == UserRole.user and ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    # engineers can only see their assigned tickets
    if current_user.role == UserRole.engineer and ticket.assigned_to != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    return ticket


@router.patch("/{ticket_id}/review", response_model=TicketOut)
def helpdesk_review(
    ticket_id: str,
    req: TicketUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_helpdesk_or_above)
):
    """
    Helpdesk member edits the AI card (category, priority, reply)
    and approves. All edits are logged.
    """
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    changes = []
    if req.category and req.category != ticket.category:
        changes.append(f"category: {ticket.category} → {req.category}")
        ticket.category = req.category
    if req.priority and req.priority != ticket.priority:
        changes.append(f"priority: {ticket.priority} → {req.priority}")
        ticket.priority = req.priority
    if req.ai_suggestion:
        ticket.ai_suggestion = req.ai_suggestion
    if req.ai_draft_reply:
        ticket.ai_draft_reply = req.ai_draft_reply
    if req.status:
        ticket.status = req.status

    log_event(
        db, ticket.id,
        action=EventAction.helpdesk_reviewed,
        actor=current_user,
        notes=f"Reviewed AI card. Changes: {', '.join(changes) or 'none'}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/assign", response_model=TicketOut)
def assign_ticket(
    ticket_id: str,
    req: TicketAssignRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_helpdesk_or_above)
):
    """Helpdesk or admin assigns a ticket to a specific engineer."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    engineer = db.query(User).filter(
        User.id == req.engineer_id,
        User.role == UserRole.engineer
    ).first()
    if not engineer:
        raise HTTPException(status_code=404, detail="Engineer not found")

    return assign_to_engineer(db, ticket, engineer, current_user, req.notes)


@router.post("/{ticket_id}/resolve", response_model=TicketOut)
def resolve(
    ticket_id: str,
    req: TicketResolveRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_helpdesk_or_above)
):
    """Helpdesk member or engineer marks a ticket as resolved."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    return resolve_ticket(db, ticket, req.resolution_text, current_user, req.notes)


@router.post("/{ticket_id}/reopen", response_model=TicketOut)
def reopen_ticket(
    ticket_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_any)
):
    """User says the resolution didn't work — reopens the ticket."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # users can only reopen their own tickets
    if current_user.role == UserRole.user and ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    prev_status = ticket.status
    ticket.status = TicketStatus.reopened
    ticket.resolved_at = None

    log_event(db, ticket.id, action=EventAction.reopened,
              actor=current_user, prev_status=str(prev_status),
              new_status=TicketStatus.reopened,
              notes="User indicated issue was not resolved")
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{ticket_id}/rollback", response_model=TicketOut)
def rollback(
    ticket_id: str,
    req: RollbackRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_admin)
):
    """Admin only — rollback ticket to a previous state."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    try:
        return rollback_ticket(db, ticket, req.event_id, current_user, req.reason)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/{ticket_id}/feedback", response_model=TicketOut)
def submit_feedback(
    ticket_id: str,
    req: CSATRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(current_user_any)
):
    """User submits CSAT feedback after ticket is resolved."""
    ticket = db.query(Ticket).filter(Ticket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    if ticket.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="You can only rate your own tickets")

    if ticket.status != TicketStatus.resolved:
        raise HTTPException(status_code=400, detail="Ticket must be resolved before rating")

    if not 1 <= req.score <= 5:
        raise HTTPException(status_code=400, detail="Score must be between 1 and 5")

    ticket.csat_score = req.score
    ticket.csat_comment = req.comment

    log_event(db, ticket.id, action=EventAction.csat_submitted,
              actor=current_user,
              notes=f"CSAT: {req.score}/5. Comment: {req.comment or 'none'}")
    db.commit()
    db.refresh(ticket)
    return ticket