from __future__ import annotations

import re
import numpy as np
from rank_bm25 import BM25Okapi
from .retriever import CourseRetriever


def _tokenize(text: str) -> list[str]:
    return re.findall(r"\b\w+\b", text.lower())


class HybridRetriever:
    """Combines FAISS (semantic) + BM25 (lexical) scores via reciprocal rank fusion."""

    def __init__(self, retriever: CourseRetriever, alpha: float = 0.5):
        self.retriever = retriever
        self.alpha = alpha  # weight for FAISS; (1-alpha) for BM25
        corpus = [_tokenize(m.get("chunk_text", "")) for m in retriever.metadata]
        self.bm25 = BM25Okapi(corpus)
        self.metadata = retriever.metadata

    def search(self, query: str, top_k: int = 30) -> list[dict]:
        # --- FAISS scores (normalised 0-1) ---
        fetch_k = min(top_k * 2, len(self.metadata))
        faiss_results = self.retriever.search(query, top_k=fetch_k)
        faiss_rank = {r["course_code"]: i for i, r in enumerate(faiss_results)}

        # --- BM25 scores ---
        tokens = _tokenize(query)
        bm25_scores = self.bm25.get_scores(tokens)
        top_bm25_idx = np.argsort(bm25_scores)[::-1][:fetch_k]

        # Build candidate pool
        seen, candidates = set(), []
        for r in faiss_results:
            key = r.get("course_code", "")
            if key not in seen:
                seen.add(key)
                candidates.append(r)

        for idx in top_bm25_idx:
            entry = dict(self.metadata[idx])
            key = entry.get("course_code", "")
            if key not in seen:
                seen.add(key)
                candidates.append(entry)

        # --- Reciprocal rank fusion ---
        bm25_rank = {
            dict(self.metadata[idx]).get("course_code", ""): rank
            for rank, idx in enumerate(top_bm25_idx)
        }
        k = 60  # RRF constant
        for c in candidates:
            code = c.get("course_code", "")
            fr = faiss_rank.get(code, fetch_k)
            br = bm25_rank.get(code, fetch_k)
            c["_rrf"] = self.alpha * (1 / (k + fr)) + (1 - self.alpha) * (1 / (k + br))

        candidates.sort(key=lambda c: c["_rrf"], reverse=True)
        return candidates[:top_k]
