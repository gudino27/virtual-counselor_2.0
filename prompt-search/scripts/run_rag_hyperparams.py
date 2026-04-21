"""
Issue #55 — RAG Hyperparameter Tuning
Sweeps top_k and context length. Skips embedding model comparison (too memory intensive).
Results saved to data/results/rag_hyperparams.json and config/rag.yaml
"""
import sys, os, json, time
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics

INDEX_DIR   = ROOT / "data" / "domain"
RESULTS_DIR = ROOT / "data" / "results"
CONFIG_DIR  = ROOT / "config"
TEST_CASES  = ROOT / "data" / "domain" / "test_cases.json"
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

client = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))
retriever = CourseRetriever(index_dir=str(INDEX_DIR))

raw = json.loads(TEST_CASES.read_text())
test_cases = (raw["cases"] if isinstance(raw, dict) else raw)[:40]
ground_truth = [tc["expected_answer"] for tc in test_cases]
print(f"Loaded {len(test_cases)} cases for hyperparameter sweep.")

# ── Sweep 1: top_k ────────────────────────────────────────────────────────────
print(f"\n{'top_k':>6} {'accuracy':>10} {'avg_words':>10} {'est_cost':>10} {'time':>8}")
print("-" * 50)
topk_results = []
for k in [3, 5, 10, 15]:
    b = ContextBuilder(retriever, top_k=k)
    preds, total_words = [], 0
    t0 = time.time()
    for tc in test_cases:
        prompt, _ = b.build(tc["question"])
        total_words += len(prompt.split())
        preds.append(client.generate(prompt, temperature=0.0, max_tokens=400))
    elapsed = time.time() - t0
    acc = EvaluationMetrics.accuracy(preds, ground_truth)
    avg_words = total_words / len(test_cases)
    est_cost = (total_words / 1000) * 0.00025
    r = {"top_k": k, "accuracy": round(acc, 4), "avg_prompt_words": round(avg_words, 1),
         "est_cost_usd": round(est_cost, 5), "elapsed_s": round(elapsed, 1)}
    topk_results.append(r)
    print(f"{k:>6} {acc:>10.2%} {avg_words:>10.1f} {est_cost:>10.5f} {elapsed:>7.1f}s")

# ── Sweep 2: context length ───────────────────────────────────────────────────
print(f"\n{'max_words':>10} {'accuracy':>10} {'est_cost':>10} {'time':>8}")
print("-" * 44)
context_results = []
b5 = ContextBuilder(retriever, top_k=5)
for max_words in [512, 1024]:
    preds, total_words = [], 0
    t0 = time.time()
    for tc in test_cases:
        prompt, _ = b5.build(tc["question"])
        words = prompt.split()
        total_words += len(words)
        if len(words) > max_words:
            prompt = " ".join(words[:max_words])
        preds.append(client.generate(prompt, temperature=0.0, max_tokens=400))
    elapsed = time.time() - t0
    acc = EvaluationMetrics.accuracy(preds, ground_truth)
    est_cost = (total_words / 1000) * 0.00025
    r = {"max_context_words": max_words, "accuracy": round(acc, 4),
         "est_cost_usd": round(est_cost, 5), "elapsed_s": round(elapsed, 1)}
    context_results.append(r)
    print(f"{max_words:>10} {acc:>10.2%} {est_cost:>10.5f} {elapsed:>7.1f}s")

# ── Best config & save ────────────────────────────────────────────────────────
best_topk = max(topk_results, key=lambda r: r["accuracy"])
best_ctx  = max(context_results, key=lambda r: r["accuracy"])

print(f"\nBest top_k:    {best_topk['top_k']} ({best_topk['accuracy']:.2%})")
print(f"Best context:  {best_ctx['max_context_words']} words ({best_ctx['accuracy']:.2%})")

rag_config = {
    "top_k": best_topk["top_k"],
    "embedding_model": "all-MiniLM-L6-v2",
    "max_context_words": best_ctx["max_context_words"],
    "model": "claude-haiku-4-5",
    "temperature": 0.0,
    "max_tokens": 400,
}

import yaml
with open(CONFIG_DIR / "rag.yaml", "w") as f:
    yaml.dump(rag_config, f, default_flow_style=False)
print(f"Config saved to {CONFIG_DIR / 'rag.yaml'}")

output = {
    "top_k_sweep": topk_results,
    "embedding_model_comparison": "skipped — too memory intensive for runtime execution",
    "context_length_comparison": context_results,
    "best_config": rag_config,
}
out_path = RESULTS_DIR / "rag_hyperparams.json"
out_path.write_text(json.dumps(output, indent=2))
print(f"Results saved to {out_path}")
