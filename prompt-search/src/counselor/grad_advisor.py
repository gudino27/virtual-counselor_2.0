import re


def _norm(code: str) -> str:
    """Collapse spaces so 'CPT S 121' and 'CPTS 121' both become 'CPTS121'."""
    return re.sub(r'\s+', '', code.upper())


class GradAdvisor:
    def __init__(self, retriever):
        self.retriever = retriever

    def get_remaining(self, degree_program: str, completed_courses: list) -> dict:
        completed_norm = {_norm(c) for c in completed_courses}

        # Search for the degree requirements chunk
        query = f"requirements for {degree_program} degree graduation courses"
        chunks = self.retriever.search(query, top_k=15)

        # Find the best matching degree_requirements chunk
        degree_chunk = None
        degree_norm = _norm(degree_program)
        for chunk in chunks:
            if chunk.get("chunk_type") == "degree_requirements":
                chunk_name_norm = _norm(chunk.get("degree_name", ""))
                # Accept if the degree name contains the search term or vice versa
                if degree_norm in chunk_name_norm or chunk_name_norm in degree_norm:
                    degree_chunk = chunk
                    break

        if degree_chunk is None:
            return {
                "degree_program": degree_program,
                "degree_chunk": None,
                "required_courses": [],
                "completed_matches": [],
                "remaining": [],
                "error": f"No degree requirements found for '{degree_program}'. "
                         "Try a name like 'Computer Science', 'Software Engineering', or 'Cybersecurity'.",
            }

        required = degree_chunk["required_courses"]

        # Normalize and match
        completed_matches = sorted(
            c for c in required if _norm(c) in completed_norm
        )
        remaining = sorted(
            c for c in required if _norm(c) not in completed_norm
        )

        return {
            "degree_program": degree_program,
            "degree_chunk": degree_chunk,
            "required_courses": required,
            "completed_matches": completed_matches,
            "remaining": remaining,
            "total_credits": degree_chunk.get("total_credits"),
            "error": None,
        }
