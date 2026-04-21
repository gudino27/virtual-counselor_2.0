"""
Re-run RAG evaluation bypassing cache, save results to data/results/rag_eval_results.json.
Usage (from prompt-search/):
    venv/bin/python3 scripts/run_rag_eval.py
"""
import sys, os, json, time
from pathlib import Path
from collections import defaultdict
from dotenv import load_dotenv

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics

INDEX_DIR   = ROOT / "data" / "domain"
RESULTS_DIR = ROOT / "data" / "results"
TEST_CASES  = ROOT / "data" / "domain" / "test_cases.json"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

retriever = CourseRetriever(index_dir=str(INDEX_DIR))
builder   = ContextBuilder(retriever, top_k=5)
client    = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))

raw = json.loads(TEST_CASES.read_text())
test_cases = (raw["cases"] if isinstance(raw, dict) else raw)[:120]
print(f"Loaded {len(test_cases)} test cases.")


def evaluate(cases, use_rag: bool):
    predictions, ground_truth = [], []
    retrieval_precisions = []

    for i, tc in enumerate(cases, 1):
        question = tc["question"]
        expected = tc["expected_answer"]
        relevant = set(tc.get("relevant_courses", []))

        if use_rag:
            prompt, sources = builder.build(question)
            retrieved_codes = {s["course_code"] for s in sources}
            if relevant:
                prec = len(retrieved_codes & relevant) / len(retrieved_codes) if retrieved_codes else 0
                retrieval_precisions.append(prec)
        else:
            prompt = f"You are a WSU academic advisor.\n\nQuestion: {question}"

        resp = client.generate(prompt, temperature=0.0, max_tokens=400)
        predictions.append(resp)
        ground_truth.append(expected)

        mode = "RAG" if use_rag else "No-RAG"
        print(f"  [{i}/{len(cases)}] {mode} {tc['id'][:30]:<30} -> {resp[:60]}")

    acc = EvaluationMetrics.accuracy(predictions, ground_truth)
    avg_prec = sum(retrieval_precisions) / len(retrieval_precisions) if retrieval_precisions else None
    return {
        "accuracy": round(acc, 4),
        "avg_retrieval_precision": round(avg_prec, 4) if avg_prec is not None else "n/a",
        "predictions": predictions,
        "ground_truth": ground_truth,
    }


print("\n=== RAG evaluation ===")
rag = evaluate(test_cases, use_rag=True)

print("\n=== Non-RAG evaluation ===")
no_rag = evaluate(test_cases, use_rag=False)

# Per-category breakdown
cat_map = defaultdict(list)
for i, tc in enumerate(test_cases):
    cat_map[tc.get("category", "general")].append(i)

print(f"\n{'Category':<30} {'RAG':>8} {'No-RAG':>8} {'Delta':>8}")
print("-" * 60)
category_rows = []
for cat, idxs in sorted(cat_map.items()):
    rp = [rag["predictions"][i] for i in idxs]
    np_ = [no_rag["predictions"][i] for i in idxs]
    gt = [rag["ground_truth"][i] for i in idxs]
    ra = EvaluationMetrics.accuracy(rp, gt)
    na = EvaluationMetrics.accuracy(np_, gt)
    d = ra - na
    print(f"{cat:<30} {ra:>8.2%} {na:>8.2%} {d:>+8.2%}")
    category_rows.append({"category": cat, "rag_accuracy": round(ra, 4),
                           "no_rag_accuracy": round(na, 4), "delta": round(d, 4)})

output = {
    "rag": {"accuracy": rag["accuracy"], "avg_retrieval_precision": rag["avg_retrieval_precision"]},
    "no_rag": {"accuracy": no_rag["accuracy"]},
    "by_category": category_rows,
}
out_path = RESULTS_DIR / "rag_eval_results.json"
out_path.write_text(json.dumps(output, indent=2))
print(f"\nOverall RAG: {rag['accuracy']:.2%}  No-RAG: {no_rag['accuracy']:.2%}")
print(f"Results saved to {out_path}")
