"""
RAG Virtual Counselor CLI

Usage (from prompt-search/ directory):
    python scripts/query.py
    python scripts/query.py --courses "CPTS 121, MATH 171, ENGL 101"

Commands at the prompt:
    can I take <COURSE CODE>     — prerequisite check
    what do I need to graduate   — graduation requirements
    <any question>               — free-form RAG answer
    quit / exit                  — exit
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from counselor.pipeline import VirtualCounselorPipeline

INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "domain")


def parse_args():
    parser = argparse.ArgumentParser(description="WSU Virtual Counselor")
    parser.add_argument(
        "--courses",
        type=str,
        default="",
        help='Comma-separated list of completed courses, e.g. "CPTS 121, MATH 171"',
    )
    parser.add_argument(
        "--degree",
        type=str,
        default="Computer Science",
        help="Degree program for graduation checks (default: Computer Science)",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    completed = [c.strip() for c in args.courses.split(",") if c.strip()]

    print("Loading virtual counselor...")
    pipeline = VirtualCounselorPipeline(index_dir=os.path.abspath(INDEX_DIR))
    print("Ready. Type your question or 'quit' to exit.\n")

    if completed:
        print(f"Your completed courses: {', '.join(completed)}\n")

    while True:
        try:
            question = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nGoodbye!")
            break

        if not question:
            continue
        if question.lower() in ("quit", "exit"):
            print("Goodbye!")
            break

        lower = question.lower()

        # Route: prerequisite check
        if "can i take" in lower or "can i enroll" in lower:
            import re
            matches = re.findall(r'\b([A-Z]{2,6}\s+\d{3,4})\b', question.upper())
            if matches:
                result = pipeline.can_take(matches, completed)
                print(f"\nCounselor: {result['answer']}\n")
            else:
                print("\nCounselor: Please include a course code, e.g. 'Can I take CPTS 360?'\n")

        # Route: graduation check
        elif "graduate" in lower or "graduation" in lower or "degree" in lower:
            result = pipeline.graduation_check(args.degree, completed)
            print(f"\nCounselor: {result['answer']}\n")

        # Route: free-form RAG
        else:
            answer = pipeline.ask(question, completed)
            print(f"\nCounselor: {answer}\n")


if __name__ == "__main__":
    main()
