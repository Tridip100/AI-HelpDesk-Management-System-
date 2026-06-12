# backend/ingestion/document_ingestor.py
#
# ─────────────────────────────────────────
# WHAT THIS FILE DOES:
# Reads extracted .txt files from data/sops/
# Splits them into chunks
# Embeds each chunk
# Stores in ChromaDB "sop_documents" collection
#
# WHY CHUNKING?
# Microsoft docs can be 50-100 pages = 50,000+ characters
# Embedding an entire document as one vector loses detail
# A query about "VPN error 0x800704C9" should match the
# specific section about that error — not the whole document
#
# CHUNKING STRATEGY:
# Chunk size: 500 characters
# Overlap:    50 characters
#
# Why overlap?
# "...step 3: restart VPN | step 4: check DNS settings..."
# Without overlap: chunk 1 ends mid-sentence, chunk 2 misses context
# With overlap: both chunks contain the boundary text
# Ensures no fix steps are split across chunk boundaries
#
# HOW IT CONNECTS:
# extract_pdfs.py → sops/*.txt → document_ingestor.py → ChromaDB
# rag_service.py searches "sop_documents" collection
# ─────────────────────────────────────────

import os
import logging
from pathlib import Path
from base_ingestor import add_to_collection, get_collection_stats

logger = logging.getLogger(__name__)

BASE_DIR   = os.path.dirname(__file__)
SOPS_DIR   = os.path.join(BASE_DIR, "data", "sops")
COLLECTION = "sop_documents"

# ─────────────────────────────────────────
# CHUNKING CONFIG
# ─────────────────────────────────────────
CHUNK_SIZE    = 500    # characters per chunk
CHUNK_OVERLAP = 50     # overlap between consecutive chunks


def chunk_text(text: str, source: str) -> list[dict]:
    """
    Split text into overlapping chunks.

    Example with CHUNK_SIZE=20, OVERLAP=5:
    Text: "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    Chunk 1: "ABCDEFGHIJKLMNOPQRST"  (0-20)
    Chunk 2: "PQRSTUVWXYZ........"   (15-35) ← overlaps at PQRST

    Returns list of:
    {
        "text":   "chunk text here...",
        "source": "troubleshoot-windows-client",
        "chunk_index": 0
    }
    """
    chunks = []
    start  = 0
    index  = 0

    while start < len(text):
        end   = start + CHUNK_SIZE
        chunk = text[start:end].strip()

        if len(chunk) > 50:  # skip tiny chunks
            chunks.append({
                "text":        chunk,
                "source":      source,
                "chunk_index": index
            })
            index += 1

        # Move forward by chunk_size minus overlap
        start += CHUNK_SIZE - CHUNK_OVERLAP

    return chunks


def ingest_documents() -> int:
    """
    Read all .txt files from sops/ and ingest into ChromaDB.

    Steps per file:
    1. Read .txt file
    2. Split into chunks
    3. Build metadata per chunk
    4. Batch embed + store in ChromaDB

    Returns total chunks ingested.
    """
    txt_files = sorted(Path(SOPS_DIR).glob("*.txt"))

    if not txt_files:
        logger.warning(f"[DOCS] No .txt files in {SOPS_DIR}")
        logger.warning("[DOCS] Run extract_pdfs.py first")
        return 0

    logger.info(f"[DOCS] Found {len(txt_files)} SOP files")

    all_ids       = []
    all_texts     = []
    all_metadatas = []

    for txt_path in txt_files:
        source = txt_path.stem  # filename without .txt

        logger.info(f"[DOCS] Processing: {txt_path.name}")

        with open(txt_path, "r", encoding="utf-8") as f:
            text = f.read()

        # Detect category from filename
        category = detect_category_from_filename(source)

        chunks = chunk_text(text, source)
        logger.info(f"[DOCS]   → {len(chunks)} chunks")

        for chunk in chunks:
            chunk_id = f"{source}_chunk_{chunk['chunk_index']}"

            all_ids.append(chunk_id)
            all_texts.append(chunk["text"])
            all_metadatas.append({
                "source":      source,
                "category":    category,
                "chunk_index": chunk["chunk_index"],
                "type":        "sop_document"
            })

    if not all_texts:
        logger.warning("[DOCS] No chunks generated")
        return 0

    # Batch store all chunks
    add_to_collection(
        collection_name = COLLECTION,
        ids             = all_ids,
        texts           = all_texts,
        metadatas       = all_metadatas
    )

    logger.info(f"[DOCS] Ingested {len(all_texts)} chunks from {len(txt_files)} files")
    return len(all_texts)


def detect_category_from_filename(filename: str) -> str:
    """
    Guess category from filename.
    Used to tag chunks with category metadata.
    Allows RAG to filter by category if needed.

    Example:
    "troubleshoot-windows-client" → "network"
    "troubleshoot-sql"            → "database"
    "troubleshoot-microsoftteams" → "software"
    """
    filename_lower = filename.lower()

    if any(k in filename_lower for k in ["vpn", "network", "wifi",
                                          "wireless", "windows-client",
                                          "windows-server"]):
        return "network"
    elif any(k in filename_lower for k in ["password", "auth", "entra",
                                            "identity", "login", "sspr"]):
        return "auth"
    elif any(k in filename_lower for k in ["teams", "outlook", "exchange",
                                            "office", "microsoft-365"]):
        return "software"
    elif any(k in filename_lower for k in ["sql", "database", "db"]):
        return "database"
    elif any(k in filename_lower for k in ["printer", "hardware", "device"]):
        return "hardware"
    elif any(k in filename_lower for k in ["security", "malware", "virus"]):
        return "security"
    elif any(k in filename_lower for k in ["azure", "cloud", "onedrive",
                                            "sharepoint"]):
        return "cloud_app"
    else:
        return "other"