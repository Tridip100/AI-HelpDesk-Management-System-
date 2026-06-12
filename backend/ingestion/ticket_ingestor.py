# backend/ingestion/ticket_ingestor.py
#
# ─────────────────────────────────────────
# WHAT THIS FILE DOES:
# Reads customer_support_tickets.csv
# Filters to ONLY resolved tickets (Resolution column not null)
# Builds a rich text representation of each ticket
# Embeds and stores in ChromaDB "resolved_tickets" collection
#
# WHY ONLY RESOLVED TICKETS?
# Only closed tickets have a Resolution column filled
# 2769 out of 8469 rows are resolved
# RAG needs "problem + solution" pairs
# A ticket with no resolution teaches the AI nothing
#
# WHAT GETS EMBEDDED:
# We combine Subject + Description + Resolution into one text
# This way when a user describes a problem:
#   "my product won't connect"
# The embedding matches tickets with similar problems AND their solutions
#
# HOW IT CONNECTS:
# customer_support_tickets.csv → ticket_ingestor.py → ChromaDB
# rag_service.py searches "resolved_tickets" collection
# ─────────────────────────────────────────

import os
import logging
import pandas as pd
from base_ingestor import add_to_collection

logger = logging.getLogger(__name__)

BASE_DIR    = os.path.dirname(__file__)
CSV_PATH    = os.path.join(BASE_DIR, "data", "customer_support_tickets.csv")
COLLECTION  = "resolved_tickets"


def build_ticket_text(row: pd.Series) -> str:
    """
    Build a rich text representation of one ticket.

    Why combine fields?
    Embedding "Product setup" alone is too vague
    Embedding the full context gives better similarity matches

    Format:
    PROBLEM: Product setup
    DESCRIPTION: I'm having an issue with the product...
    TYPE: Technical issue
    PRIORITY: Critical
    RESOLUTION: Please check the product manual step 3...
    """
    parts = []

    if pd.notna(row.get("Ticket Subject")):
        parts.append(f"PROBLEM: {row['Ticket Subject']}")

    if pd.notna(row.get("Ticket Description")):
        # Truncate long descriptions to 300 chars
        desc = str(row["Ticket Description"])[:300]
        parts.append(f"DESCRIPTION: {desc}")

    if pd.notna(row.get("Ticket Type")):
        parts.append(f"TYPE: {row['Ticket Type']}")

    if pd.notna(row.get("Ticket Priority")):
        parts.append(f"PRIORITY: {row['Ticket Priority']}")

    if pd.notna(row.get("Resolution")):
        parts.append(f"RESOLUTION: {row['Resolution']}")

    return "\n".join(parts)


def map_priority(priority: str) -> str:
    """
    Map CSV priority values to our system's P1-P4.

    CSV uses: Critical, High, Medium, Low
    Our system uses: P1, P2, P3, P4
    """
    mapping = {
        "critical": "P1",
        "high":     "P2",
        "medium":   "P3",
        "low":      "P4",
    }
    return mapping.get(str(priority).lower(), "P3")


def ingest_tickets() -> int:
    """
    Load CSV, filter resolved tickets, ingest into ChromaDB.

    Steps:
    1. Load CSV
    2. Filter rows where Resolution is not null
    3. For each resolved ticket:
       a. Build rich text (problem + description + resolution)
       b. Map priority to P1-P4
       c. Build metadata
    4. Batch embed + store in ChromaDB

    Returns count of tickets ingested.
    """
    if not os.path.exists(CSV_PATH):
        logger.error(f"[TICKETS] CSV not found: {CSV_PATH}")
        return 0

    logger.info("[TICKETS] Loading CSV...")
    df = pd.read_csv(CSV_PATH)
    logger.info(f"[TICKETS] Total rows: {len(df)}")

    # Filter to resolved tickets only
    resolved = df[df["Resolution"].notna()].copy()
    logger.info(f"[TICKETS] Resolved tickets: {len(resolved)}")

    all_ids       = []
    all_texts     = []
    all_metadatas = []

    for idx, row in resolved.iterrows():
        ticket_id = f"ticket_{row.get('Ticket ID', idx)}"
        text      = build_ticket_text(row)

        if len(text) < 50:
            continue  # skip tickets with too little content

        priority = map_priority(row.get("Ticket Priority", "Medium"))

        all_ids.append(ticket_id)
        all_texts.append(text)
        all_metadatas.append({
            "ticket_id":   str(row.get("Ticket ID", idx)),
            "subject":     str(row.get("Ticket Subject", ""))[:100],
            "type":        str(row.get("Ticket Type", "other")),
            "priority":    priority,
            "channel":     str(row.get("Ticket Channel", "unknown")),
            "type_source": "csv_ticket"
        })

    if not all_texts:
        logger.warning("[TICKETS] No valid tickets to ingest")
        return 0

    # Batch store
    add_to_collection(
        collection_name = COLLECTION,
        ids             = all_ids,
        texts           = all_texts,
        metadatas       = all_metadatas
    )

    logger.info(f"[TICKETS] Ingested {len(all_texts)} resolved tickets")
    return len(all_texts)