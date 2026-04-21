import json
import os
import re

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

# Matches a standalone department prefix line like "CPT S", "MATH", "ENGL"
_PREFIX_LINE_RE = re.compile(r'^[A-Z][A-Z &/]{1,8}$')
# Matches a numbered course entry line like "121 Program Design..."
_COURSE_NUM_RE = re.compile(r'^(\d{2,4})\s+\S')
# Matches "Course Prerequisite:" or "Prereq:" in chunk text
_PREREQ_RE = re.compile(r'(?:Course\s+)?[Pp]rereq(?:uisite)?s?[:\.]?\s*(.+?)(?:\n|\.(?:\s|$))')


def _normalize_code(code: str) -> str:
    """Collapse internal spaces so 'CPT S 121' and 'CPTS 121' both become 'CPTS121'."""
    return re.sub(r'\s+', '', code.upper())


class CatalogIngestor:
    def __init__(self, catalog_path: str, output_dir: str):
        self.catalog_path = catalog_path
        self.output_dir = output_dir
        self.model = SentenceTransformer("all-MiniLM-L6-v2")

    def parse_chunks(self) -> list:
        with open(self.catalog_path, "r", encoding="utf-8", errors="ignore") as f:
            lines = f.readlines()

        chunks = []
        current_prefix = None
        current_number = None
        current_lines = []

        def flush():
            if current_prefix and current_number and current_lines:
                chunk_text = " ".join(l.strip() for l in current_lines if l.strip())
                if len(chunk_text) < 20:
                    return
                prereq_raw = ""
                m = _PREREQ_RE.search(chunk_text)
                if m:
                    prereq_raw = m.group(1).strip()
                course_code = f"{current_prefix} {current_number}"
                chunks.append({
                    "course_code": course_code,
                    "prereq_raw": prereq_raw,
                    "chunk_text": chunk_text,
                })

        for i, raw_line in enumerate(lines):
            line = raw_line.rstrip("\n")
            stripped = line.strip()

            # Detect a department prefix header: standalone uppercase line
            # followed by a line that starts with a course number
            if _PREFIX_LINE_RE.match(stripped) and i + 1 < len(lines):
                next_stripped = lines[i + 1].strip()
                if _COURSE_NUM_RE.match(next_stripped):
                    flush()
                    current_prefix = stripped
                    current_number = None
                    current_lines = []
                    continue

            if current_prefix is None:
                continue

            num_match = _COURSE_NUM_RE.match(stripped)
            if num_match:
                flush()
                current_number = num_match.group(1)
                current_lines = [stripped]
            elif current_number is not None:
                # Stop accumulating if we hit a new prefix header
                if _PREFIX_LINE_RE.match(stripped) and i + 1 < len(lines):
                    next_stripped = lines[i + 1].strip() if i + 1 < len(lines) else ""
                    if _COURSE_NUM_RE.match(next_stripped):
                        flush()
                        current_prefix = stripped
                        current_number = None
                        current_lines = []
                        continue
                current_lines.append(stripped)

        flush()
        return chunks

    def build_index(self) -> tuple:
        chunks = self.parse_chunks()
        print(f"Parsed {len(chunks)} course chunks")
        texts = [c["chunk_text"] for c in chunks]
        embeddings = self.model.encode(texts, show_progress_bar=True, convert_to_numpy=True)
        embeddings = embeddings.astype(np.float32)

        index = faiss.IndexFlatL2(embeddings.shape[1])
        index.add(embeddings)
        return index, chunks

    def save(self) -> None:
        os.makedirs(self.output_dir, exist_ok=True)
        index, chunks = self.build_index()

        faiss.write_index(index, os.path.join(self.output_dir, "courses.faiss"))
        with open(os.path.join(self.output_dir, "metadata.json"), "w") as f:
            json.dump(chunks, f)

        print(f"Saved {len(chunks)} chunks to {self.output_dir}")
