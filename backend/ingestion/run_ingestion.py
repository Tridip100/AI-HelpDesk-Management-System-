# backend/ingestion/run_ingestion.py
#
# ─────────────────────────────────────────
# WHAT THIS FILE DOES:
# Single entry point that runs the entire ingestion pipeline.
# Run this ONE TIME to fill ChromaDB with all knowledge.
#
# ORDER OF OPERATIONS:
# Step 1: extract_pdfs.py  — PDF → text files
# Step 2: document_ingestor — text files → ChromaDB sop_documents
# Step 3: ticket_ingestor  — CSV → ChromaDB resolved_tickets
# Step 4: verify           — print stats to confirm everything worked
#
# WHEN TO RE-RUN:
# - When you add new PDFs
# - When you have new resolved tickets to add
# - When ChromaDB gets corrupted (delete chroma_db/ folder first)
#
# HOW TO RUN:
# cd backend
# python ingestion/run_ingestion.py
#
# EXPECTED OUTPUT:
# Extracted 7 PDFs
# Ingested ~3500 SOP chunks
# Ingested 2769 resolved tickets
# ChromaDB ready for RAG
# ─────────────────────────────────────────

import sys
import os
import logging

# Add backend to path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level  = logging.INFO,
    format = "%(levelname)s: %(message)s"
)
logger = logging.getLogger(__name__)


def run():
    print("\n" + "=" * 60)
    print("AI HELPDESK — KNOWLEDGE BASE INGESTION")
    print("=" * 60)

    # ─────────────────────────────────────────
    # STEP 1 — Extract PDFs to text
    # ─────────────────────────────────────────
    print("\n[STEP 1] Extracting PDFs to text...")
    print("-" * 40)

    from extract_pdfs import extract_all
    pdf_count = extract_all()

    if pdf_count == 0:
        print("WARNING: No PDFs extracted — check data/pdfs/ folder")
    else:
        print(f"✅ Extracted {pdf_count} PDFs to data/sops/")

    # ─────────────────────────────────────────
    # STEP 2 — Ingest SOP documents
    # ─────────────────────────────────────────
    print("\n[STEP 2] Ingesting SOP documents into ChromaDB...")
    print("-" * 40)

    from document_ingestor import ingest_documents
    doc_chunks = ingest_documents()

    if doc_chunks == 0:
        print("WARNING: No SOP chunks ingested")
    else:
        print(f"✅ Ingested {doc_chunks} SOP chunks")

    # ─────────────────────────────────────────
    # STEP 3 — Ingest resolved tickets
    # ─────────────────────────────────────────
    print("\n[STEP 3] Ingesting resolved tickets into ChromaDB...")
    print("-" * 40)

    from ticket_ingestor import ingest_tickets
    ticket_count = ingest_tickets()

    if ticket_count == 0:
        print("WARNING: No tickets ingested")
    else:
        print(f"✅ Ingested {ticket_count} resolved tickets")

    # ─────────────────────────────────────────
    # STEP 4 — Verify
    # ─────────────────────────────────────────
    print("\n[STEP 4] Verifying ChromaDB...")
    print("-" * 40)

    from base_ingestor import get_collection_stats
    stats = get_collection_stats()

    print(f"  sop_documents:    {stats.get('sop_documents', 0):,} chunks")
    print(f"  resolved_tickets: {stats.get('resolved_tickets', 0):,} tickets")

    total = sum(stats.values())

    print("\n" + "=" * 60)
    if total > 0:
        print(f"✅ INGESTION COMPLETE — {total:,} total documents in ChromaDB")
        print("   RAG pipeline is ready to search")
    else:
        print("❌ INGESTION FAILED — ChromaDB is empty")
        print("   Check errors above")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    # Change to ingestion directory so relative paths work
    os.chdir(os.path.dirname(__file__))
    run()