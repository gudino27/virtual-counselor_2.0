"""
Bridge to the Express/SQLite backend for degree and course data.
Primary: HTTP calls to the running Express API (port 3008).
Fallback: direct SQLite via /tmp copy when the server is down.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
from pathlib import Path
from typing import Optional, Union

import requests

_API_BASE = os.environ.get("VC_API_URL", "http://localhost:3008")
_DEFAULT_DB = Path(__file__).parents[3] / "data" / "courses.db"
_TMP_DB = Path("/tmp/vc_courses.db")
_TIMEOUT = 3  # seconds


# ---------------------------------------------------------------------------
# Local SQLite fallback
# ---------------------------------------------------------------------------

def _ensure_local() -> Path:
    if not _TMP_DB.exists() or (
        _DEFAULT_DB.exists()
        and _DEFAULT_DB.stat().st_mtime > _TMP_DB.stat().st_mtime
    ):
        shutil.copy2(str(_DEFAULT_DB), str(_TMP_DB))
    return _TMP_DB


def _db():
    return sqlite3.connect(str(_ensure_local()))


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

class CourseDB:
    """
    Thin wrapper — tries the Express API first, falls back to direct SQLite.
    All methods return plain dicts / lists of dicts.
    """

    def _api(self, path: str, params: dict) -> Optional[Union[dict, list]]:
        try:
            r = requests.get(f"{_API_BASE}{path}", params=params, timeout=_TIMEOUT)
            if r.ok:
                return r.json()
        except Exception:
            pass
        return None

    # ------------------------------------------------------------------
    # Degree requirements
    # ------------------------------------------------------------------

    def get_degree_requirements(self, name: str, catalog_year: Optional[str] = None) -> Optional[dict]:
        """
        Return degree info + course requirements list.
        Shape: {name, credits, catalog_year, courses: [{year, term, label, hours}]}
        """
        params = {"type": "degree", "name": name}
        if catalog_year:
            params["catalogYear"] = catalog_year

        result = self._api("/api/degree-requirements", params)
        if result and "degree" in result:
            deg = result["degree"]
            courses = []
            for block in result.get("schedule", []):
                for c in block.get("courses", []):
                    label = c.get("raw") or f"{c.get('prefix','')} {c.get('number','')}".strip()
                    courses.append({
                        "year": block["year"],
                        "term": block["term"],
                        "label": label,
                        "hours": c.get("credits", 0),
                    })
            return {
                "name": deg.get("title", name),
                "credits": deg.get("totalHours"),
                "catalog_year": None,
                "courses": courses,
            }

        # Fallback
        conn = _db()
        try:
            row = conn.execute(
                "SELECT id, name, credits, catalog_year FROM catalog_degrees "
                "WHERE name LIKE ? AND credits IS NOT NULL "
                "ORDER BY catalog_year DESC LIMIT 1",
                (f"%{name}%",),
            ).fetchone()
            if not row:
                return None
            deg_id, deg_name, credits, year = row
            courses = conn.execute(
                "SELECT year, term, label, hours FROM degree_requirements "
                "WHERE degree_id = ? ORDER BY year, term, sort_order",
                (deg_id,),
            ).fetchall()
            return {
                "name": deg_name,
                "credits": credits,
                "catalog_year": year,
                "courses": [{"year": c[0], "term": c[1], "label": c[2], "hours": c[3]} for c in courses],
            }
        finally:
            conn.close()

    def get_degree_credits(self, name: str, catalog_year: Optional[str] = None) -> Optional[int]:
        """Return total credit requirement for a degree."""
        result = self.get_degree_requirements(name, catalog_year)
        if result:
            return result.get("credits")
        return None

    # ------------------------------------------------------------------
    # Catalog courses
    # ------------------------------------------------------------------

    def get_catalog_course(self, code: str, catalog_year: Optional[str] = None) -> Optional[dict]:
        """Fetch a single course by code (e.g. 'CPT S 223' or 'CPTS 223')."""
        normalized = code.strip().upper().replace("CPTS", "CPT S").replace("  ", " ")
        params = {"code": normalized}
        if catalog_year:
            params["year"] = catalog_year

        result = self._api("/api/catalog/courses", params)
        if result and result.get("courses"):
            return result["courses"][0]

        # Fallback: catalog_courses table
        conn = _db()
        try:
            q = "SELECT code, title, credits, ucore, prerequisite_raw, description FROM catalog_courses WHERE code = ?"
            args = [normalized]
            if catalog_year:
                q += " AND catalog_year = ?"
                args.append(catalog_year)
            q += " ORDER BY catalog_year DESC LIMIT 1"
            row = conn.execute(q, args).fetchone()
            if row:
                return {"code": row[0], "title": row[1], "credits": row[2],
                        "ucore": row[3], "prereq_raw": row[4], "description": row[5]}

            # Secondary fallback: courses table (schedule/section data with prereqs)
            parts = normalized.split()
            if len(parts) >= 2:
                prefix = " ".join(parts[:-1])
                number = parts[-1]
                row2 = conn.execute(
                    "SELECT prefix, courseNumber, title, coursePrerequisite FROM courses "
                    "WHERE REPLACE(UPPER(prefix),' ','') = REPLACE(UPPER(?),' ','') AND courseNumber = ? LIMIT 1",
                    (prefix, number),
                ).fetchone()
                if row2:
                    return {"code": f"{row2[0]} {row2[1]}", "title": row2[2],
                            "credits": None, "ucore": None, "prereq_raw": row2[3], "description": None}
            return None
        finally:
            conn.close()

    def get_ucore_courses(self, category: str, catalog_year: Optional[str] = None) -> list:
        """Return courses satisfying a UCORE category."""
        params = {"ucore": category, "limit": "30"}
        if catalog_year:
            params["year"] = catalog_year

        result = self._api("/api/catalog/courses", params)
        if result and result.get("courses"):
            return result["courses"]

        # Fallback
        conn = _db()
        try:
            q = "SELECT code, title, credits FROM catalog_courses WHERE ucore LIKE ?"
            args = [f"%{category}%"]
            if catalog_year:
                q += " AND catalog_year = ?"
                args.append(catalog_year)
            q += " ORDER BY catalog_year DESC, code LIMIT 30"
            rows = conn.execute(q, args).fetchall()
            return [{"code": r[0], "title": r[1], "credits": r[2]} for r in rows]
        finally:
            conn.close()

    def get_course_sections(self, codes: list) -> list:
        """
        Return upcoming section info for a list of course codes.
        Picks the latest term available in the DB automatically.
        Returns list of dicts with keys: code, term, year, dayTime, instructor,
        seatsAvailable, maxEnrollment, status.
        """
        conn = _db()
        try:
            # Find the most recent term available
            row = conn.execute(
                "SELECT year, term FROM courses "
                "ORDER BY year DESC, CASE term WHEN 'Fall' THEN 3 WHEN 'Summer' THEN 2 WHEN 'Spring' THEN 1 ELSE 0 END DESC "
                "LIMIT 1"
            ).fetchone()
            if not row:
                return []
            latest_year, latest_term = row

            results = []
            for code in codes:
                parts = code.strip().split()
                if len(parts) < 2:
                    continue
                prefix = " ".join(parts[:-1])
                number = parts[-1]
                rows = conn.execute(
                    "SELECT prefix, courseNumber, sectionNumber, term, year, dayTime, "
                    "instructor, seatsAvailable, maxEnrollment, status, instructionMode, isLab "
                    "FROM courses "
                    "WHERE REPLACE(UPPER(prefix),' ','') = REPLACE(UPPER(?),' ','') "
                    "AND courseNumber = ? AND year = ? AND term = ? "
                    "ORDER BY isLab, sectionNumber",
                    (prefix, number, latest_year, latest_term),
                ).fetchall()
                for r in rows:
                    daytime = (r[5] or "").strip()
                    if not daytime or daytime == "ARRGT":
                        continue
                    results.append({
                        "code": f"{r[0]} {r[1]}",
                        "section": r[2],
                        "term": r[3],
                        "year": r[4],
                        "dayTime": daytime,
                        "instructor": r[6] or "TBA",
                        "seatsAvailable": r[7],
                        "maxEnrollment": r[8],
                        "status": r[9] or "unknown",
                        "mode": r[10] or "",
                        "isLab": bool(r[11]),
                    })
            return results
        finally:
            conn.close()

    def get_core_courses_summary(self, degree_name: str, catalog_year: Optional[str] = None) -> str:
        """
        Return a compact plain-text summary of required courses for a degree,
        grouped by year/term — suitable for injecting into an LLM prompt.
        """
        req = self.get_degree_requirements(degree_name, catalog_year)
        if not req:
            return ""

        lines = [f"{req['name']} ({req.get('catalog_year','')}) — {req.get('credits','120')} total credits"]
        by_year: dict[int, dict[int, list]] = {}
        for c in req.get("courses", []):
            by_year.setdefault(c["year"], {}).setdefault(c["term"], []).append(
                f"{c['label']} ({c['hours']} cr)"
            )
        for yr in sorted(by_year):
            for term in sorted(by_year[yr]):
                courses_str = ", ".join(by_year[yr][term])
                lines.append(f"  Year {yr} Term {term}: {courses_str}")

        return "\n".join(lines)
