"""
Course retriever.

Key changes vs. the previous version:
- Uses cosine similarity (IndexFlatIP over L2-normalized vectors). The index
  is built with normalized vectors, so query vectors must be normalized too.
- Degree-oriented queries ("what's left for my CS degree", "graduation
  requirements") now pin the matching degree_requirements chunk into the
  top results so the LLM actually sees it.
- The old grad-course filter (dropping any course with number >= 500 unless
  explicitly asked) was too aggressive — it also dropped relevant upper-div
  undergrad course info when the prefix matched a graduate course. We keep
  the filter but only apply it to >= 500 specifically, matching WSU's
  grad/undergrad convention.
"""
import json
import os
import re

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

_CS_QUERY_RE = re.compile(r'\b(cpts?|cpt\s*s|cs\s*\d{3}|computer science|comput)', re.IGNORECASE)
_PREFERRED_PREFIXES = {"CPT S", "MATH", "STAT", "PHYSICS", "CHEM"}
_COURSE_CODE_RE = re.compile(r'\b([A-Za-z]{2,8}(?:\s[A-Za-z]{1,2})?)\s+(\d{3})\b')

# Queries about degree progress / graduation / major requirements — we pin
# the best matching degree_requirements chunk into results.
_DEGREE_QUERY_RE = re.compile(
    r'\b(degree|graduat|requir|major|minor|remaining|what.s left|catalog requirements|'
    r'credit[s]? (do i|are|needed)|declare|bachelor|bs\b|ba\b)',
    re.IGNORECASE,
)

# Common short-name → canonical degree chunk substrings. Keep in sync with
# counselor.grad_advisor._DEGREE_ALIASES.
_DEGREE_KEYWORDS = [
    ("computer science", "Computer Science"),
    (" cs ", "Computer Science"),
    ("software engineering", "Software Engineering"),
    ("cybersecurity", "Cybersecurity"),
    ("electrical engineering", "Electrical Engineering"),
    ("mechanical engineering", "Mechanical Engineering"),
    ("computer engineering", "Computer Engineering"),
    ("data analytics", "Data Analytics"),
]


def _prefix(code: str) -> str:
    parts = code.strip().split()
    if not parts:
        return ""
    return " ".join(parts[:-1]) if len(parts) > 1 else parts[0]


def _course_number(code: str) -> int:
    parts = code.strip().split()
    try:
        return int(parts[-1]) if parts else 0
    except ValueError:
        return 0


def _explicit_codes(query: str) -> set:
    codes = set()
    for prefix, num in _COURSE_CODE_RE.findall(query):
        normalized = prefix.strip().upper().replace("CPTS", "CPT S") + " " + num
        codes.add(normalized)
    return codes


def _norm_name(s: str) -> str:
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def _build_index(index_dir: str) -> None:
    """Build courses.faiss from scratch if it is missing."""
    import subprocess
    import sys
    scripts_dir = os.path.join(os.path.dirname(__file__), "..", "..", "scripts")
    build_script = os.path.abspath(os.path.join(scripts_dir, "build_index.py"))
    print(f"[retriever] courses.faiss not found — building index from {build_script} ...")
    subprocess.run([sys.executable, build_script], check=True)
    print("[retriever] Index build complete.")


class CourseRetriever:
    def __init__(self, index_dir: str = "data/domain"):
        faiss_path = os.path.join(index_dir, "courses.faiss")
        if not os.path.exists(faiss_path):
            _build_index(index_dir)
        self.index = faiss.read_index(faiss_path)
        with open(os.path.join(index_dir, "metadata.json")) as f:
            self.metadata = json.load(f)
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def _pin_degree_chunks(self, query: str) -> list:
        """If the query mentions a degree program, return the best matching
        degree_requirements chunk(s) with max score so they are surfaced."""
        q = " " + query.lower() + " "
        if not _DEGREE_QUERY_RE.search(query):
            return []

        wanted_substrings = []
        for needle, canonical in _DEGREE_KEYWORDS:
            if needle in q:
                wanted_substrings.append(canonical.upper())

        if not wanted_substrings:
            return []

        pinned = []
        for chunk in self.metadata:
            if chunk.get("chunk_type") != "degree_requirements":
                continue
            name = chunk.get("degree_name", "").upper()
            if any(sub in name for sub in wanted_substrings):
                e = dict(chunk)
                e["score"] = 1.0
                pinned.append(e)

        # Prefer chunks with more required_courses (most detailed)
        pinned.sort(key=lambda c: -len(c.get("required_courses", [])))
        # Cap at 2 pinned degree chunks to leave room for course chunks
        return pinned[:2]

    def search(self, query: str, top_k: int = 5) -> list:
        explicit = _explicit_codes(query)
        explicitly_graduate = {
            c for c in explicit if _course_number(c) >= 500
        }

        # Pin explicitly-mentioned courses
        pinned_courses = []
        pinned_codes = set()
        for code in explicit:
            entry = self.get_by_code(code)
            if entry:
                e = dict(entry)
                e["score"] = 1.0
                pinned_courses.append(e)
                pinned_codes.add(code)

        # Pin matching degree_requirements chunks when the query is about
        # a specific program
        pinned_degrees = self._pin_degree_chunks(query)

        # Dense retrieval with cosine similarity
        embedding = self.model.encode([query], convert_to_numpy=True).astype(np.float32)
        faiss.normalize_L2(embedding)
        candidate_k = max(top_k * 4, 20)
        scores, indices = self.index.search(embedding, candidate_k)

        candidates = []
        degree_pinned_ids = {id(p) for p in pinned_degrees}
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1:
                continue
            entry = dict(self.metadata[idx])

            # De-dup against pinned courses
            code = entry.get("course_code", "")
            if code:
                norm = code.strip().upper().replace("CPTS", "CPT S").replace("  ", " ")
                if norm in pinned_codes:
                    continue

            # De-dup against pinned degree chunks
            if entry.get("chunk_type") == "degree_requirements":
                name = entry.get("degree_name", "").upper()
                if any(name == p.get("degree_name", "").upper() for p in pinned_degrees):
                    continue

            num = _course_number(code) if code else 0
            if num >= 500:
                norm = code.strip().upper().replace("CPTS", "CPT S").replace("  ", " ")
                if norm not in explicitly_graduate:
                    continue

            entry["score"] = float(score)
            candidates.append(entry)

        # Re-rank: boost preferred prefixes for CS queries
        if _CS_QUERY_RE.search(query):
            def _rank_key(e):
                boost = 0.1 if _prefix(e.get("course_code", "")) in _PREFERRED_PREFIXES else 0.0
                return e["score"] + boost
            candidates.sort(key=_rank_key, reverse=True)

        # Assembly order: explicit courses > degree chunks > dense candidates
        head = pinned_courses + pinned_degrees
        remaining = max(top_k - len(head), 0)
        return head + candidates[:remaining]

    def get_by_code(self, course_code: str):
        def _norm(code):
            return re.sub(r"\s+", "", code.upper())

        target = _norm(course_code)
        for entry in self.metadata:
            code = entry.get("course_code")
            if code and _norm(code) == target:
                return entry
        return None
