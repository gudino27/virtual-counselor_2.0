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

        # Footnotes begin with a standalone digit line followed by text
        if re.match(r'^\d\s*$', stripped) or re.match(r'^\d\s+[A-Z]', stripped):
            in_footnote = True

        if in_footnote:
            for m in _COURSE_CODE_RE.finditer(stripped.upper()):
                footnote_codes.add(m.group(1).strip())
        else:
            if not _STRUCTURAL_RE.match(stripped):
                for m in _COURSE_CODE_RE.finditer(stripped.upper()):
                    schedule_codes.add(m.group(1).strip())

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
