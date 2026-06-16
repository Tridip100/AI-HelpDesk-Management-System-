from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List
from pydantic import BaseModel
from typing import Optional

from backend.database import get_db
from backend.models.user import User, UserRole
from backend.middleware.rbac import current_user_admin
from backend.models.ticket import Ticket, TicketStatus
from backend.models.ticket_event import TicketEvent
from datetime import datetime, timedelta
from backend.middleware.rbac import current_user_admin, current_user_helpdesk_or_above

router = APIRouter(prefix="/admin", tags=["admin"])


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    full_name: str
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True


class UpdateUserRequest(BaseModel):
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    full_name: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


@router.get("/users", response_model=List[UserOut])
def list_all_users(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Admin: see all users in the system."""
    return db.query(User).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: str,
    req: UpdateUserRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(current_user_admin)
):
    """Admin: change a user's role, activate/deactivate, update name."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if req.role is not None:
        user.role = req.role
    if req.is_active is not None:
        user.is_active = req.is_active
    if req.full_name is not None:
        user.full_name = req.full_name

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password")
def reset_password(
    user_id: str,
    req: ResetPasswordRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(current_user_admin)
):
    """Admin: reset any user's password."""
    from backend.services.auth_service import hash_password

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": f"Password reset for {user.username}"}


@router.get("/tickets/{ticket_id}/audit")
def ticket_audit_trail(
    ticket_id: str,
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Admin: full event history for a ticket — the complete trackback trail."""
    events = db.query(TicketEvent)\
        .filter(TicketEvent.ticket_id == ticket_id)\
        .order_by(TicketEvent.created_at).all()

    return [{
        "id": e.id,
        "action": e.action,
        "actor": e.actor_label,
        "prev_status": e.prev_status,
        "new_status": e.new_status,
        "prev_assigned": e.prev_assigned,
        "new_assigned": e.new_assigned,
        "notes": e.notes,
        "timestamp": e.created_at.isoformat()
    } for e in events]


@router.get("/metrics")
def team_metrics(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """
    Admin trackback dashboard metrics:
    - tickets by status
    - avg resolution time
    - auto-solve rate
    - CSAT average
    - per-engineer ticket count
    """
    total = db.query(func.count(Ticket.id)).scalar()
    resolved = db.query(func.count(Ticket.id))\
        .filter(Ticket.status == TicketStatus.resolved).scalar()
    auto_solved = db.query(func.count(Ticket.id))\
        .filter(Ticket.status == TicketStatus.auto_solved).scalar()
    avg_csat = db.query(func.avg(Ticket.csat_score))\
        .filter(Ticket.csat_score.isnot(None)).scalar()

    # per-engineer breakdown
    engineer_stats = db.query(
        User.username,
        User.full_name,
        func.count(Ticket.id).label("assigned"),
        func.avg(Ticket.csat_score).label("avg_csat")
    ).join(Ticket, User.id == Ticket.assigned_to, isouter=True)\
     .filter(User.role == UserRole.engineer)\
     .group_by(User.id).all()

    return {
        "total_tickets": total,
        "resolved": resolved,
        "auto_solved": auto_solved,
        "auto_solve_rate": round(auto_solved / total * 100, 1) if total else 0,
        "avg_csat": round(float(avg_csat), 2) if avg_csat else None,
        "engineer_breakdown": [{
            "username": e.username,
            "full_name": e.full_name,
            "assigned": e.assigned or 0,
            "avg_csat": round(float(e.avg_csat), 2) if e.avg_csat else None
        } for e in engineer_stats]
    }


@router.get("/stats/daily")
def stats_daily(
    days: int = 30,
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Ticket counts per day for the last N days."""
    since = datetime.utcnow() - timedelta(days=days)
    rows = (
        db.query(
            func.date(Ticket.created_at).label("day"),
            func.count(Ticket.id).label("count"),
        )
        .filter(Ticket.created_at >= since)
        .group_by(func.date(Ticket.created_at))
        .order_by(func.date(Ticket.created_at))
        .all()
    )
    return [{"date": str(r.day), "count": r.count} for r in rows]


@router.get("/stats/weekly")
def stats_weekly(
    weeks: int = 12,
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Ticket counts per week for the last N weeks."""
    since = datetime.utcnow() - timedelta(weeks=weeks)
    rows = (
        db.query(
            func.date_trunc("week", Ticket.created_at).label("week"),
            func.count(Ticket.id).label("count"),
        )
        .filter(Ticket.created_at >= since)
        .group_by(func.date_trunc("week", Ticket.created_at))
        .order_by(func.date_trunc("week", Ticket.created_at))
        .all()
    )
    return [{"week": str(r.week.date()), "count": r.count} for r in rows]


@router.get("/stats/monthly")
def stats_monthly(
    months: int = 12,
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Ticket counts per month for the last N months."""
    since = datetime.utcnow() - timedelta(days=months * 31)
    rows = (
        db.query(
            func.date_trunc("month", Ticket.created_at).label("month"),
            func.count(Ticket.id).label("count"),
        )
        .filter(Ticket.created_at >= since)
        .group_by(func.date_trunc("month", Ticket.created_at))
        .order_by(func.date_trunc("month", Ticket.created_at))
        .all()
    )
    return [{"month": str(r.month.date())[:7], "count": r.count} for r in rows]


@router.get("/stats/summary")
def stats_summary(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Quick top-line numbers for admin dashboard."""
    total = db.query(func.count(Ticket.id)).scalar()

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = db.query(func.count(Ticket.id)).filter(Ticket.created_at >= today_start).scalar()

    week_start = datetime.utcnow() - timedelta(days=7)
    week_count = db.query(func.count(Ticket.id)).filter(Ticket.created_at >= week_start).scalar()

    month_start = datetime.utcnow() - timedelta(days=30)
    month_count = db.query(func.count(Ticket.id)).filter(Ticket.created_at >= month_start).scalar()

    return {
        "total": total,
        "today": today_count,
        "this_week": week_count,
        "this_month": month_count,
    }

@router.get("/engineers", response_model=List[UserOut])
def list_engineers(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_helpdesk_or_above)
):
    """Helpdesk+: list all engineers for ticket assignment."""
    return db.query(User).filter(User.role == UserRole.engineer, User.is_active == True).all()


@router.get("/knowledge-gaps")
def knowledge_gaps(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """
    Admin: categories where AI confidence is consistently low.
    Signals where the knowledge base needs more SOPs/documents.
    """
    from backend.services.knowledge_gap_service import get_gap_summary
    return get_gap_summary(db)

@router.get("/incidents")
def list_incidents(
    db: Session = Depends(get_db),
    _: User = Depends(current_user_admin)
):
    """Admin: view all incidents (clustered duplicate tickets) and their children."""
    incidents = db.query(Ticket).filter(Ticket.is_incident == True).order_by(Ticket.created_at.desc()).all()

    return [{
        "id": i.id,
        "title": i.title,
        "category": i.category.value if i.category else None,
        "priority": i.priority.value,
        "status": i.status.value,
        "created_at": i.created_at.isoformat(),
        "children": [
            {"id": c.id, "title": c.title, "created_at": c.created_at.isoformat()}
            for c in db.query(Ticket).filter(Ticket.parent_ticket_id == i.id).all()
        ],
    } for i in incidents]


@router.get("/digest")
async def shift_digest(
    hours: int = 8,
    db: Session = Depends(get_db),
    _: User = Depends(current_user_helpdesk_or_above),
):
    """
    Generate a shift handover digest for the last N hours.
    Accessible by helpdesk and admin.
    hours param: 4, 8, 12, or 24 depending on shift length.
    """
    from backend.services.digest_service import generate_digest
    return await generate_digest(db, hours)