#!/usr/bin/env python3
"""
Direct replacement for the papermill notebook pipeline.
Called by execute_advice.js with --question and --student_context args.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

# Ensure src is importable
BASE_DIR = Path(__file__).parents[2]
sys.path.insert(0, str(BASE_DIR / "prompt-search" / "src"))

from dotenv import load_dotenv
load_dotenv(BASE_DIR / "prompt-search" / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from llm.claude_client import ClaudeClient
from llm.cache import ResponseCache


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--question", required=True)
    parser.add_argument("--student_context", default="{}")
    parser.add_argument("--use_rag", default="true")
    args = parser.parse_args()

    start = time.time()

    student_context = json.loads(args.student_context) if isinstance(args.student_context, str) else args.student_context

    index_dir = str(BASE_DIR / "prompt-search" / "data" / "domain")
    cache_path = str(BASE_DIR / "prompt-search" / "data" / "cache" / "responses.db")

    retriever = CourseRetriever(index_dir=index_dir)
    builder   = ContextBuilder(retriever, top_k=5)
    cache     = ResponseCache(db_path=cache_path)
    client    = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))

    # Build student context block
    student_block = ""
    completed    = student_context.get("completed_courses", [])
    credits_done = student_context.get("credits_completed", 0)
    major        = student_context.get("major", "")
    if completed:
        student_block += f"Student completed courses: {', '.join(completed)}\n"
    if credits_done:
        student_block += f"Credits completed: {credits_done}\n"
    if major and major != "Undeclared":
        student_block += f"Student major: {major}\n"

    prompt, sources = builder.build(args.question, base_prompt=student_block)

    cached = cache.get(prompt, model=client.model, temperature=0.0)
    if cached:
        answer = cached
    else:
        answer = client.generate(prompt, temperature=0.0, max_tokens=400)
        cache.set(prompt, model=client.model, temperature=0.0, response=answer)

    output = {
        "answer": answer,
        "sources": [s["course_code"] for s in sources],
        "metadata": {
            "used_rag": args.use_rag.lower() == "true",
            "latency_seconds": round(time.time() - start, 2),
        }
    }
    print(json.dumps(output))


if __name__ == "__main__":
    main()
