# backend/ingestion/base_ingestor.py
#
# ─────────────────────────────────────────
# WHAT THIS FILE DOES:
# Shared foundation used by both ingestors.
# Handles two core operations:
#   1. EMBEDDING  — converts text to vectors
#   2. CHROMADB   — stores and searches vectors
#
# WHY THESE TWO THINGS TOGETHER:
# Embedding and ChromaDB are always used together.
# Every ingestor needs to embed text and store it.
# Putting shared logic here avoids repeating code.
#
# HOW EMBEDDING WORKS:
# Text → sentence-transformers model → 384-dimension vector
# "VPN disconnecting" → [0.23, -0.45, 0.12, ... 384 numbers]
# Similar texts produce similar vectors
# RAG searches by vector similarity — finds closest matches
#
# HOW CHROMADB WORKS:
# ChromaDB is a local vector database
# Stores: vector + original text + metadata
# Query: give it a vector → returns most similar stored vectors
# Persistent: saves to disk at data/chroma_db/
# No server needed — runs in-process
#
# HOW IT CONNECTS:
# base_ingestor.py ← used by document_ingestor.py
# base_ingestor.py ← used by ticket_ingestor.py
# base_ingestor.py ← used by rag_service.py (for search)
# ─────────────────────────────────────────

import os
import logging
from typing import Optional
import chromadb
from chromadb.config import Settings
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────
# PATHS
# ─────────────────────────────────────────
BASE_DIR      = os.path.dirname(__file__)
CHROMA_DIR    = os.path.join(BASE_DIR, "data", "chroma_db")
os.makedirs(CHROMA_DIR, exist_ok=True)

# ─────────────────────────────────────────
# EMBEDDING MODEL
# all-MiniLM-L6-v2:
#   - 384 dimensions (compact but powerful)
#   - Already cached locally in your HuggingFace cache
#   - Fast: ~14ms per sentence on CPU
#   - Good for semantic similarity search
# ─────────────────────────────────────────
EMBEDDING_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
_embedding_model: Optional[SentenceTransformer] = None


def get_embedding_model() -> SentenceTransformer:
    """
    Load embedding model once — lazy loading.
    Loads from local HuggingFace cache.
    Already downloaded: models--sentence-transformers--all-MiniLM-L6-v2
    """
    global _embedding_model
    if _embedding_model is None:
        logger.info("[BASE] Loading embedding model from local cache...")
        _embedding_model = SentenceTransformer(
            EMBEDDING_MODEL_NAME,
            cache_folder=os.path.expanduser("~/.cache/huggingface/hub")
        )
        logger.info("[BASE] Embedding model loaded")
    return _embedding_model


def embed_text(text: str) -> list[float]:
    """
    Convert text to embedding vector.
    Returns list of 384 floats.

    Example:
    "VPN error 0x800704C9" → [0.23, -0.45, 0.12, ... 384 numbers]
    """
    model = get_embedding_model()
    vector = model.encode(text, convert_to_numpy=True)
    return vector.tolist()


def embed_batch(texts: list[str]) -> list[list[float]]:
    """
    Embed multiple texts at once — much faster than one by one.
    sentence-transformers processes in batches internally.
    Used by ingestors to process many chunks efficiently.
    """
    model = get_embedding_model()
    vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
    return vectors.tolist()


# ─────────────────────────────────────────
# CHROMADB CLIENT
# Persistent client — saves to disk
# Two collections:
#   "sop_documents" — Microsoft doc chunks
#   "resolved_tickets" — Past resolved tickets
# ─────────────────────────────────────────
_chroma_client: Optional[chromadb.PersistentClient] = None


def get_chroma_client() -> chromadb.PersistentClient:
    """
    Get or create ChromaDB persistent client.
    Data saved to: ingestion/data/chroma_db/
    Persists between runs — ingestion only needed once.
    """
    global _chroma_client
    if _chroma_client is None:
        _chroma_client = chromadb.PersistentClient(
            path=CHROMA_DIR,
        )
        logger.info(f"[BASE] ChromaDB client connected at {CHROMA_DIR}")
    return _chroma_client


def get_or_create_collection(name: str) -> chromadb.Collection:
    """
    Get existing ChromaDB collection or create new one.

    Two collections in our system:
    1. "sop_documents"   — chunks from Microsoft PDFs
    2. "resolved_tickets" — past resolved IT tickets from CSV

    Why two separate collections?
    They have different metadata schemas and serve different purposes.
    SOPs = general knowledge
    Tickets = specific past fixes with resolutions
    """
    client = get_chroma_client()
    collection = client.get_or_create_collection(
        name=name,
        metadata={"hnsw:space": "cosine"}
        # cosine similarity — better for text than euclidean distance
        # measures angle between vectors not absolute distance
    )
    return collection


def add_to_collection(
    collection_name: str,
    ids:             list[str],
    texts:           list[str],
    metadatas:       list[dict],
    batch_size:      int = 100
):
    """
    Add documents to ChromaDB collection in batches.

    Why batches?
    ChromaDB can handle large inserts but batching is safer
    for memory management with thousands of documents.

    What gets stored per document:
    - id:        unique identifier
    - embedding: vector (computed here)
    - document:  original text (for retrieval)
    - metadata:  source, category, priority etc
    """
    collection = get_or_create_collection(collection_name)

    total = len(texts)
    logger.info(f"[BASE] Adding {total} documents to '{collection_name}'")

    for i in range(0, total, batch_size):
        batch_ids       = ids[i:i + batch_size]
        batch_texts     = texts[i:i + batch_size]
        batch_metadatas = metadatas[i:i + batch_size]

        # Embed entire batch at once
        batch_embeddings = embed_batch(batch_texts)

        collection.add(
            ids        = batch_ids,
            embeddings = batch_embeddings,
            documents  = batch_texts,
            metadatas  = batch_metadatas
        )

        logger.info(
            f"[BASE] Added batch {i//batch_size + 1} "
            f"({min(i+batch_size, total)}/{total})"
        )

    logger.info(f"[BASE] Done — {total} documents in '{collection_name}'")


def search_collection(
    collection_name: str,
    query_text:      str,
    n_results:       int = 3,
    where:           Optional[dict] = None
) -> list[dict]:
    """
    Search ChromaDB collection by semantic similarity.
    Used by rag_service.py during AI pipeline.

    How it works:
    1. Embed query_text → query vector
    2. ChromaDB finds n_results most similar vectors
    3. Returns original text + metadata + distance score

    where: optional filter e.g. {"category": "network"}
           filters before similarity search

    Returns list of dicts:
    [
        {
            "text":     "VPN fix: change keep-alive to 25s...",
            "metadata": {"source": "vpn_troubleshooting", "category": "network"},
            "score":    0.89   ← similarity 0-1, higher is better
        },
        ...
    ]
    """
    collection = get_or_create_collection(collection_name)

    # Check collection has data
    count = collection.count()
    if count == 0:
        logger.warning(f"[BASE] Collection '{collection_name}' is empty")
        return []

    query_embedding = embed_text(query_text)

    kwargs = {
        "query_embeddings": [query_embedding],
        "n_results":        min(n_results, count),
        "include":          ["documents", "metadatas", "distances"]
    }

    if where:
        kwargs["where"] = where

    results = collection.query(**kwargs)

    # Format results
    formatted = []
    documents = results["documents"][0]
    metadatas = results["metadatas"][0]
    distances = results["distances"][0]

    for doc, meta, dist in zip(documents, metadatas, distances):
        # Convert cosine distance to similarity score
        # distance 0 = identical, distance 2 = opposite
        # similarity = 1 - (distance/2) maps to 0-1
        similarity = round(1 - (dist / 2), 3)
        formatted.append({
            "text":     doc,
            "metadata": meta,
            "score":    similarity
        })

    return formatted


def get_collection_stats() -> dict:
    """
    Returns count of documents in each collection.
    Used to verify ingestion worked correctly.
    """
    client = get_chroma_client()
    stats  = {}

    for name in ["sop_documents", "resolved_tickets"]:
        try:
            col        = client.get_collection(name)
            stats[name] = col.count()
        except Exception:
            stats[name] = 0

    return stats