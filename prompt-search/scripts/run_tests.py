"""
Virtual Counselor Test Runner

Runs the annotated test cases in data/domain/test_cases.json against the live
VirtualCounselorPipeline, routing each case to the appropriate pipeline method
based on its category, then saves the counselor's answers alongside the
expected answers for manual/qualitative evaluation.

Usage (from prompt-search/):
    python scripts/run_tests.py
    python scripts/run_tests.py --category prerequisite_validation
    python scripts/run_tests.py --limit 10
    python scripts/run_tests.py --output results/run1.json
    python scripts/run_tests.py --dry-run          # route-check only, no LLM calls
"""
import argparse
import json
import os
import re
import sys
import time
import traceback
from collections import Counter, defaultdict
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

TEST_CASES_PATH = os.path.join(
    os.path.dirname(__file__), "..", "data", "domain", "test_cases.json"
)
INDEX_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "domain")
DEFAULT_OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "test_results")

COURSE_CODE_RE = re.compile(r"\b([A-Z]{2,6}\s+\d{3,4})\b")


def parse_args():
    p = argparse.ArgumentParser(description="Run WSU virtual counselor test cases")
    p.add_argument("--category", type=str, default=None,
                   help="Run only cases from this category (e.g. prerequisite_validation)")
    p.add_argument("--limit", type=int, default=None,
                   help="Maximum number of cases to run")
    p.add_argument("--ids", type=str, default=None,
                   help="Comma-separated list of case ids to run (e.g. prereq_001,chain_003)")
    p.add_argument("--output", type=str, default=None,
                   help="Path to write results JSON (default: data/test_results/run_<timestamp>.json)")
    p.add_argument("--dry-run", action="store_true",
                   help="Route each case but skip LLM calls (fast sanity check)")
    p.add_argument("--degree", type=str, default="Computer Science",
                   help="Default degree for graduation checks (default: Computer Science)")
    p.add_argument("--sleep", type=float, default=0.0,
                   help="Seconds to sleep between cases to avoid rate limits")
    return p.parse_args()


def load_cases():
    with open(TEST_CASES_PATH) as f:
        data = json.load(f)
    return data["cases"]


def filter_cases(cases, args):
    filtered = cases
    if args.category:
        filtered = [c for c in filtered if c["category"] == args.category]
    if args.ids:
        wanted = {i.strip() for i in args.ids.split(",") if i.strip()}
        filtered = [c for c in filtered if c["id"] in wanted]
    if args.limit is not None:
        filtered = filtered[: args.limit]
    return filtered


def extract_target_course(case):
    ctx = case.get("context", {})
    if "target_course" in ctx:
        return ctx["target_course"]
    m = COURSE_CODE_RE.search(case["question"].upper())
    return m.group(1) if m else None


def extract_proposed_courses(case):
    ctx = case.get("context", {})
    if "proposed" in ctx:
        return ctx["proposed"]
    return COURSE_CODE_RE.findall(case["question"].upper())


def _serialize_checks(checks):
    """checks is a list of (code, result_dict) tuples from PrereqChecker."""
    out = []
    for code, r in checks:
        out.append({
            "code": code,
            "found": r.get("found"),
            "can_take": r.get("can_take"),
            "prereqs": r.get("prereqs", []),
            "missing": r.get("missing", []),
            "completed": r.get("completed", []),
        })
    return out


def _serialize_progress(result):
    """Strip non-JSON-safe fields from graduation_check result."""
    return {
        "degree_program": result.get("degree_program"),
        "total_credits": result.get("total_credits"),
        "required_courses": result.get("required_courses", []),
        "completed_matches": result.get("completed_matches", []),
        "remaining": result.get("remaining", []),
    }


def route_case(case, pipeline, default_degree):
    """Dispatch a case to the right pipeline method and return an answer dict."""
    category = case["category"]
    ctx = case.get("context", {})
    completed = ctx.get("completed_courses", [])

    if category == "prerequisite_validation":
        courses = extract_proposed_courses(case) or []
        if not courses:
            target = extract_target_course(case)
            courses = [target] if target else []
        if not courses:
            return {"mode": "skip", "answer": "Could not extract a course code from question"}
        result = pipeline.can_take(courses, completed)
        return {
            "mode": "can_take",
            "courses": courses,
            "answer": result["answer"],
            "checks": _serialize_checks(result.get("checks", [])),
        }

    if category == "schedule_feasibility":
        proposed = extract_proposed_courses(case)
        if proposed and completed is not None:
            result = pipeline.can_take(proposed, completed)
            return {
                "mode": "can_take",
                "courses": proposed,
                "answer": result["answer"],
                "checks": _serialize_checks(result.get("checks", [])),
            }
        return {"mode": "ask", "answer": pipeline.ask(case["question"], completed)}

    if category == "degree_progress" and completed:
        degree = ctx.get("degree", default_degree)
        result = pipeline.graduation_check(degree, completed)
        return {
            "mode": "graduation_check",
            "degree": degree,
            "answer": result["answer"],
            "progress": _serialize_progress(result),
        }

    # prerequisite_chain_discovery, credit_calculations, ucore_planning, and
    # degree_progress without completed_courses all flow through free-form ask
    return {"mode": "ask", "answer": pipeline.ask(case["question"], completed)}


def dry_route(case):
    """Return what the router would do without executing the LLM."""
    category = case["category"]
    ctx = case.get("context", {})
    completed = ctx.get("completed_courses", [])
    if category == "prerequisite_validation":
        courses = extract_proposed_courses(case) or [extract_target_course(case)]
        return {"mode": "can_take", "courses": [c for c in courses if c]}
    if category == "schedule_feasibility":
        proposed = extract_proposed_courses(case)
        if proposed:
            return {"mode": "can_take", "courses": proposed}
        return {"mode": "ask"}
    if category == "degree_progress" and completed:
        return {"mode": "graduation_check", "degree": ctx.get("degree", "Computer Science")}
    return {"mode": "ask"}


def main():
    args = parse_args()
    cases = filter_cases(load_cases(), args)
    if not cases:
        print("No cases matched the given filters.")
        sys.exit(1)

    print(f"Loaded {len(cases)} case(s).")
    print("Category breakdown:", dict(Counter(c["category"] for c in cases)))

    pipeline = None
    if not args.dry_run:
        print("Initializing virtual counselor pipeline...")
        from counselor.pipeline import VirtualCounselorPipeline
        pipeline = VirtualCounselorPipeline(index_dir=os.path.abspath(INDEX_DIR))
        print("Pipeline ready.\n")

    results = []
    totals = defaultdict(int)
    start = time.time()

    for i, case in enumerate(cases, 1):
        label = f"[{i}/{len(cases)}] {case['id']} ({case['category']})"
        try:
            if args.dry_run:
                routed = dry_route(case)
                print(f"{label} -> {routed['mode']}")
                results.append({**case, "routed": routed})
            else:
                print(f"{label} ... ", end="", flush=True)
                routed = route_case(case, pipeline, args.degree)
                print(f"{routed['mode']} ok")
                saved = {
                    **case,
                    "actual_answer": routed["answer"],
                    "routed_mode": routed["mode"],
                }
                for extra in ("courses", "checks", "progress", "degree"):
                    if extra in routed:
                        saved[extra] = routed[extra]
                results.append(saved)
            totals[case["category"]] += 1
            if args.sleep > 0 and not args.dry_run:
                time.sleep(args.sleep)
        except Exception as e:
            print(f"ERROR: {e}")
            traceback.print_exc()
            results.append({
                **case,
                "error": str(e),
                "traceback": traceback.format_exc(),
            })

    elapsed = time.time() - start

    # Pick output path
    output_path = args.output
    if not output_path:
        os.makedirs(DEFAULT_OUTPUT_DIR, exist_ok=True)
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        suffix = "dryrun" if args.dry_run else "run"
        output_path = os.path.join(DEFAULT_OUTPUT_DIR, f"{suffix}_{ts}.json")

    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    summary = {
        "timestamp": datetime.now().isoformat(timespec="seconds"),
        "dry_run": args.dry_run,
        "total_cases": len(cases),
        "errors": sum(1 for r in results if "error" in r),
        "by_category": dict(totals),
        "elapsed_seconds": round(elapsed, 2),
        "filters": {"category": args.category, "ids": args.ids, "limit": args.limit},
        "results": results,
    }
    with open(output_path, "w") as f:
        json.dump(summary, f, indent=2)

    print()
    print(f"Done in {elapsed:.1f}s. Errors: {summary['errors']} / {len(cases)}")
    print(f"Results -> {output_path}")


if __name__ == "__main__":
    main()
