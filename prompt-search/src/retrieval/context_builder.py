from __future__ import annotations

import json
import os
import re
from pathlib import Path
from .retriever import CourseRetriever
from .db_client import CourseDB
from .reranker import NvidiaReranker

_RAG_CONFIG_PATH = Path(__file__).resolve().parents[3] / "config" / "rag.yaml"


def _load_rag_config() -> dict:
    try:
        import yaml
        with open(_RAG_CONFIG_PATH) as f:
            return yaml.safe_load(f) or {}
    except Exception:
        return {}

_FEW_SHOT_PATH = os.path.join(os.path.dirname(__file__), "../../data/domain/few_shot_examples.json")

_UCORE_BLOCK = (
    "WSU UCORE categories (all undergraduates must satisfy each):\n"
    "  WRTG – Writing, QUAN – Quantitative Reasoning, COMM – Communication,\n"
    "  BSCI – Biological Sciences, PSCI – Physical Sciences, SSCI – Social Sciences,\n"
    "  HUM – Humanities, ARTS – Arts, DIVR – Diversity, INTG/CAPS – Integration/Capstone.\n"
    "EQJS (Equity & Justice) and ROOT may appear in recent catalog years as additional requirements.\n"
)

_UCORE_RE = re.compile(
    r'\b(ucore|wrtg|quan|comm|bsci|psci|ssci|hum|arts|divr|intg|caps|equity|diversity|general\s+ed)\b',
    re.IGNORECASE,
)
_CREDIT_RE = re.compile(
    r'\b(credits?\s+(remain|left|needed|required)|how many credits|total credits|graduate|graduation)\b',
    re.IGNORECASE,
)
_PROGRESS_RE = re.compile(
    r'\b('
    r'degree\s+(audit|progress|check|track|left|missing|next|plan|require)'
    r'|graduat(e|ing|ion)'
    r'|declare\s+\w+\s+major'
    r'|semester\s+audit'
    r'|4.year\s+track'
    r"|what.s\s+(left|missing|next).{0,25}(degree|cs|major|semester)"
    r'|still\s+need.{0,25}(degree|major|graduate|cs\s)'
    r'|on\s+(track|schedule)\s+to\s+graduate'
    r'|senior\s+check'
    r'|final\s+semester'
    r')\b',
    re.IGNORECASE,
)
_SCHEDULE_RE = re.compile(
    r'\b(same\s+semester|same\s+term|together|conflict|time\s+conflict|section|open\s+seat'
    r'|available\s+seat|can\s+i\s+take|enroll|register|when\s+(is|does)|what\s+time'
    r'|offered|seats?\s+(left|available|open|full)|waitlist|full\s+class)\b',
    re.IGNORECASE,
)
_CS_DEGREE = "Computer Science"


def _load_few_shot_examples(n: int = 3) -> str:
    try:
        with open(_FEW_SHOT_PATH) as f:
            data = json.load(f)
        examples = data.get("examples", [])[:n]
        lines = []
        for ex in examples:
            lines.append(f"Q: {ex['question']}")
            lines.append(f"A: {ex['answer']}")
            lines.append("")
        return "\n".join(lines).strip()
    except Exception:
        return ""


class ContextBuilder:
    """Builds a RAG-augmented prompt by injecting retrieved course context."""

    def __init__(self, retriever: CourseRetriever, top_k: int | None = None, few_shot_n: int = 4):
        cfg = _load_rag_config()
        self.retriever = retriever
        self.top_k = top_k if top_k is not None else cfg.get("top_k", 5)
        self.max_context_words = cfg.get("max_context_words", None)
        self.few_shot_examples = _load_few_shot_examples(few_shot_n)
        self.db = CourseDB()
        self.reranker_fetch_k = cfg.get("reranker_fetch_k", self.top_k * 4)
        self.reranker = NvidiaReranker(top_n=self.top_k)

    def _prereq_block(self, question: str, hops: int = 2) -> str:
        """Pull exact prereq data from DB, following the chain up to `hops` levels deep."""
        import re as _re
        from .retriever import _explicit_codes
        seed_codes = _explicit_codes(question)
        if not seed_codes:
            return ""

        _CODE_RE = _re.compile(r'\b([A-Za-z]{2,6}(?:\s[A-Za-z]{1,2})?)\s+(\d{3})\b')

        seen, queue, lines = set(), list(seed_codes), []
        depth = {c: 0 for c in seed_codes}

        while queue:
            code = queue.pop(0)
            if code in seen:
                continue
            seen.add(code)
            try:
                course = self.db.get_catalog_course(code)
                if not (course and course.get("prereq_raw")):
                    continue
                lines.append(f"{course['code']} prerequisites (from catalog): {course['prereq_raw']}")
                # Queue upstream prereqs if we haven't hit the hop limit
                if depth.get(code, 0) < hops:
                    for prefix, num in _CODE_RE.findall(course["prereq_raw"]):
                        upstream = f"{prefix.strip().upper()} {num}"
                        if upstream not in seen:
                            depth[upstream] = depth.get(code, 0) + 1
                            queue.append(upstream)
            except Exception:
                pass
        return ("Catalog prerequisite data:\n" + "\n".join(lines) + "\n\n") if lines else ""

    def _schedule_block(self, question: str) -> str:
        """Inject live section times/seats for explicitly mentioned courses when schedule-related."""
        from .retriever import _explicit_codes
        if not (_SCHEDULE_RE.search(question) or _CREDIT_RE.search(question)):
            return ""
        codes = list(_explicit_codes(question))
        if not codes:
            return ""
        try:
            sections = self.db.get_course_sections(codes)
            if not sections:
                return ""
            lines = []
            term_label = f"{sections[0]['term']} {sections[0]['year']}"
            lines.append(f"Live section data ({term_label}):")
            seen = set()
            for s in sections:
                key = (s["code"], s["dayTime"], s.get("isLab", False))
                if key in seen:
                    continue
                seen.add(key)
                label = "LAB" if s.get("isLab") else "LEC"
                seats = f"{s['seatsAvailable']} seats open" if s["seatsAvailable"] > 0 else "FULL"
                lines.append(
                    f"  {s['code']} sec {s['section']} [{label}]: {s['dayTime']} | {seats} | {s['status']}"
                )
            return "\n".join(lines) + "\n\n"
        except Exception:
            return ""

    def _degree_block(self, question: str) -> str:
        """Fetch degree requirement summary from DB when question is credit/progress related."""
        if not (_CREDIT_RE.search(question) or _PROGRESS_RE.search(question)):
            return ""
        try:
            summary = self.db.get_core_courses_summary(_CS_DEGREE)
            if summary:
                return f"CS degree requirements from WSU catalog:\n{summary}\n\n"
        except Exception:
            pass
        return ""

    def build(self, question: str, base_prompt: str = "") -> tuple[str, list[dict]]:
        """
        Retrieve relevant courses and inject them into the prompt.

        Returns
        -------
        prompt : str
            The full prompt with context injected.
        sources : list[dict]
            The retrieved course entries used as context.
        """
        candidates = self.retriever.search(question, top_k=self.reranker_fetch_k)
        sources = self.reranker.rerank(question, candidates)

        context_lines = []
        for entry in sources:
            chunk = entry["chunk_text"][:300].strip()
            line = f"- {entry['course_code']}: {chunk}"
            if entry.get("prereq_raw"):
                line += f" (Prerequisites: {entry['prereq_raw']})"
            context_lines.append(line)

        context_block = "\n".join(context_lines)

        few_shot_block = (
            f"Examples of concise answers:\n{self.few_shot_examples}\n\n"
            if self.few_shot_examples else ""
        )

        ucore_block    = _UCORE_BLOCK if _UCORE_RE.search(question) else ""
        degree_block   = self._degree_block(question)
        prereq_block   = self._prereq_block(question)
        schedule_block = self._schedule_block(question)

        system_prefix = (
            "You are a WSU academic advisor. Use the following course information "
            "to answer the student's question accurately. "
            "Answer in 1-2 sentences. Be concise and do not use markdown formatting. "
            "Do not ask the student for more information — answer based on published course prerequisites only. "
            "When asked 'Can I take X?' without a list of completed courses, state the prerequisites for X and answer Yes. "
            "For prerequisite chain questions, show the full chain using arrows: COURSE A -> COURSE B -> COURSE C. "
            "If a course requires senior standing (90+ credits) or junior standing (60+ credits), state that explicitly.\n\n"
            f"{ucore_block}"
            f"{degree_block}"
            f"{prereq_block}"
            f"{schedule_block}"
            "Relevant courses:\n"
            f"{context_block}\n\n"
            f"{few_shot_block}"
        )

        if base_prompt:
            prompt = f"{system_prefix}{base_prompt}\n\nQuestion: {question}"
        else:
            prompt = f"{system_prefix}Question: {question}"

        if self.max_context_words:
            words = prompt.split()
            if len(words) > self.max_context_words:
                prompt = " ".join(words[:self.max_context_words])

        return prompt, sources
