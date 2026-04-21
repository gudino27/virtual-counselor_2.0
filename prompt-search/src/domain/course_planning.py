import json
import sqlite3
from pathlib import Path

DEFAULT_DB = Path(__file__).parent.parent.parent.parent / "data" / "courses.db"
DEFAULT_TEST_CASES = Path(__file__).parent.parent.parent / "data" / "benchmarks" / "test_cases.json"


class CoursePlanningBenchmark:
    def __init__(self, db_path: str = str(DEFAULT_DB), test_cases_path: str = str(DEFAULT_TEST_CASES)):
        self.db_path = str(db_path)
        test_cases_file = Path(test_cases_path)
        if test_cases_file.exists():
            with open(test_cases_file) as f:
                self.test_cases = json.load(f)
        else:
            self.test_cases = []

    def _connect(self):
        return sqlite3.connect(self.db_path)

    def get_prerequisite_chain(self, course_code: str) -> list[str]:
        """Return the flat prerequisite chain for a course by querying catalog_courses."""
        visited = set()
        chain = []

        def _fetch(code):
            if code in visited:
                return
            visited.add(code)
            with self._connect() as conn:
                row = conn.execute(
                    "SELECT prerequisite_codes FROM catalog_courses WHERE code = ? LIMIT 1",
                    (code,)
                ).fetchone()
            if not row or not row[0]:
                return
            prereqs = json.loads(row[0])
            for p in prereqs:
                if p not in visited:
                    chain.append(p)
                    _fetch(p)

        _fetch(course_code)
        return chain

    def filter_by_category(self, category: str) -> list[dict]:
        """Return test cases whose 'category' field matches the given value."""
        return [tc for tc in self.test_cases if tc.get("category") == category]
