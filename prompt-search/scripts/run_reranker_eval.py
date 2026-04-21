"""
Compare RAG accuracy with and without NVIDIA reranker.
Baseline: FAISS top_k=3 (90% from prior sweep)
Test:     FAISS top_k=12 -> reranker -> top 3
"""
import sys, os, json, time
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from retrieval.reranker import NvidiaReranker
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics

INDEX_DIR  = ROOT / "data" / "domain"
TEST_CASES = ROOT / "data" / "domain" / "test_cases.json"
RESULTS    = ROOT / "data" / "results" / "reranker_comparison.json"

raw = json.loads(TEST_CASES.read_text())
cases = (raw["cases"] if isinstance(raw, dict) else raw)[:40]
ground_truth = [tc["expected_answer"] for tc in cases]
print(f"Loaded {len(cases)} test cases\n")

client   = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))
retriever = CourseRetriever(index_dir=str(INDEX_DIR))

def run_eval(label: str, builder: ContextBuilder) -> dict:
    preds, t0 = [], time.time()
    for tc in cases:
        prompt, _ = builder.build(tc["question"])
        preds.append(client.generate(prompt, temperature=0.0, max_tokens=400))
    elapsed = round(time.time() - t0, 1)
    acc = EvaluationMetrics.accuracy(preds, ground_truth)
    print(f"{label:30s}  accuracy={acc:.2%}  time={elapsed}s")
    return {"label": label, "accuracy": round(acc, 4), "elapsed_s": elapsed}

print(f"{'Config':30s}  {'Accuracy':>10}  {'Time':>8}")
print("-" * 55)

# Baseline: FAISS only, top_k=3 (reranker disabled)
baseline_builder = ContextBuilder(retriever, top_k=3)
baseline_builder.reranker.enabled = False  # force off
baseline = run_eval("FAISS top_k=3 (no reranker)", baseline_builder)

# Test: FAISS top_k=12 -> reranker -> top 3
rerank_builder = ContextBuilder(retriever, top_k=3)
if not rerank_builder.reranker.enabled:
    print("\n[WARN] NVIDIA_API_KEY not set — reranker test skipped")
    sys.exit(1)
reranked = run_eval("FAISS top_k=12 + reranker", rerank_builder)

delta = reranked["accuracy"] - baseline["accuracy"]
print(f"\nDelta: {delta:+.2%}")

output = {
    "baseline": baseline,
    "reranked": reranked,
    "delta": round(delta, 4),
}
RESULTS.write_text(json.dumps(output, indent=2))
print(f"Results saved to {RESULTS}")
