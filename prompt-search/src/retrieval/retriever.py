import json
import os
import re

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

_CS_QUERY_RE = re.compile(r'\b(cpts?|cpt\s*s|cs\s*\d{3}|computer science|comput)', re.IGNORECASE)
_PREFERRED_PREFIXES = {"CPT S", "MATH", "STAT", "PHYSICS", "CHEM"}
# Matches explicit course codes like "CPTS 583", "CPT S 450", "MATH 172"
_COURSE_CODE_RE = re.compile(r'\b([A-Za-z]{2,6}(?:\s[A-Za-z]{1,2})?)\s+(\d{3})\b')


def _prefix(code: str) -> str:
    parts = code.strip().split()
    if not parts:
        return ""
    return " ".join(parts[:-1]) if len(parts) > 1 else parts[0]


def _course_number(code: str) -> int:
    """Return the numeric part of a course code, or 0 if not parseable."""
    parts = code.strip().split()
    try:
        return int(parts[-1]) if parts else 0
    except ValueError:
        return 0


def _is_graduate(code: str) -> bool:
    return _course_number(code) >= 500


def _explicit_codes(query: str) -> set[str]:
    """Extract explicitly mentioned course codes from the query."""
    codes = set()
    for prefix, num in _COURSE_CODE_RE.findall(query):
        normalized = prefix.strip().upper().replace("CPTS", "CPT S") + " " + num
        codes.add(normalized)
    return codes


class CourseRetriever:
    def __init__(self, index_dir: str = "data/domain"):
        self.index = faiss.read_index(os.path.join(index_dir, "courses.faiss"))
        with open(os.path.join(index_dir, "metadata.json")) as f:
            self.metadata = json.load(f)
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def search(self, query: str, top_k: int = 5) -> list:
        explicit = _explicit_codes(query)
        explicitly_graduate = {c for c in explicit if _course_number(c.split()[-1] if c.split() else "") >= 500}

        # Force-inject explicitly mentioned courses so they're always in results
        pinned = []
        pinned_codes = set()
        for code in explicit:
            entry = self.get_by_code(code)
            if entry:
                e = dict(entry)
                e["score"] = 1.0  # max score — user asked for this directly
                pinned.append(e)
                pinned_codes.add(code)

        embedding = self.model.encode([query], convert_to_numpy=True).astype(np.float32)
        candidate_k = top_k * 4
        scores, indices = self.index.search(embedding, candidate_k)

        candidates = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            entry = dict(self.metadata[idx])
            code = entry.get("course_code", "")
            norm = code.strip().upper().replace("CPTS", "CPT S").replace("  ", " ")

            # Skip if already pinned
            if norm in pinned_codes:
                continue

            num = _course_number(code)
            if num >= 500:
                if norm not in explicitly_graduate:
                    continue

            entry["score"] = float(score)
            candidates.append(entry)

        # Rerank: boost preferred prefixes when query is CS-related
        if _CS_QUERY_RE.search(query):
            def _rank_key(e):
                boost = 0.15 if _prefix(e.get("course_code", "")) in _PREFERRED_PREFIXES else 0.0
                return e["score"] + boost
            candidates.sort(key=_rank_key, reverse=True)

        # Pinned courses first, then fill remaining slots with FAISS results
        remaining = top_k - len(pinned)
        return pinned + candidates[:max(remaining, 0)]

    def get_by_code(self, course_code: str):
        # Normalize by collapsing internal spaces so "CPTS 122" matches "CPT S 122"
        import re
        def _norm(code):
            return re.sub(r'\s+', '', code.upper())

        target = _norm(course_code)
        for entry in self.metadata:
            if _norm(entry["course_code"]) == target:
                return entry
        return None
