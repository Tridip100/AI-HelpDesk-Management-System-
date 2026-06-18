# backend/services/solution_cache_service.py
#
# Solution Cache — "Eval concept"
# Before running the full NLP→RAG→LLM pipeline,
# check if we've solved this exact problem before.
# Hit rate improves over time as more tickets get resolved.

import logging
from typing import Optional
from backend.ingestion.base_ingestor import embed_text, get_chroma_client

logger = logging.getLogger(__name__)

CACHE_COLLECTION = "solution_cache"
HIT_THRESHOLD    = 0.92  # very high — only return if near-identical problem


def get_cached_solution(problem_text: str) -> Optional[dict]:
    """
    Check ChromaDB for a previously solved identical problem.
    Returns solution dict if found, None if not.
    """
    try:
        client     = get_chroma_client()
        collection = client.get_or_create_collection(CACHE_COLLECTION)

        if collection.count() == 0:
            return None

        embedding = embed_text(problem_text)
        results   = collection.query(
            query_embeddings=[embedding],
            n_results=1,
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"][0]:
            return None

        distance   = results["distances"][0][0]
        similarity = 1 - distance

        if similarity < HIT_THRESHOLD:
            logger.info(f"[CACHE] Miss — similarity={similarity:.3f}")
            return None

        metadata = results["metadatas"][0][0]
        solution = results["documents"][0][0]

        logger.info(f"[CACHE] HIT — similarity={similarity:.3f} category={metadata.get('category')}")

        _increment_use_count(collection, results["ids"][0][0], metadata)

        return {
            "solution":   solution,
            "confidence": float(metadata.get("confidence", 0.85)),
            "category":   metadata.get("category", "unknown"),
            "priority":   metadata.get("priority", "P3"),
            "similarity": similarity,
            "from_cache": True,
        }

    except Exception as e:
        logger.error(f"[CACHE] Lookup failed: {e}")
        return None


def store_solution(
    problem_text: str,
    solution:     str,
    confidence:   float,
    category:     str,
    priority:     str,
) -> bool:
    """
    Store a successful solution in ChromaDB cache.
    Called after ticket resolved or high-confidence AI answer.
    Only stores if confidence >= 0.75.
    """
    if confidence < 0.75:
        logger.info(f"[CACHE] Not storing — confidence too low ({confidence})")
        return False

    try:
        client     = get_chroma_client()
        collection = client.get_or_create_collection(CACHE_COLLECTION)

        embedding = embed_text(problem_text)
        doc_id    = f"cache_{abs(hash(problem_text))}"

        collection.upsert(
            ids        = [doc_id],
            embeddings = [embedding],
            documents  = [solution],
            metadatas  = [{
                "category":        category or "unknown",
                "priority":        priority or "P3",
                "confidence":      str(confidence),
                "use_count":       "0",
                "problem_preview": problem_text[:200],
            }],
        )

        logger.info(f"[CACHE] Stored — category={category} confidence={confidence}")
        return True

    except Exception as e:
        logger.error(f"[CACHE] Store failed: {e}")
        return False


def _increment_use_count(collection, doc_id: str, metadata: dict):
    try:
        use_count          = int(metadata.get("use_count", 0)) + 1
        metadata["use_count"] = str(use_count)
        collection.update(ids=[doc_id], metadatas=[metadata])
    except Exception as e:
        logger.error(f"[CACHE] Failed to increment use count: {e}")