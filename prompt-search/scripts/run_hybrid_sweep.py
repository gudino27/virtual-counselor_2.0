"""
Sweep BM25 hybrid retrieval + few-shot count vs current best (92.5%).
Baseline config: fetch_k=30, reranker, uncapped context, 3 few-shot examples.
"""
import sys, os, json, time
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.hybrid_retriever import HybridRetriever
from retrieval.context_builder import ContextBuilder
from retrieval.reranker import NvidiaReranker
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics

INDEX_DIR  = ROOT / "data" / "domain"
TEST_CASES = ROOT / "data" / "domain" / "test_cases.json"
RESULTS    = ROOT / "data" / "results" / "hybrid_sweep.json"

raw = json.loads(TEST_CASES.read_text())
cases = (raw["cases"] if isinstance(raw, dict) else raw)[:40]
ground_truth = [tc["expected_answer"] for tc in cases]
print(f"Loaded {len(cases)} test cases\n")

client    = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))
retriever = CourseRetriever(index_dir=str(INDEX_DIR))
hybrid    = HybridRetriever(retriever, alpha=0.5)

def build_prompt(sources: list[dict], question: str, few_shot_n: int) -> str:
    from retrieval.context_builder import _load_few_shot_examples, _UCORE_BLOCK, _UCORE_RE
    context_lines = []
    for entry in sources:
        line = f"- {entry['course_code']}: {entry['chunk_text'][:300]}"
        if entry.get("prereq_raw"):
            line += f" (Prerequisites: {entry['prereq_raw']})"
        context_lines.append(line)

    few_shot = _load_few_shot_examples(few_shot_n)
    few_shot_block = f"Examples of concise answers:\n{few_shot}\n\n" if few_shot else ""
    ucore_block = _UCORE_BLOCK if _UCORE_RE.search(question) else ""

    return (
        "You are a WSU academic advisor. Use the following course information "
        "to answer the student's question accurately. "
        "Answer in 1-2 sentences. Be concise and do not use markdown formatting.\n\n"
        f"{ucore_block}"
        "Relevant courses:\n" + "\n".join(context_lines) +
        f"\n\n{few_shot_block}Question: {question}"
    )

def run_eval(label: str, use_hybrid: bool, few_shot_n: int) -> dict:
    reranker = NvidiaReranker(top_n=3)
    src = hybrid if use_hybrid else retriever
    preds, t0 = [], time.time()
    for tc in cases:
        candidates = src.search(tc["question"], top_k=30)
        sources = reranker.rerank(tc["question"], candidates)
        prompt = build_prompt(sources, tc["question"], few_shot_n)
        preds.append(client.generate(prompt, temperature=0.0, max_tokens=400))
    elapsed = round(time.time() - t0, 1)
    acc = EvaluationMetrics.accuracy(preds, ground_truth)
    print(f"  {label:45s}  acc={acc:.2%}  time={elapsed}s")
    return {"label": label, "use_hybrid": use_hybrid, "few_shot_n": few_shot_n,
            "accuracy": round(acc, 4), "elapsed_s": elapsed}

print(f"  {'Config':45s}  {'Accuracy':>10}  {'Time':>8}")
print("  " + "-" * 70)

results = []
for use_hybrid in [False, True]:
    for few_shot_n in [3, 6, 12]:
        retriever_label = "hybrid" if use_hybrid else "faiss "
        label = f"{retriever_label} + reranker, few_shot={few_shot_n}"
        results.append(run_eval(label, use_hybrid, few_shot_n))

best = max(results, key=lambda r: r["accuracy"])
print(f"\nBest: {best['label']} -> {best['accuracy']:.2%}")

RESULTS.write_text(json.dumps({"sweep": results, "best": best}, indent=2))
print(f"Results saved to {RESULTS}")
