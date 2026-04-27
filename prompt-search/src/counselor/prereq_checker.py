"""
Prerequisite parsing and eligibility checking.

Parses free-form prereq text like:
    "CPT S 215, 223, or 233, with a C or better; admitted to a major in EECS"
    "MATH 108, 171, 172, 182 or higher, each with a C or better"
    "PHYSICS 201 and MATH 171 (or concurrent enrollment)"

into a disjunctive normal form (DNF) represented as a list of AND-groups,
where each AND-group is a list of course codes that would satisfy it
(one of them suffices — they are OR'd within a group).

    parse_prereqs("CPT S 215, 223, or 233; MATH 216")
    -> [["CPT S 215", "CPT S 223", "CPT S 233"], ["MATH 216"]]

A student can take the course iff every AND-group has at least one
course in their completed set (or a concurrent set, if the group is
marked concurrent-allowed).
"""
import re

# Words that must not be treated as course prefixes even though they're uppercase
# 2-6 letters long. Extend as new false positives appear.
_STOPWORD_PREFIXES = {
    "OR", "AND", "THE", "OF", "AT", "IN", "BY", "TO", "WITH", "A", "AN",
    "IF", "OR", "FOR", "FROM", "AS", "ON", "UP", "BE", "IS", "ARE", "NOT",
    "MAY", "CAN", "EACH", "OR", "ALSO", "ONE", "TWO", "ANY", "ALL", "BOTH",
    "HIGHER", "LOWER", "ABOVE", "BELOW", "ABOUT", "BEST", "THIS", "THESE",
    "THAT", "THOSE", "SOME", "MOST", "SUCH", "VIA", "PER", "NEW", "OLD",
    "PASS", "TAKE", "HAVE", "HAD", "HAS", "WAS", "WILL", "SHALL", "WOULD",
    "SHOULD", "COULD", "ALEKS", "SAT", "AP", "BS", "BA", "GPA", "OR",
    "REACH", "WRTG", "ARTS", "DIVR", "HUM", "SSCI", "BSCI", "PSCI", "EQJS",
    "ROOT",
}

# Valid-looking course prefixes seen at WSU. If a token matches one of these
# (exact, or plus an optional trailing single letter like "CPT S"), it is
# definitely a course prefix. Used as an allowlist for ambiguous cases.
_KNOWN_PREFIXES = {
    "CPT S", "CPTS", "MATH", "STAT", "PHYSICS", "PHYS", "CHEM", "BIOLOGY",
    "BIO", "ENGL", "HIST", "HISTORY", "COM", "COMSTM", "EE", "E E", "MECH",
    "M E", "ME", "CE", "C E", "BE", "B E", "BIOENG", "BEE", "SOC", "SOCS",
    "PSYCH", "PSYC", "ECON", "ECONS", "MUS", "MUSIC", "ART", "ENGR",
    "UCORE", "SPAN", "FR", "GER", "CHIN", "JAPN", "NUTR", "KINES",
    "HBM", "MGMT", "MKTG", "FIN", "ACCTG", "PHIL", "POL S", "POLS",
    "ANTH", "ANTHRO", "GEOL", "GEOG", "ASTR", "HORT", "AFS", "ANSC",
    "AGTM", "CROP S", "SOIL S", "ENTOM", "FSHN", "EM", "ENGL", "WRTG",
    "MBIOS", "CHEM", "ARCH", "DTC", "CDS", "CPTSS", "NEUR", "NURS",
    "AMDT", "AAS", "HD", "HDFS", "CES", "PHARM",
}


def _norm(code: str) -> str:
    """Collapse whitespace and uppercase, so 'CPT S 121' and 'CPTS 121' both
    become 'CPTS121'."""
    return re.sub(r"\s+", "", code.upper())


def _is_valid_prefix(prefix: str) -> bool:
    p = prefix.strip().upper()
    if p in _STOPWORD_PREFIXES:
        return False
    if p in _KNOWN_PREFIXES:
        return True
    # Heuristic: allow all-letter tokens of length 2-6 that aren't stopwords.
    # This lets us handle prefixes we haven't explicitly enumerated.
    if re.fullmatch(r"[A-Z]{2,8}(?: [A-Z])?", p):
        return True
    return False


def parse_prereqs(prereq_raw: str) -> list:
    """Parse prerequisite text into DNF: list of AND-groups (each an OR-list
    of course codes).

    Example:
        "CPT S 215, 223, or 233; MATH 216 or concurrent"
        -> [
             ["CPT S 215", "CPT S 223", "CPT S 233"],
             ["MATH 216"],
           ]
    """
    if not prereq_raw or not prereq_raw.strip():
        return []

    # Split into AND-clauses on semicolons and "; and"
    # Semicolon is the strongest structural separator in WSU catalog text.
    # Also split on " and " outside parentheses, but ONLY at sentence level,
    # since "X or Y, each with a C or better, and admitted to..." is tricky.
    # Keep it simple: split on ';' first. "and" within a comma list is an
    # OR-continuation in catalog usage ("121, 122, or 132").
    raw = prereq_raw.strip().rstrip(".")
    and_clauses = [c.strip() for c in re.split(r";|\band also\b", raw, flags=re.I) if c.strip()]

    groups = []
    for clause in and_clauses:
        group = _parse_or_group(clause)
        if group:
            groups.append(group)
    return groups


def _parse_or_group(clause: str) -> list:
    """Parse one AND-clause into an OR-list of course codes.

    Handles continuation-number patterns like "CPT S 121, 122, or 132"
    where the prefix is only stated once but applies to all numbers.
    """
    # Strip non-course qualifiers that commonly trail the list:
    # "with a C or better", "each with a C", "(or concurrent enrollment)",
    # "or higher", "or by permission", "admitted to ...", etc.
    # We do this by cutting at known trailing keywords.
    # Grade qualifiers — strip only the phrase itself, not the rest of the
    # clause. "MATH 106 or 201 with a C or better, or MATH 171" must retain
    # the trailing " or MATH 171".
    trailers_inline = [
        r",?\s*with a [A-Z]\+? or better",
        r",?\s*with a [A-Z]\+?(?=[,;]|$)",
        r",?\s*each with a [A-Z]\+? or better",
    ]
    # Phrases that genuinely terminate the prereq list (admission gates,
    # score gates, standing requirements). Anything after them is
    # out-of-scope for course-code extraction.
    trailers_terminal = [
        r",?\s*admitted to\b.*$",
        r",?\s*admission to\b.*$",
        r",?\s*a min(?:imum)? ALEKS\b.*$",
        r",?\s*ALEKS math\b.*$",
        r",?\s*minimum score\b.*$",
        r",?\s*\bby permission\b.*$",
        r",?\s*or a min(?:imum)?\b.*$",
        r",?\s*or an AP\b.*$",
        r",?\s*or AP exam\b.*$",
        r",?\s*junior standing\b.*$",
        r",?\s*senior standing\b.*$",
        r",?\s*sophomore standing\b.*$",
        r",?\s*graduate standing\b.*$",
        r",?\s*for majors\b.*$",
        r",?\s*\(or concurrent[^)]*\)",
        r",?\s*or concurrent enrollment\b.*$",
    ]
    trailers = trailers_inline + trailers_terminal
    core = clause
    for pat in trailers:
        core = re.sub(pat, "", core, flags=re.I)
    core = core.strip().rstrip(",").strip()

    codes = _extract_codes_with_continuations(core)

    # Deduplicate while preserving order
    seen = set()
    out = []
    for c in codes:
        key = _norm(c)
        if key not in seen:
            seen.add(key)
            out.append(c)
    return out


# Matches a full code "PREFIX NUM" where PREFIX is 2-8 letters (PHYSICS=7,
# BIOLOGY=7), optionally followed by a single-letter continuation (e.g.
# "CPT S", "POL S").
_FULL_CODE_RE = re.compile(
    r"\b([A-Z]{2,8}(?:\s[A-Z])?)\s+(\d{3,4})\b"
)


def _extract_codes_with_continuations(text: str) -> list:
    """Extract course codes from text, expanding continuation numbers.

    Given "CPT S 121, 122, or 132", returns
        ["CPT S 121", "CPT S 122", "CPT S 132"].

    Continuation rule: after a valid "PREFIX NUM" match, any subsequent
    bare numbers (3-4 digits) that appear before the next valid prefix
    or a strong break (semicolon) inherit the preceding prefix.
    """
    tokens = re.findall(r"[A-Z][A-Z ]{1,8}(?= \d)|\d{3,4}|[A-Z][A-Z]+|[,;]", text.upper())
    # The above is too permissive. Use a simpler two-pass approach:

    codes = []
    current_prefix = None
    # Walk the string looking for either a full PREFIX NUM or a bare NUM
    # that can inherit the current prefix.
    pos = 0
    while pos < len(text):
        # Try a full "PREFIX NUM" starting at pos (or soon after whitespace)
        m_full = _FULL_CODE_RE.search(text, pos)
        m_num = re.search(r"\b(\d{3,4})\b", text[pos:])

        next_full_start = m_full.start() if m_full else len(text) + 1
        next_num_start = (pos + m_num.start()) if m_num else len(text) + 1

        if next_full_start <= next_num_start:
            if not m_full:
                break
            prefix = m_full.group(1).strip()
            num = m_full.group(2)
            if _is_valid_prefix(prefix):
                current_prefix = prefix
                codes.append(f"{prefix} {num}")
            pos = m_full.end()
        else:
            if not m_num:
                break
            num = m_num.group(1)
            # Only expand as continuation if we already have a prefix, and
            # the text between current pos and this number doesn't cross a
            # semicolon (strong break).
            between = text[pos : pos + m_num.start()]
            if current_prefix and ";" not in between:
                codes.append(f"{current_prefix} {num}")
            # else: bare number with no prefix context — skip (e.g. "with a 2.5 GPA")
            pos = pos + m_num.end()

    return codes


def has_concurrent_clause(prereq_raw: str) -> bool:
    """True if the prereq text explicitly allows concurrent enrollment."""
    if not prereq_raw:
        return False
    return bool(re.search(r"concurrent enrollment|or concurrent", prereq_raw, re.I))


# Backwards-compatible flat list for callers that still expect it.
def parse_prereq_codes(prereq_raw: str) -> list:
    groups = parse_prereqs(prereq_raw)
    flat = []
    for g in groups:
        flat.extend(g)
    return flat


class PrereqChecker:
    def __init__(self, retriever):
        self.retriever = retriever

    def check(self, course_code: str, completed_courses: list,
              concurrent_courses: list = None) -> dict:
        """Check whether the student can enroll in course_code.

        concurrent_courses: courses the student plans to take in the same
        term as course_code. If course_code's prereq text allows concurrent
        enrollment, these count toward satisfaction.
        """
        completed_norm = {_norm(c) for c in completed_courses}
        concurrent_norm = {_norm(c) for c in (concurrent_courses or [])}

        course = self.retriever.get_by_code(course_code)
        if course is None:
            return {
                "found": False,
                "can_take": False,
                "missing": [],
                "prereqs": [],
                "groups": [],
            }

        raw = course.get("prereq_raw", "")
        groups = parse_prereqs(raw)
        concurrent_ok = has_concurrent_clause(raw)

        # Satisfied set: completed courses always count; concurrent courses
        # count only if the prereq allows concurrent enrollment.
        satisfied = set(completed_norm)
        if concurrent_ok:
            satisfied |= concurrent_norm

        # Evaluate DNF: all groups need >=1 satisfied
        unmet_groups = []
        satisfied_courses = []
        for group in groups:
            if any(_norm(c) in satisfied for c in group):
                for c in group:
                    if _norm(c) in satisfied:
                        satisfied_courses.append(c)
                        break
            else:
                unmet_groups.append(group)

        # Flat "missing" list for display: flatten the unmet groups
        missing_flat = []
        for g in unmet_groups:
            missing_flat.extend(g)

        flat_prereqs = []
        for g in groups:
            flat_prereqs.extend(g)

        return {
            "found": True,
            "course_code": course["course_code"],
            "can_take": len(unmet_groups) == 0,
            "prereqs": flat_prereqs,
            "groups": groups,
            "missing": missing_flat,
            "unmet_groups": unmet_groups,
            "completed": satisfied_courses,
            "concurrent_ok": concurrent_ok,
        }
