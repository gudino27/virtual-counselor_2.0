import os
import sys

from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from llm.claude_client import ClaudeClient
from prompts.template import PromptTemplate
from prompts.mutations import PromptMutator
from retrieval.retriever import CourseRetriever
from counselor.prereq_checker import PrereqChecker
from counselor.grad_advisor import GradAdvisor


def _build_template(context_chunks: list) -> PromptTemplate:
    context = "\n\n---\n\n".join(c["chunk_text"] for c in context_chunks)
    template = PromptTemplate(
        task_description=(
            f"Use the following WSU course catalog information to answer the student's question.\n\n"
            f"Catalog context:\n{context}"
        )
    )
    template = PromptMutator.add_domain_context(template, "course_planning")
    template = PromptMutator.add_cot(template)
    return template


class VirtualCounselorPipeline:
    def __init__(self, index_dir: str = "data/domain", api_key: str = None):
        self.retriever = CourseRetriever(index_dir=index_dir)
        self.checker = PrereqChecker(self.retriever)
        self.advisor = GradAdvisor(self.retriever)
        resolved_key = api_key or os.environ.get("CLAUDE_API_KEY")
        if not resolved_key:
            raise EnvironmentError(
                "CLAUDE_API_KEY is not set. Add it to prompt-search/.env:\n"
                "  CLAUDE_API_KEY=your_key_here"
            )
        self.client = ClaudeClient(model="claude-haiku-4-5", api_key=resolved_key)

    def ask(self, question: str, completed_courses: list = None) -> str:
        completed_courses = completed_courses or []

        # Retrieve relevant catalog chunks for context
        chunks = self.retriever.search(question, top_k=5)
        template = _build_template(chunks)

        # Augment question with student context if provided
        student_context = ""
        if completed_courses:
            student_context = f"\nMy completed courses: {', '.join(completed_courses)}\n"

        prompt = template.render(student_context + question)
        return self.client.generate(prompt, max_tokens=800)

    def can_take(self, course_codes, completed_courses: list = None) -> dict:
        completed_courses = completed_courses or []

        # Accept a single string or a list
        if isinstance(course_codes, str):
            course_codes = [course_codes]

        # Run the deterministic checker and retrieve catalog context for each course
        check_results = []
        context_chunks = []
        for code in course_codes:
            result = self.checker.check(code, completed_courses)
            check_results.append((code, result))
            entry = self.retriever.get_by_code(code)
            if entry:
                context_chunks.append(entry)

        # Build structured summary to ground the LLM
        structured_lines = []
        for code, r in check_results:
            if not r["found"]:
                structured_lines.append(f"- {code}: NOT FOUND in catalog")
            elif r["can_take"]:
                prereq_note = f" (requires: {', '.join(r['prereqs'])})" if r["prereqs"] else " (no prerequisites)"
                structured_lines.append(f"- {code}: student CAN take this course{prereq_note}")
            else:
                structured_lines.append(
                    f"- {code}: student CANNOT take this course yet — "
                    f"missing: {', '.join(r['missing'])}; "
                    f"already completed: {', '.join(r['completed']) if r['completed'] else 'none'}"
                )

        catalog_context = "\n\n---\n\n".join(
            c["chunk_text"] for c in context_chunks
        ) if context_chunks else "No catalog entries found for the requested courses."

        student_context = f"Student's completed courses: {', '.join(completed_courses)}" if completed_courses else "Student has no completed courses on record."

        courses_asked = ", ".join(course_codes)
        template = PromptTemplate(
            task_description=(
                f"A student is asking whether they can enroll in the following course(s): {courses_asked}.\n\n"
                f"Catalog context:\n{catalog_context}\n\n"
                f"Verified prerequisite check results (treat these as facts — do not contradict them):\n"
                + "\n".join(structured_lines) + "\n\n"
                + student_context
            )
        )
        template = PromptMutator.add_domain_context(template, "course_planning")
        template = PromptMutator.add_cot(template)

        question = f"Can I take {courses_asked}?"
        prompt = template.render(question)
        answer = self.client.generate(prompt, max_tokens=600)

        return {"answer": answer, "checks": check_results}

    def graduation_check(self, degree_program: str, completed_courses: list = None) -> dict:
        completed_courses = completed_courses or []
        result = self.advisor.get_remaining(degree_program, completed_courses)

        if result.get("error"):
            result["answer"] = result["error"]
            return result

        degree_chunk = result["degree_chunk"]
        catalog_context = degree_chunk["chunk_text"] if degree_chunk else ""

        student_context = (
            f"Student's completed courses: {', '.join(completed_courses)}"
            if completed_courses
            else "Student has no completed courses on record."
        )

        structured_summary = (
            f"Degree: {result['degree_program']} ({result.get('total_credits')} credits total)\n"
            f"Required courses found: {len(result['required_courses'])}\n"
            f"Student has completed: {', '.join(result['completed_matches']) if result['completed_matches'] else 'none of the required courses'}\n"
            f"Still needed: {', '.join(result['remaining']) if result['remaining'] else 'none — all requirements satisfied'}"
        )

        template = PromptTemplate(
            task_description=(
                f"A student is asking about their progress toward graduating with a degree in "
                f"{degree_program}.\n\n"
                f"Degree requirements from the catalog:\n{catalog_context}\n\n"
                f"Verified progress summary (treat these as facts — do not contradict them):\n"
                f"{structured_summary}\n\n"
                f"{student_context}"
            )
        )
        template = PromptMutator.add_domain_context(template, "course_planning")
        template = PromptMutator.add_cot(template)

        prompt = template.render(f"What do I still need to graduate with a {degree_program} degree?")
        result["answer"] = self.client.generate(prompt, max_tokens=800)
        return result
