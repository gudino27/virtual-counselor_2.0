import re

# Matches codes like "CPT S 121", "CPTS 121", "MATH 171" — prefix may have an internal space
COURSE_CODE_RE = re.compile(r'\b([A-Z]{2,6}(?:\s[A-Z])?\s+\d{3,4})\b')


def _norm(code: str) -> str:
    return re.sub(r'\s+', '', code.upper())


def parse_prereq_codes(prereq_raw: str) -> list:
    raw = COURSE_CODE_RE.findall(prereq_raw.upper())
    # Return normalized (space-collapsed) codes so "CPT S 121" -> "CPTS121"
    # but keep the original spacing for display — store as-is, compare via _norm
    return [r.strip() for r in raw]


class PrereqChecker:
    def __init__(self, retriever):
        self.retriever = retriever

    def check(self, course_code: str, completed_courses: list) -> dict:
        # Normalize completed courses by collapsing spaces for comparison
        completed_norm = {_norm(c) for c in completed_courses}
        course = self.retriever.get_by_code(course_code)

        if course is None:
            return {
                "found": False,
                "can_take": False,
                "missing": [],
                "prereqs": [],
            }

        prereqs = parse_prereq_codes(course.get("prereq_raw", ""))
        missing = [p for p in prereqs if _norm(p) not in completed_norm]
        satisfied = [p for p in prereqs if _norm(p) in completed_norm]

        return {
            "found": True,
            "course_code": course["course_code"],
            "can_take": len(missing) == 0,
            "prereqs": prereqs,
            "missing": missing,
            "completed": satisfied,
        }
