from sqlalchemy.orm import Session
from backend.models.ticket import TicketCategory, TicketPriority, ResolutionPath
from backend.models.user import User, UserRole


# Categories simple enough for AI to auto-solve with user
AUTO_SOLVABLE_CATEGORIES = {
    TicketCategory.auth,      # password reset, account unlock
    TicketCategory.software,  # install guide, settings help
    TicketCategory.hr_it,     # onboarding checklist, tool access guide
}

# Categories that always need an engineer
ENGINEER_CATEGORIES = {
    TicketCategory.database,
    TicketCategory.network,
    TicketCategory.security,
    TicketCategory.cloud_app,
}


def decide_routing_path(
    category: TicketCategory,
    priority: TicketPriority,
    ai_confidence: float,
) -> ResolutionPath:
    """
    Core routing logic — decides which of the 3 paths a ticket takes.

    Path A (auto_solve):  AI handles it directly with the user
    Path B (helpdesk):    Helpdesk member reviews AI card and approves
    Path C (engineer):    Routed directly to an engineer
    """
    # P1 always goes to engineer — too critical for AI or helpdesk
    if priority == TicketPriority.P1:
        return ResolutionPath.engineer

    # Engineer-only categories always go to engineer
    if category in ENGINEER_CATEGORIES:
        return ResolutionPath.engineer

    # High confidence + simple category = auto-solve
    if ai_confidence >= 0.80 and category in AUTO_SOLVABLE_CATEGORIES:
        return ResolutionPath.auto_solve

    # Low confidence = engineer regardless of category
    if ai_confidence < 0.50:
        return ResolutionPath.engineer

    # Everything else = helpdesk reviews
    return ResolutionPath.helpdesk


def find_best_engineer(db: Session, category) -> User:
    """
    Pick the engineer with the fewest open tickets in the relevant team.
    Phase 1: simple load balancing.
    Phase 2 (later): add ML prediction of fastest resolver.
    """
    from backend.models.ticket import Ticket, TicketStatus
    from sqlalchemy import func

    # count open tickets per engineer
    load = db.query(
        Ticket.assigned_to,
        func.count(Ticket.id).label("open_count")
    ).filter(
        Ticket.status == TicketStatus.assigned,
        Ticket.assigned_to.isnot(None)
    ).group_by(Ticket.assigned_to).subquery()

    engineer = db.query(User).outerjoin(
        load, User.id == load.c.assigned_to
    ).filter(
        User.role == UserRole.engineer,
        User.is_active == True
    ).order_by(
        func.coalesce(load.c.open_count, 0).asc()
    ).first()

    return engineer
