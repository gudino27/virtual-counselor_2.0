from unittest.mock import MagicMock

from src.counselor.grad_advisor import GradAdvisor


def _make_retriever(chunks):
    retriever = MagicMock()
    retriever.search.return_value = chunks
    return retriever


def _degree_chunk(degree_name, required_courses, total_credits=120):
    """Build a properly shaped degree_requirements chunk."""
    return {
        "chunk_type": "degree_requirements",
        "degree_name": degree_name,
        "total_credits": total_credits,
        "required_courses": required_courses,
        "chunk_text": f"{degree_name} ({total_credits} CREDITS) " + " ".join(required_courses),
        "course_code": "",
        "prereq_raw": "",
    }


class TestGradAdvisor:
    def test_all_remaining(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121", "CPTS 122", "MATH 171"])
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", [])
        assert "CPTS 121" in result["remaining"]
        assert "MATH 171" in result["remaining"]
        assert result["completed_matches"] == []
        assert result["error"] is None

    def test_some_completed(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121", "CPTS 122", "MATH 171"])
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", ["CPTS 121", "MATH 171"])
        assert "CPTS 121" not in result["remaining"]
        assert "MATH 171" not in result["remaining"]
        assert "CPTS 122" in result["remaining"]
        assert "CPTS 121" in result["completed_matches"]

    def test_all_completed(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121"])
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", ["CPTS 121"])
        assert result["remaining"] == []
        assert "CPTS 121" in result["completed_matches"]
        assert result["error"] is None

    def test_no_chunks_found(self):
        advisor = GradAdvisor(_make_retriever([]))
        result = advisor.get_remaining("Unknown Degree", ["CPTS 121"])
        assert result["required_courses"] == []
        assert result["remaining"] == []
        assert result["error"] is not None

    def test_chunks_used_returns_degree_chunk(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121", "MATH 171"])
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", [])
        assert result["degree_chunk"] is not None
        assert result["degree_chunk"]["chunk_type"] == "degree_requirements"

    def test_case_insensitive_completed(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121"])
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", ["cpts 121"])
        assert result["remaining"] == []

    def test_total_credits_returned(self):
        chunk = _degree_chunk("Computer Science", ["CPTS 121"], total_credits=120)
        advisor = GradAdvisor(_make_retriever([chunk]))
        result = advisor.get_remaining("Computer Science", [])
        assert result["total_credits"] == 120
