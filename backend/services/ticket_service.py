# backend/services/ticket_service.py

from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import Optional, List
import uuid

from backend.models.ticket import Ticket, TicketStatus, TicketPriority, TicketCategory, ResolutionPath
from backend.models.ticket_event import TicketEvent, EventAction
from backend.models.user import User, UserRole
from backend.channels.normalizer import TicketInput   # ← ADD THIS
from backend.services.anomaly_services import check_for_incident


# SLA deadlines per priority
SLA_HOURS = {
    TicketPriority.P1: 2,
    TicketPriority.P2: 4,
    TicketPriority.P3: 8,
    TicketPriority.P4: 24,
}

def calculate_sla_deadline(priority: TicketPriority) -> datetime:
    hours = SLA_HOURS.get(priority, 24)
    return datetime.utcnow() + timedelta(hours=hours)


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
        actor_label=actor_label or (
            f"{actor.role.value}: {actor.username}" if actor else "AI System"
        ),
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


def create_ticket(
    db: Session,
    title: str,
    description: str,
    channel: str,
    created_by: User
) -> Ticket:
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
    db.flush()

    log_event(
        db, ticket.id,
        action=EventAction.created,
        actor=created_by,
        new_status=TicketStatus.ai_pending.value,     # ← .value fix
        notes=f"Ticket submitted via {channel}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ─────────────────────────────────────────
# MISSING FUNCTION 1 — create_ticket_from_input
# ─────────────────────────────────────────
def create_ticket_from_input(
    db: Session,
    ticket_input: TicketInput,
) -> Ticket:
    """
    Create a ticket from a normalized TicketInput object.
    Called by imap_poller, routers/intake.py after channel normalization.
    Looks up the user from user_id in TicketInput, then calls create_ticket().

    Why does this exist separately from create_ticket()?
    create_ticket() takes raw strings — used by the web form route.
    create_ticket_from_input() takes a TicketInput — used by all channels
    (email, call, chat escalation). It bridges the channel layer and the DB layer.
    """
    # look up the user who submitted this
    user = db.query(User).filter(User.id == ticket_input.user_id).first()
    if not user:
        raise ValueError(f"User {ticket_input.user_id} not found in DB")

    ticket = Ticket(
        title=ticket_input.subject,
        description=ticket_input.raw_content,
        channel=ticket_input.source,           # "email" | "chat" | "call"
        created_by=user.id,
        status=TicketStatus.ai_pending,
        sla_deadline=datetime.utcnow() + timedelta(hours=SLA_HOURS[TicketPriority.P3]),
        intake_id=ticket_input.intake_id,      # traceability back to channel intake
    )
    db.add(ticket)
    db.flush()

    log_event(
        db, ticket.id,
        action=EventAction.created,
        actor=user,
        new_status=TicketStatus.ai_pending.value,
        notes=(
            f"Ticket received via {ticket_input.source} channel. "
            f"intake_id={ticket_input.intake_id}"
        )
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
    prev_priority = ticket.priority.value if ticket.priority else None   # ← .value fix
    prev_status   = ticket.status.value if ticket.status else None       # ← .value fix

    ticket.category   = category
    ticket.priority   = priority
    ticket.sentiment_score  = sentiment_score
    ticket.ai_confidence    = ai_confidence
    ticket.ai_suggestion    = ai_suggestion
    ticket.ai_draft_reply   = ai_draft_reply
    ticket.similar_ticket_ids = ",".join(similar_ids)
    ticket.resolution_path  = resolution_path
    ticket.sla_deadline     = datetime.utcnow() + timedelta(hours=SLA_HOURS[priority])

    if resolution_path == ResolutionPath.auto_solve:
        ticket.status = TicketStatus.auto_solved
    else:
        ticket.status = TicketStatus.reviewing

    log_event(
        db, ticket.id,
        action=EventAction.ai_classified,
        actor_label="AI Classification Agent",
        prev_status=prev_status,
        new_status=ticket.status.value,                          # ← .value fix
        prev_priority=prev_priority,
        new_priority=priority.value,                             # ← .value fix
        notes=(
            f"Category: {category.value} | "                    # ← .value fix
            f"Confidence: {ai_confidence:.2f} | "
            f"Path: {resolution_path.value}"                     # ← .value fix
        )
    )
    log_event(
        db, ticket.id,
        action=EventAction.routed,
        actor_label="AI Routing Engine",
        notes=f"Routed to path: {resolution_path.value}"
    )

    db.commit()
    db.refresh(ticket)
    check_for_incident(db, ticket)

    return ticket


def assign_to_engineer(
    db: Session,
    ticket: Ticket,
    engineer: User,
    assigned_by: User,
    notes: Optional[str] = None
) -> Ticket:
    prev_assigned = ticket.assigned_to
    prev_status   = ticket.status.value if ticket.status else None    # ← .value fix

    ticket.assigned_to = engineer.id
    ticket.status      = TicketStatus.assigned

    log_event(
        db, ticket.id,
        action=EventAction.assigned,
        actor=assigned_by,
        prev_status=prev_status,
        new_status=TicketStatus.assigned.value,                   # ← .value fix
        prev_assigned=str(prev_assigned) if prev_assigned else None,
        new_assigned=str(engineer.id),
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
    prev_status = ticket.status.value if ticket.status else None      # ← .value fix

    ticket.resolution_text  = resolution_text
    ticket.status           = TicketStatus.resolved
    ticket.resolved_at      = datetime.utcnow()
    ticket.resolved_by_path = (
        ResolutionPath.engineer if resolved_by.role == UserRole.engineer
        else ResolutionPath.helpdesk
    )

    log_event(
        db, ticket.id,
        action=EventAction.resolved,
        actor=resolved_by,
        prev_status=prev_status,
        new_status=TicketStatus.resolved.value,                   # ← .value fix
        notes=notes or resolution_text[:200]
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ─────────────────────────────────────────
# MISSING FUNCTION 2 — escalate_ticket
# ─────────────────────────────────────────
def escalate_ticket(
    db: Session,
    ticket: Ticket,
    escalated_by: User,
    reason: str
) -> Ticket:
    """
    Escalate a ticket — moves it from helpdesk review to engineer queue.
    Called when helpdesk can't resolve and needs engineering help.
    """
    prev_status = ticket.status.value if ticket.status else None

    ticket.status = TicketStatus.escalated

    log_event(
        db, ticket.id,
        action=EventAction.escalated,
        actor=escalated_by,
        prev_status=prev_status,
        new_status=TicketStatus.escalated.value,
        notes=f"Escalated to engineering. Reason: {reason}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ─────────────────────────────────────────
# MISSING FUNCTION 3 — reopen_ticket
# ─────────────────────────────────────────
def reopen_ticket(
    db: Session,
    ticket: Ticket,
    reopened_by: User,
    reason: str
) -> Ticket:
    """
    Reopen a resolved ticket — user says the problem came back.
    """
    prev_status = ticket.status.value if ticket.status else None

    ticket.status      = TicketStatus.reviewing
    ticket.resolved_at = None

    log_event(
        db, ticket.id,
        action=EventAction.reopened,
        actor=reopened_by,
        prev_status=prev_status,
        new_status=TicketStatus.reviewing.value,
        notes=f"Ticket reopened. Reason: {reason}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ─────────────────────────────────────────
# MISSING FUNCTION 4 — close_ticket
# ─────────────────────────────────────────
def close_ticket(
    db: Session,
    ticket: Ticket,
    closed_by: User,
    notes: Optional[str] = None
) -> Ticket:
    """
    Close a resolved ticket after user confirms fix.
    Final state — no more changes allowed.
    """
    prev_status = ticket.status.value if ticket.status else None

    ticket.status = TicketStatus.closed

    log_event(
        db, ticket.id,
        action=EventAction.closed,
        actor=closed_by,
        prev_status=prev_status,
        new_status=TicketStatus.closed.value,
        notes=notes or "Ticket closed by user confirmation"
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
    Admin rolls back ticket to state just before the target event.
    """
    all_events = (
        db.query(TicketEvent)
        .filter(TicketEvent.ticket_id == ticket.id)
        .order_by(TicketEvent.created_at)
        .all()
    )

    target_idx = next(
        (i for i, e in enumerate(all_events) if e.id == target_event_id), None
    )
    if target_idx is None or target_idx == 0:
        raise ValueError("Cannot rollback to this event")

    restore_event = all_events[target_idx - 1]

    prev_status   = ticket.status.value if ticket.status else None
    prev_assigned = str(ticket.assigned_to) if ticket.assigned_to else None

    if restore_event.new_status:
        ticket.status = restore_event.new_status
    if restore_event.new_assigned is not None:
        ticket.assigned_to = restore_event.new_assigned

    log_event(
        db, ticket.id,
        action=EventAction.rollback,
        actor=admin,
        prev_status=prev_status,
        new_status=str(ticket.status),
        prev_assigned=prev_assigned,
        new_assigned=str(ticket.assigned_to),
        notes=f"ROLLBACK by admin. Reason: {reason}"
    )
    db.commit()
    db.refresh(ticket)
    return ticket


def get_tickets_for_user(db: Session, user: User) -> List[Ticket]:
    """Return tickets based on role."""
    if user.role == UserRole.user:
        return db.query(Ticket).filter(Ticket.created_by == user.id).all()
    elif user.role == UserRole.engineer:
        return db.query(Ticket).filter(Ticket.assigned_to == user.id).all()
    elif user.role in (UserRole.helpdesk, UserRole.admin):
        return db.query(Ticket).all()
    return []