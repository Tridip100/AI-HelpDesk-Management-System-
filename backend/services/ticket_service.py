from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List
import uuid

from backend.models.ticket import Ticket, TicketStatus, TicketPriority, TicketCategory, ResolutionPath
from backend.models.ticket_event import TicketEvent, EventAction
from backend.models.user import User, UserRole


# SLA deadlines per priority
SLA_HOURS = {
    TicketPriority.P1: 1,
    TicketPriority.P2: 4,
    TicketPriority.P3: 8,
    TicketPriority.P4: 24,
}


def log_event(
    db: Session,
    ticket_id: str,
    action: EventAction,
    actor: Optional[User] = None,
    actor_label: Optional[str] = None,
    prev_status: Optional[str] = None,
    new_status: Optional[str] = None,
    prev_assigned: Optional[str] = None,
    new_assigned: Optional[str] = None,
    prev_priority: Optional[str] = None,
    new_priority: Optional[str] = None,
    notes: Optional[str] = None,
):
    """Append a new event to the ticket audit trail."""
    event = TicketEvent(
        ticket_id=ticket_id,
        action=action,
        actor_id=actor.id if actor else None,
        actor_label=actor_label or (f"{actor.role.value}: {actor.username}" if actor else "AI System"),
        prev_status=prev_status,
        new_status=new_status,
        prev_assigned=prev_assigned,
        new_assigned=new_assigned,
        prev_priority=prev_priority,
        new_priority=new_priority,
        notes=notes,
    )
    db.add(event)
    return event


def create_ticket(db: Session, title: str, description: str,
                  channel: str, created_by: User) -> Ticket:
    """Create a new ticket and log the creation event."""
    ticket = Ticket(
        title=title,
        description=description,
        channel=channel,
        created_by=created_by.id,
        status=TicketStatus.ai_pending,
        sla_deadline=datetime.utcnow() + timedelta(hours=SLA_HOURS[TicketPriority.P3]),
    )
    db.add(ticket)
    db.flush()  # get the ID without committing

    log_event(
        db, ticket.id,
        action=EventAction.created,
        actor=created_by,
        new_status=TicketStatus.ai_pending,
        notes=f"Ticket submitted via {channel}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def apply_ai_classification(
    db: Session,
    ticket: Ticket,
    category: TicketCategory,
    priority: TicketPriority,
    sentiment_score: float,
    ai_confidence: float,
    ai_suggestion: str,
    ai_draft_reply: str,
    similar_ids: List[str],
    resolution_path: ResolutionPath,
) -> Ticket:
    """Store AI classification results and determine routing path."""
    prev_priority = ticket.priority
    prev_status = ticket.status

    ticket.category = category
    ticket.priority = priority
    ticket.sentiment_score = sentiment_score
    ticket.ai_confidence = ai_confidence
    ticket.ai_suggestion = ai_suggestion
    ticket.ai_draft_reply = ai_draft_reply
    ticket.similar_ticket_ids = ",".join(similar_ids)
    ticket.resolution_path = resolution_path
    ticket.sla_deadline = datetime.utcnow() + timedelta(hours=SLA_HOURS[priority])

    # set status based on routing path
    if resolution_path == ResolutionPath.auto_solve:
        ticket.status = TicketStatus.auto_solved
    else:
        ticket.status = TicketStatus.reviewing

    log_event(
        db, ticket.id,
        action=EventAction.ai_classified,
        actor_label="AI Classification Agent",
        prev_status=prev_status,
        new_status=ticket.status,
        prev_priority=prev_priority,
        new_priority=priority,
        notes=f"Category: {category} | Confidence: {ai_confidence:.2f} | Path: {resolution_path}"
    )
    log_event(
        db, ticket.id,
        action=EventAction.routed,
        actor_label="AI Routing Engine",
        notes=f"Routed to path: {resolution_path.value}"
    )

    db.commit()
    db.refresh(ticket)
    return ticket


def assign_to_engineer(
    db: Session,
    ticket: Ticket,
    engineer: User,
    assigned_by: User,
    notes: Optional[str] = None
) -> Ticket:
    prev_assigned = ticket.assigned_to
    prev_status = ticket.status

    ticket.assigned_to = engineer.id
    ticket.status = TicketStatus.assigned

    log_event(
        db, ticket.id,
        action=EventAction.assigned,
        actor=assigned_by,
        prev_status=prev_status,
        new_status=TicketStatus.assigned,
        prev_assigned=prev_assigned,
        new_assigned=engineer.id,
        notes=notes or f"Assigned to engineer: {engineer.username}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def resolve_ticket(
    db: Session,
    ticket: Ticket,
    resolution_text: str,
    resolved_by: User,
    notes: Optional[str] = None
) -> Ticket:
    prev_status = ticket.status

    ticket.resolution_text = resolution_text
    ticket.status = TicketStatus.resolved
    ticket.resolved_at = datetime.utcnow()
    ticket.resolved_by_path = (
        ResolutionPath.engineer if resolved_by.role == UserRole.engineer
        else ResolutionPath.helpdesk
    )

    log_event(
        db, ticket.id,
        action=EventAction.resolved,
        actor=resolved_by,
        prev_status=prev_status,
        new_status=TicketStatus.resolved,
        notes=notes or resolution_text[:200]
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def rollback_ticket(
    db: Session,
    ticket: Ticket,
    target_event_id: str,
    admin: User,
    reason: str
) -> Ticket:
    """
    Admin rolls back a ticket to the state it was in
    just before the target event was applied.
    """
    # find the event just BEFORE the target event
    all_events = db.query(TicketEvent)\
        .filter(TicketEvent.ticket_id == ticket.id)\
        .order_by(TicketEvent.created_at).all()

    target_idx = next((i for i, e in enumerate(all_events) if e.id == target_event_id), None)
    if target_idx is None or target_idx == 0:
        raise ValueError("Cannot rollback to this event")

    restore_event = all_events[target_idx - 1]

    prev_status = ticket.status
    prev_assigned = ticket.assigned_to

    # restore state from the previous event's snapshot
    if restore_event.new_status:
        ticket.status = restore_event.new_status
    if restore_event.new_assigned is not None:
        ticket.assigned_to = restore_event.new_assigned

    log_event(
        db, ticket.id,
        action=EventAction.rollback,
        actor=admin,
        prev_status=str(prev_status),
        new_status=str(ticket.status),
        prev_assigned=str(prev_assigned),
        new_assigned=str(ticket.assigned_to),
        notes=f"ROLLBACK by admin. Reason: {reason}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def get_tickets_for_user(db: Session, user: User) -> List[Ticket]:
    """Return tickets based on role — users see only their own."""
    if user.role == UserRole.user:
        return db.query(Ticket).filter(Ticket.created_by == user.id).all()
    elif user.role == UserRole.engineer:
        return db.query(Ticket).filter(Ticket.assigned_to == user.id).all()
    elif user.role in (UserRole.helpdesk, UserRole.admin):
        return db.query(Ticket).all()
    return []