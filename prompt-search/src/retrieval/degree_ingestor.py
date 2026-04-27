import re

# Matches degree block headers like "BACHELOR OF SCIENCE, COMPUTER SCIENCE" or
# standalone program names like "SOFTWARE ENGINEERING", "CYBERSECURITY"
# Matches any all-uppercase program name line (letters, spaces, commas, hyphens, ampersands).
# The credits line check in parse_degree_chunks provides the real validation.
_DEGREE_TITLE_RE = re.compile(r'^[A-Z][A-Z ,\-&/]{2,}[A-Z]\s*$')

# Matches "(120 CREDITS)" or "(124 CREDITS)" etc.
_CREDITS_RE = re.compile(r'^\((\d{2,3}) CREDITS\)$')

# Matches course codes like "CPT S 121", "MATH 171", "E E 214", "HISTORY 105"
_COURSE_CODE_RE = re.compile(r'\b([A-Z][A-Z &/]{1,8}\s+\d{3,4})\b')

# English connector words that regex above falsely matches as course prefixes
# when they appear before numbers (e.g., "OR 107", "AND 171", "IN MATH 171",
# "OF 120 CREDITS"). Filter these out.
_CONNECTOR_STOPWORDS = {
    "OR", "AND", "THE", "OF", "AT", "IN", "BY", "TO", "WITH", "A", "AN",
    "IF", "FOR", "FROM", "AS", "ON", "UP", "BE", "IS", "ARE", "NOT",
    "MAY", "CAN", "EACH", "ALSO", "ONE", "TWO", "ANY", "ALL", "BOTH",
    "HIGHER", "LOWER", "ABOVE", "BELOW", "ABOUT", "THIS", "THESE",
    "THAT", "THOSE", "SOME", "MOST", "SUCH", "VIA", "PER", "NEW", "OLD",
    "PASS", "TAKE", "HAVE", "HAD", "HAS", "WAS", "WILL", "SHALL", "WOULD",
    "SHOULD", "COULD", "ALEKS", "SAT", "AP", "BS", "BA", "GPA",
    "REACH", "SCORE", "GRADE", "YEAR", "TERM", "CREDIT", "CREDITS",
    "FALL", "SPRING", "SUMMER", "WINTER", "FIRST", "SECOND", "THIRD",
    "FOURTH", "FIFTH", "AFTER", "BEFORE", "WHEN", "WHILE", "PLUS",
    "MINUS", "ENGR",  # ENGR alone with a number can appear but is rarely a course — keep as a stopword unless followed by "489" style?
}
# Carve out ENGR since "ENGR 489" is a real course at WSU
_CONNECTOR_STOPWORDS.discard("ENGR")

# Known real WSU course prefixes. Any PREFIX NUM where PREFIX is in this
# set is definitely a course. Outside the set we fall back to the stopword
# filter.
_KNOWN_REAL_PREFIXES = {
    "CPT S", "CPTS", "MATH", "STAT", "PHYSICS", "PHYS", "CHEM", "BIOLOGY",
    "BIO", "ENGL", "HIST", "HISTORY", "COM", "COMSTM", "EE", "E E", "MECH",
    "M E", "ME", "CE", "C E", "BE", "B E", "BIOENG", "BEE", "SOC", "SOCS",
    "PSYCH", "PSYC", "ECON", "ECONS", "MUS", "MUSIC", "ART", "ENGR",
    "UCORE", "SPAN", "FR", "GER", "CHIN", "JAPN", "NUTR", "KINES",
    "HBM", "MGMT", "MKTG", "FIN", "ACCTG", "PHIL", "POL S", "POLS",
    "ANTH", "ANTHRO", "GEOL", "GEOG", "ASTR", "HORT", "AFS", "ANSC",
    "MBIOS", "ARCH", "DTC", "CDS", "NEUR", "NURS", "AMDT", "AAS",
    "HD", "HDFS", "CES", "PHARM", "ENGLISH",
}


_LINE_FULL_RE = re.compile(r"\b([A-Z][A-Z &/]{1,8})\s+(\d{3,4})\b")
_LINE_NUM_RE = re.compile(r"\b(\d{3,4})\b")


def _extract_line_codes(text: str) -> set:
    """Extract valid course codes from a single schedule line, expanding
    continuation numbers ("CPT S 121 or 131" -> both codes)."""
    codes = set()
    current_prefix = None
    pos = 0
    while pos < len(text):
        m_full = _LINE_FULL_RE.search(text, pos)
        m_num = _LINE_NUM_RE.search(text, pos)

        next_full_start = m_full.start() if m_full else len(text) + 1
        next_num_start = m_num.start() if m_num else len(text) + 1

        if next_full_start <= next_num_start and m_full is not None:
            prefix = m_full.group(1).strip()
            num = m_full.group(2)
            code = f"{prefix} {num}"
            if _is_real_course_code(code):
                current_prefix = prefix
                codes.add(code)
            else:
                current_prefix = None
            pos = m_full.end()
        elif m_num is not None:
            num = m_num.group(1)
            # Expand continuations only for 3-4 digit numbers that look
            # like course numbers (100-999 typical range), and only if we
            # have a current prefix established on this line.
            if current_prefix and 100 <= int(num) <= 999:
                candidate = f"{current_prefix} {num}"
                if _is_real_course_code(candidate):
                    codes.add(candidate)
            pos = m_num.end()
        else:
            break
    return codes


def _is_real_course_code(code: str) -> bool:
    """Return True if the matched code looks like a real WSU course."""
    parts = code.strip().split()
    if len(parts) < 2:
        return False
    prefix = " ".join(parts[:-1]).upper()
    if prefix in _CONNECTOR_STOPWORDS:
        return False
    if prefix in _KNOWN_REAL_PREFIXES:
        return True
    # Unknown prefix: allow if it's plausibly a department code (2-8 letters,
    # not a connector).
    if re.fullmatch(r"[A-Z]{2,8}(?: [A-Z])?", prefix):
        return True
    return False

# Year/term structural lines to skip when extracting course codes
_STRUCTURAL_RE = re.compile(
    r'^(First|Second|Third|Fourth) (Year|Term)|^(First|Second) Term Credits'
    r'|^Credits$|^\d+$|^_+$|^Complete |^Honors |^Washington State University'
    r'|^Electrical Engineering|^Schedules of Studies'
)


def _clean_degree_name(raw_title: str) -> str:
    """Convert raw ALL CAPS title to a readable degree name."""
    title = raw_title.strip().title()
    # Fix common abbreviations mangled by title-case
    title = re.sub(r'\bOf\b', 'of', title)
    title = re.sub(r'\bIn\b', 'in', title)
    title = re.sub(r'\bAnd\b', 'and', title)
    title = re.sub(r'\bA\b', 'a', title)
    return title


def _extract_required_courses(block_lines: list) -> list:
    """
    Extract concrete required course codes from a degree block.

    Strategy:
    - Pull all course codes that appear on schedule lines (year/term sections)
    - Exclude codes that only appear in footnote/elective-pool paragraphs
      (footnotes start with a digit + space pattern like "1 Students may choose...")
    """
    in_footnote = False
    schedule_codes = set()
    footnote_codes = set()

    for line in block_lines:
        stripped = line.strip()

        # Footnotes are separated from the schedule by a long underscore line
        # like "_______". Bare digit lines inside the schedule are NOT
        # footnote markers — they are credit-hour indicators ("3", "4") or
        # footnote-reference markers that appear directly under course rows.
        if re.match(r'^_{3,}$', stripped):
            in_footnote = True

        codes_on_line = _extract_line_codes(stripped.upper())
        if in_footnote:
            footnote_codes.update(codes_on_line)
        elif not _STRUCTURAL_RE.match(stripped):
            schedule_codes.update(codes_on_line)

    # Required = appeared in schedule but not exclusively in elective footnotes
    required = sorted(schedule_codes - footnote_codes)
    return required


def parse_degree_chunks(catalog_path: str) -> list:
    """
    Parse degree requirement blocks from the catalog text file.
    Returns a list of chunk dicts with chunk_type='degree_requirements'.
    """
    with open(catalog_path, "r", encoding="utf-8", errors="ignore") as f:
        lines = f.readlines()

    chunks = []
    i = 0
    n = len(lines)

    while i < n:
        stripped = lines[i].strip()

        title_match = _DEGREE_TITLE_RE.match(stripped)
        if title_match and i + 1 < n:
            # Some titles wrap across two lines in the PDF extraction, e.g.:
            #   "BACHELOR OF SCIENCE, COMPUTER"  (line i)
            #   "SCIENCE"                         (line i+1)
            #   "(120 CREDITS)"                   (line i+2)
            # Check both i+1 and i+2 for the credits marker.
            line1 = lines[i + 1].strip()
            credits_match = _CREDITS_RE.match(line1)
            title_continuation = None

            if not credits_match and i + 2 < n:
                line2 = lines[i + 2].strip()
                credits_match = _CREDITS_RE.match(line2)
                if credits_match:
                    title_continuation = line1  # second line of the title

            if credits_match:
                if title_continuation:
                    degree_raw = stripped + " " + title_continuation
                    skip_to = i + 3  # past title line 1, title line 2, credits line
                else:
                    degree_raw = stripped
                    skip_to = i + 2  # past title line, credits line

                total_credits = int(credits_match.group(1))
                block_lines = [degree_raw, credits_match.group(0)]
                i = skip_to

                # Accumulate until next degree block or end of file
                while i < n:
                    peek = lines[i].strip()
                    # Stop if we hit another degree title + credits pair (1 or 2 line title)
                    if _DEGREE_TITLE_RE.match(peek) and i + 1 < n:
                        if _CREDITS_RE.match(lines[i + 1].strip()):
                            break
                        if i + 2 < n and _CREDITS_RE.match(lines[i + 2].strip()):
                            break
                    block_lines.append(peek)
                    i += 1

                degree_name = _clean_degree_name(degree_raw)
                required_courses = _extract_required_courses(block_lines)
                chunk_text = " ".join(l for l in block_lines if l)

                chunks.append({
                    "chunk_type": "degree_requirements",
                    "degree_name": degree_name,
                    "total_credits": total_credits,
                    "required_courses": required_courses,
                    "chunk_text": chunk_text,
                    # Keep these keys consistent with course chunks so retriever works
                    "course_code": "",
                    "prereq_raw": "",
                })
                continue

        i += 1

    return chunks
