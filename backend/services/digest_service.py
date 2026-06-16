# backend/services/digest_service.py
#
# Phase 9 — Shift Handover Digest
#
# Generates a GenAI summary of recent ticket activity for
# incoming helpdesk shifts. Called on-demand via admin endpoint.
#
# Two parts:
#   1. collect_digest_data() — queries DB for raw stats
#   2. generate_digest()     — sends stats to LLM → readable summary
#
# Uses mistral (full model) for generation since this is a
# background/on-demand task, not a real-time chat response.

import logging
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.ticket import Ticket, TicketStatus, TicketPriority
from backend.models.ticket_event import TicketEvent, EventAction

logger = logging.getLogger(__name__)


def collect_digest_data(db: Session, hours: int = 8) -> dict:
    """
    Collect raw ticket stats for the last N hours.
    Returns structured data for LLM to summarize.
    """
    since = datetime.utcnow() - timedelta(hours=hours)

    # All tickets created in window
    tickets = db.query(Ticket).filter(Ticket.created_at >= since).all()

    total = len(tickets)

    # By priority
    by_priority = {}
    for p in TicketPriority:
        count = sum(1 for t in tickets if t.priority == p)
        if count:
            by_priority[p.value] = count

    # By category
    by_category = {}
    for t in tickets:
        if t.category:
            key = t.category.value
            by_category[key] = by_category.get(key, 0) + 1

    # By status
    by_status = {}
    for t in tickets:
        key = t.status.value
        by_status[key] = by_status.get(key, 0) + 1

    # Auto-resolved by AI
    ai_resolved = sum(1 for t in tickets if t.status == TicketStatus.auto_solved)

    # Pending helpdesk review
    pending = sum(1 for t in tickets if t.status in [
        TicketStatus.open, TicketStatus.ai_pending, TicketStatus.reviewing
    ])

    # SLA breaches in window
    sla_breaches = db.query(TicketEvent).filter(
        TicketEvent.action == EventAction.sla_escalated,
        TicketEvent.created_at >= since,
    ).all()

    sla_breach_details = []
    for e in sla_breaches:
        ticket = db.query(Ticket).filter(Ticket.id == e.ticket_id).first()
        if ticket:
            sla_breach_details.append({
                "ticket_id": ticket.id[:8],
                "title": ticket.title[:60],
                "category": ticket.category.value if ticket.category else "unknown",
                "priority": ticket.priority.value if ticket.priority else "unknown",
            })

    # Active incidents
    incidents = db.query(Ticket).filter(
        Ticket.is_incident == True,
        Ticket.status.notin_([TicketStatus.resolved, TicketStatus.closed]),
    ).all()

    incident_details = [{
        "title": i.title[:80],
        "category": i.category.value if i.category else "unknown",
        "children": db.query(func.count(Ticket.id)).filter(
            Ticket.parent_ticket_id == i.id
        ).scalar() or 0,
    } for i in incidents]

    # Top category (most reported)
    top_category = max(by_category, key=by_category.get) if by_category else None

    return {
        "hours": hours,
        "total_tickets": total,
        "by_priority": by_priority,
        "by_category": by_category,
        "by_status": by_status,
        "ai_resolved": ai_resolved,
        "pending_review": pending,
        "sla_breaches": sla_breach_details,
        "active_incidents": incident_details,
        "top_category": top_category,
        "generated_at": datetime.utcnow().isoformat(),
    }


async def generate_digest(db: Session, hours: int = 8) -> dict:
    """
    Generate a human-readable shift handover digest.

    Steps:
    1. Collect raw stats from DB
    2. Format into a concise prompt
    3. Send to mistral → readable digest text
    4. Return both raw stats and formatted digest
    """
    import httpx
    from backend.config import settings

    data = collect_digest_data(db, hours)

    # If no tickets in window, return early
    if data["total_tickets"] == 0:
        return {
            "digest": f"No tickets were created in the last {hours} hours. All quiet.",
            "stats": data,
        }

    # Build stats summary for LLM
    stats_text = f"""
Shift period: Last {hours} hours
Total tickets created: {data['total_tickets']}
By priority: {data['by_priority']}
By category: {data['by_category']}
By status: {data['by_status']}
AI auto-resolved: {data['ai_resolved']}
Pending helpdesk review: {data['pending_review']}
SLA breaches: {len(data['sla_breaches'])}
{f"Breached tickets: {data['sla_breaches']}" if data['sla_breaches'] else ""}
Active incidents: {len(data['active_incidents'])}
{f"Incidents: {data['active_incidents']}" if data['active_incidents'] else ""}
Top issue category: {data['top_category'] or 'none'}
""".strip()

    prompt = f"""You are an IT helpdesk shift supervisor.
Write a concise, professional shift handover digest based on these stats.
Format it as a brief bulletin an incoming helpdesk agent would read in 30 seconds.
Use clear sections: Overview, Priority Issues, AI Performance, Action Items.
Keep it under 200 words. Be specific — include ticket counts and categories.

Stats:
{stats_text}
"""

    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434')}/api/chat",
                json={
                    "model": "mistral",
                    "messages": [{"role": "user", "content": prompt}],
                    "stream": False,
                    "options": {"temperature": 0.4, "num_predict": 400},
                },
            )
            response.raise_for_status()
            data_resp = response.json()
            digest_text = data_resp["message"]["content"].strip()

    except Exception as e:
        logger.error(f"[DIGEST] LLM generation failed: {e}")
        digest_text = _fallback_digest(data)

    logger.info(f"[DIGEST] Generated for last {hours}h — {data['total_tickets']} tickets")

    return {
        "digest": digest_text,
        "stats": data,
    }


def _fallback_digest(data: dict) -> str:
    """
    Plain text digest if LLM fails — always returns something useful.
    """
    lines = [
        f"SHIFT DIGEST — Last {data['hours']} hours",
        f"Total tickets: {data['total_tickets']}",
    ]
    if data["by_priority"]:
        lines.append(f"By priority: {', '.join(f'{k}:{v}' for k,v in data['by_priority'].items())}")
    if data["by_category"]:
        lines.append(f"Top categories: {', '.join(f'{k}({v})' for k,v in sorted(data['by_category'].items(), key=lambda x: -x[1])[:3])}")
    lines.append(f"AI resolved: {data['ai_resolved']} | Pending review: {data['pending_review']}")
    if data["sla_breaches"]:
        lines.append(f"SLA BREACHES: {len(data['sla_breaches'])} — needs immediate attention")
    if data["active_incidents"]:
        lines.append(f"ACTIVE INCIDENTS: {len(data['active_incidents'])}")
    return "\n".join(lines)