from __future__ import annotations

import os
import requests
from typing import Optional


class NvidiaReranker:
    """Reranks FAISS candidates using NVIDIA's llama-nemotron-rerank-1b-v2 API."""

    _API_URL = "https://ai.api.nvidia.com/v1/retrieval/nvidia/llama-nemotron-rerank-1b-v2/reranking"
    _MODEL = "nvidia/llama-nemotron-rerank-1b-v2"

    def __init__(self, api_key: Optional[str] = None, top_n: int = 3):
        self.api_key = api_key or os.getenv("NVIDIA_API_KEY", "")
        self.top_n = top_n
        self.enabled = bool(self.api_key)
        if not self.enabled:
            print("[reranker] NVIDIA_API_KEY not set — reranking disabled, using FAISS order")

    def rerank(self, query: str, candidates: list[dict]) -> list[dict]:
        """Return top_n candidates reranked by relevance. Falls back to original order if API fails."""
        if not self.enabled or not candidates:
            return candidates[:self.top_n]

        passages = [
            {"text": c.get("chunk_text", "")[:2000]}
            for c in candidates
        ]

        try:
            response = requests.post(
                self._API_URL,
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self._MODEL,
                    "query": {"text": query},
                    "passages": passages,
                    "truncate": "END",
                },
                timeout=10,
            )
            response.raise_for_status()
            rankings = response.json().get("rankings", [])
            ranked = sorted(rankings, key=lambda r: r["logit"], reverse=True)
            return [candidates[r["index"]] for r in ranked[: self.top_n]]
        except Exception as e:
            print(f"[reranker] API error ({e}), falling back to FAISS order")
            return candidates[:self.top_n]
