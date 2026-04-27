"""
Degree-requirements lookup.

The previous implementation fetched the top-15 FAISS results and hoped the
target degree chunk was in there. With 191 degree chunks indexed, high-demand
ones like Computer Science were often outside the top-15, producing
"No degree requirements found". This implementation scans *all* degree
chunks in metadata directly and uses a normalized name match with aliases.
"""
import re


def _norm(code: str) -> str:
    """Collapse whitespace, drop punctuation, uppercase."""
    return re.sub(r"[^A-Z0-9]", "", code.upper())


# Aliases: user-facing short name -> canonical chunk name substring(s) to match.
# Order matters — more specific aliases first.
_DEGREE_ALIASES = {
    "CS": ["Bachelor of Science, Computer Science", "Computer Science"],
    "COMPUTER SCIENCE": ["Bachelor of Science, Computer Science", "Computer Science"],
    "SOFTWARE ENGINEERING": ["Software Engineering"],
    "CYBERSECURITY": ["Cybersecurity"],
    "EE": ["Electrical Engineering"],
    "ELECTRICAL ENGINEERING": ["Electrical Engineering"],
    "ME": ["Mechanical Engineering"],
    "MECHANICAL ENGINEERING": ["Mechanical Engineering"],
    "COMPUTER ENGINEERING": ["Computer Engineering"],
    "BIOENGINEERING": ["Bioengineering"],
    "DATA ANALYTICS": ["Data Analytics", "Computation Option"],
    "MATH": ["Mathematics"],
    "STATISTICS": ["Statistics Option", "Statistics"],
}


def _aliases_for(query: str) -> list:
    q = query.strip().upper()
    if q in _DEGREE_ALIASES:
        return _DEGREE_ALIASES[q]
    # Fall back to using the query itself as the substring
    return [query.strip()]


class GradAdvisor:
    def __init__(self, retriever):
        self.retriever = retriever

    def _all_degree_chunks(self) -> list:
        return [
            c for c in self.retriever.metadata
            if c.get("chunk_type") == "degree_requirements"
        ]

    def _find_chunk(self, degree_program: str):
        """Find the best matching degree_requirements chunk.

        Tries each alias in order. For each alias, prefers exact-substring
        matches over fuzzy ones, and prefers the chunk whose normalized name
        *starts with* the alias (to pick "Computer Science" over
        "Computer Engineering" when the query is "Computer Science").
        """
        chunks = self._all_degree_chunks()
        aliases = _aliases_for(degree_program)

        for alias in aliases:
            alias_norm = _norm(alias)
            exact_hits = []
            contains_hits = []
            for c in chunks:
                name_norm = _norm(c.get("degree_name", ""))
                if not name_norm:
                    continue
                if name_norm == alias_norm:
                    return c  # perfect match
                if alias_norm in name_norm:
                    exact_hits.append(c)
                elif name_norm in alias_norm and len(name_norm) > 5:
                    contains_hits.append(c)

            # Prefer the chunk with the most required courses (most detailed)
            if exact_hits:
                exact_hits.sort(key=lambda c: -len(c.get("required_courses", [])))
                return exact_hits[0]
            if contains_hits:
                contains_hits.sort(key=lambda c: -len(c.get("required_courses", [])))
                return contains_hits[0]

        return None

    def get_remaining(self, degree_program: str, completed_courses: list) -> dict:
        completed_norm = {_norm(c) for c in completed_courses}
        degree_chunk = self._find_chunk(degree_program)

        if degree_chunk is None:
            return {
                "degree_program": degree_program,
                "degree_chunk": None,
                "required_courses": [],
                "completed_matches": [],
                "remaining": [],
                "error": (
                    f"No degree requirements found for '{degree_program}'. "
                    "Try a name like 'Computer Science', 'Software Engineering', "
                    "or 'Cybersecurity'."
                ),
            }

        required = degree_chunk.get("required_courses", [])
        completed_matches = sorted(c for c in required if _norm(c) in completed_norm)
        remaining = sorted(c for c in required if _norm(c) not in completed_norm)

        return {
            "degree_program": degree_program,
            "degree_chunk": degree_chunk,
            "required_courses": required,
            "completed_matches": completed_matches,
            "remaining": remaining,
            "total_credits": degree_chunk.get("total_credits"),
            "error": None,
        }
