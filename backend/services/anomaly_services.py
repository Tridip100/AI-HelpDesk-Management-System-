# backend/services/anomaly_service.py
#
# Phase 8b — Anomaly / Incident Detection
#
# When a new ticket is created and classified, check if other tickets
# in the same category, created recently, have similar descriptions.
# If a cluster of similar tickets is found (e.g. 3+ users reporting
# the same outage), group them under a shared "incident" parent ticket
# marked P1 — so helpdesk sees one incident instead of many duplicates.

import logging
from datetime import datetime, timedelta
from typing import Optional

import numpy as np
from sqlalchemy.orm import Session

from backend.models.ticket import Ticket, TicketStatus, TicketPriority, ResolutionPath
from backend.models.ticket_event import EventAction, TicketEvent
from backend.ingestion.base_ingestor import embed_text

logger = logging.getLogger(__name__)

WINDOW_MINUTES       = 30     # look-back window for clustering
MIN_CLUSTER_SIZE     = 3      # new ticket + at least 2 similar = incident
SIMILARITY_THRESHOLD = 0.80   # cosine similarity cutoff

ACTIVE_STATUSES = [
    TicketStatus.open, TicketStatus.ai_pending, TicketStatus.reviewing,
    TicketStatus.assigned, TicketStatus.in_progress,
    TicketStatus.escalated, TicketStatus.reopened,
]


def cosine_similarity(a, b) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))


def check_for_incident(db: Session, ticket: Ticket) -> Optional[Ticket]:
    """
    Called after a ticket is created and classified (category is set).

    Looks for other recent tickets in the same category with similar
    descriptions. If a cluster forms, links them to a shared incident
    parent ticket (created if it doesn't exist yet).

    Returns the incident parent ticket if linked/created, else None.
    """
    if not ticket.category or ticket.is_incident:
        return None

    since = datetime.utcnow() - timedelta(minutes=WINDOW_MINUTES)

    candidates = (
        db.query(Ticket)
        .filter(
            Ticket.id != ticket.id,
            Ticket.category == ticket.category,
            Ticket.created_at >= since,
            Ticket.status.in_(ACTIVE_STATUSES),
            Ticket.is_incident == False,
        )
        .all()
    )

    if not candidates:
        return None

    try:
        ticket_vec = embed_text(f"{ticket.title}. {ticket.description}")
    except Exception as e:
        logger.error(f"[ANOMALY] Failed to embed ticket {ticket.id[:8]}: {e}")
        return None

    similar = []
    for c in candidates:
        try:
            c_vec = embed_text(f"{c.title}. {c.description}")
        except Exception:
            continue
        score = cosine_similarity(ticket_vec, c_vec)
        if score >= SIMILARITY_THRESHOLD:
            similar.append((c, score))

    total_cluster_size = len(similar) + 1  # + new ticket
    if total_cluster_size < MIN_CLUSTER_SIZE:
        return None

    # If any matched ticket is already part of an incident, join it instead
    existing_parent = None
    for c, _ in similar:
        if c.parent_ticket_id:
            existing_parent = db.query(Ticket).filter(Ticket.id == c.parent_ticket_id).first()
            if existing_parent:
                break

    if existing_parent:
        ticket.parent_ticket_id = existing_parent.id
        _log_incident_event(db, ticket, existing_parent, "Linked to existing incident")
        db.commit()
        logger.warning(f"[ANOMALY] Ticket {ticket.id[:8]} linked to existing incident {existing_parent.id[:8]}")
        return existing_parent

    # Create a new incident parent ticket
    incident = Ticket(
        title=f"[INCIDENT] Multiple reports — {ticket.category.value}",
        description=(
            f"Automatically created — {total_cluster_size} similar tickets reported "
            f"within {WINDOW_MINUTES} minutes in category '{ticket.category.value}'.\n\n"
            f"Sample report: {ticket.description[:300]}"
        ),
        channel="system",
        category=ticket.category,
        priority=TicketPriority.P1,
        status=TicketStatus.escalated,
        resolution_path=ResolutionPath.helpdesk,
        is_incident=True,
        created_by=ticket.created_by,
    )
    db.add(incident)
    db.flush()  # assigns incident.id

    ticket.parent_ticket_id = incident.id
    _log_incident_event(db, ticket, incident, "New incident created — multiple similar reports")

    for c, score in similar:
        c.parent_ticket_id = incident.id
        _log_incident_event(db, c, incident, f"Linked to new incident (similarity={score:.2f})")

    db.commit()
    logger.warning(
        f"[ANOMALY] Created incident {incident.id[:8]} — {total_cluster_size} tickets clustered "
        f"in category '{ticket.category.value}'"
    )
    return incident


def _log_incident_event(db: Session, ticket: Ticket, incident: Ticket, note: str):
    event = TicketEvent(
        ticket_id=ticket.id,
        action=EventAction.escalated,
        actor_id=None,
        actor_label="Anomaly Detection Agent",
        notes=f"{note} — incident #{incident.id[:8]}",
    )
    db.add(event)