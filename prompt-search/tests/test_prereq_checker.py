from unittest.mock import MagicMock

from src.counselor.prereq_checker import PrereqChecker, parse_prereq_codes


class TestParsePrereqCodes:
    def test_single_prereq(self):
        assert parse_prereq_codes("CPTS 121") == ["CPTS 121"]

    def test_multiple_prereqs(self):
        result = parse_prereq_codes("Prereq: CPTS 121 and MATH 171")
        assert "CPTS 121" in result
        assert "MATH 171" in result

    def test_empty_string(self):
        assert parse_prereq_codes("") == []

    def test_no_codes(self):
        assert parse_prereq_codes("No prerequisites required.") == []

    def test_or_prereqs(self):
        result = parse_prereq_codes("MATH 201 or MATH 202")
        assert "MATH 201" in result
        assert "MATH 202" in result


class TestPrereqChecker:
    def _make_retriever(self, course_code, prereq_raw):
        retriever = MagicMock()
        retriever.get_by_code.return_value = {
            "course_code": course_code,
            "prereq_raw": prereq_raw,
            "chunk_text": f"{course_code} some course description",
        }
        return retriever

    def test_course_not_found(self):
        retriever = MagicMock()
        retriever.get_by_code.return_value = None
        checker = PrereqChecker(retriever)
        result = checker.check("CPTS 999", [])
        assert result["found"] is False
        assert result["can_take"] is False

    def test_no_prereqs_can_take(self):
        retriever = self._make_retriever("CPTS 101", "")
        checker = PrereqChecker(retriever)
        result = checker.check("CPTS 101", [])
        assert result["found"] is True
        assert result["can_take"] is True
        assert result["missing"] == []

    def test_prereqs_satisfied(self):
        retriever = self._make_retriever("CPTS 360", "CPTS 121 and CPTS 122")
        checker = PrereqChecker(retriever)
        result = checker.check("CPTS 360", ["CPTS 121", "CPTS 122", "MATH 171"])
        assert result["can_take"] is True
        assert result["missing"] == []
        assert "CPTS 121" in result["completed"]

    def test_prereqs_missing(self):
        retriever = self._make_retriever("CPTS 360", "CPTS 121 and CPTS 122")
        checker = PrereqChecker(retriever)
        result = checker.check("CPTS 360", ["CPTS 121"])
        assert result["can_take"] is False
        assert "CPTS 122" in result["missing"]

    def test_case_insensitive_completed(self):
        retriever = self._make_retriever("CPTS 360", "CPTS 121")
        checker = PrereqChecker(retriever)
        result = checker.check("CPTS 360", ["cpts 121"])
        assert result["can_take"] is True
