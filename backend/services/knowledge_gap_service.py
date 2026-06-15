# backend/services/knowledge_gap_service.py
#
# Logs low-confidence AI responses and provides aggregated stats
# for the admin "knowledge gaps" view.

import logging
from sqlalchemy.orm import Session
from sqlalchemy import func

from backend.models.knowledge_gap import KnowledgeGap

logger = logging.getLogger(__name__)


def log_gap(db: Session, nlp_result, pipeline_result, source: str):
    """
    Called from ai_pipeline (via chat.py/intake.py) whenever
    should_create_ticket=True due to low AI confidence.

    Only logs tier1/tier2/tier3a — tier3b/3c are intentional
    direct-to-helpdesk routes, not "AI failures".
    """
    if pipeline_result["tier"] in ("tier3b", "tier3c"):
        return

    try:
        gap = KnowledgeGap(
            category    = nlp_result.category if nlp_result else "unknown",
            priority    = nlp_result.priority if nlp_result else None,
            tier        = pipeline_result["tier"],
            summary     = nlp_result.summary if nlp_result else "",
            confidence  = pipeline_result["confidence"],
            rag_sources = ", ".join(pipeline_result.get("rag_sources", [])) or None,
            tavily_used = str(pipeline_result.get("tavily_used", False)),
            source      = source,
        )
        db.add(gap)
        db.commit()
        logger.info(f"[KNOWLEDGE_GAP] Logged — category={gap.category} confidence={gap.confidence}")
    except Exception as e:
        logger.error(f"[KNOWLEDGE_GAP] Failed to log: {e}")


def get_gap_summary(db: Session, limit: int = 50):
    """
    Returns aggregated stats per category — for admin dashboard.

    [
      {"category": "network", "count": 12, "avg_confidence": 0.38, "recent": [...]},
      ...
    ]
    """
    rows = (
        db.query(
            KnowledgeGap.category,
            func.count(KnowledgeGap.id).label("count"),
            func.avg(KnowledgeGap.confidence).label("avg_confidence"),
        )
        .group_by(KnowledgeGap.category)
        .order_by(func.count(KnowledgeGap.id).desc())
        .all()
    )

    results = []
    for r in rows:
        recent = (
            db.query(KnowledgeGap)
            .filter(KnowledgeGap.category == r.category)
            .order_by(KnowledgeGap.created_at.desc())
            .limit(5)
            .all()
        )
        results.append({
            "category": r.category,
            "count": r.count,
            "avg_confidence": round(float(r.avg_confidence), 3),
            "recent": [
                {
                    "summary": g.summary,
                    "confidence": g.confidence,
                    "tier": g.tier,
                    "source": g.source,
                    "created_at": g.created_at.isoformat(),
                }
                for g in recent
            ],
        })

    return results[:limit]