"""
Sweep fetch_k (candidates fed to reranker) and max_context_words to find accuracy ceiling.
Keeps final top_k=3 and reranker fixed.
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
RESULTS    = ROOT / "data" / "results" / "reranker_sweep.json"

raw = json.loads(TEST_CASES.read_text())
cases = (raw["cases"] if isinstance(raw, dict) else raw)[:40]
ground_truth = [tc["expected_answer"] for tc in cases]
print(f"Loaded {len(cases)} test cases\n")

client    = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))
retriever = CourseRetriever(index_dir=str(INDEX_DIR))

def run_eval(fetch_k: int, max_words: int | None) -> dict:
    reranker = NvidiaReranker(top_n=3)
    preds, t0 = [], time.time()
    for tc in cases:
        candidates = retriever.search(tc["question"], top_k=fetch_k)
        sources = reranker.rerank(tc["question"], candidates)

        context_lines = []
        for entry in sources:
            line = f"- {entry['course_code']}: {entry['chunk_text'][:300]}"
            if entry.get("prereq_raw"):
                line += f" (Prerequisites: {entry['prereq_raw']})"
            context_lines.append(line)

        prompt = (
            "You are a WSU academic advisor. Use the following course information "
            "to answer the student's question accurately. "
            "Answer in 1-2 sentences. Be concise and do not use markdown formatting.\n\n"
            "Relevant courses:\n" + "\n".join(context_lines) +
            f"\n\nQuestion: {tc['question']}"
        )
        if max_words:
            words = prompt.split()
            if len(words) > max_words:
                prompt = " ".join(words[:max_words])

        preds.append(client.generate(prompt, temperature=0.0, max_tokens=400))

    elapsed = round(time.time() - t0, 1)
    acc = EvaluationMetrics.accuracy(preds, ground_truth)
    label = f"fetch_k={fetch_k:2d} max_words={str(max_words):6s}"
    print(f"  {label}  acc={acc:.2%}  time={elapsed}s")
    return {"fetch_k": fetch_k, "max_context_words": max_words,
            "accuracy": round(acc, 4), "elapsed_s": elapsed}

print(f"  {'Config':35s}  {'Accuracy':>10}  {'Time':>8}")
print("  " + "-" * 60)

results = []
for fetch_k in [12, 20, 30]:
    for max_words in [1024, None]:
        r = run_eval(fetch_k, max_words)
        results.append(r)

best = max(results, key=lambda r: r["accuracy"])
print(f"\nBest: fetch_k={best['fetch_k']} max_words={best['max_context_words']} -> {best['accuracy']:.2%}")

RESULTS.write_text(json.dumps({"sweep": results, "best": best}, indent=2))
print(f"Results saved to {RESULTS}")
