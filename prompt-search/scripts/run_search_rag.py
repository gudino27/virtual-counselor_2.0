"""
Issue #56 — Search+RAG Integration & Self-Consistency
4-way comparison: baseline, search-only, RAG-only, search+RAG
Results saved to data/results/search_rag_comparison.json
"""
import sys, os, json, time
from pathlib import Path
from collections import Counter, defaultdict
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics
from prompts.template import PromptTemplate
from search.beam_search import BeamSearchPromptOptimizer

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

# ── Step 1: Beam search for best prompt template ──────────────────────────────
val_set = [{"question": tc["question"], "answer": tc["expected_answer"]} for tc in test_cases[:30]]

base_template = PromptTemplate(
    system_role="a WSU academic advisor",
    task_description="Answer the student's question about WSU courses, prerequisites, or degree requirements. Be concise.",
)

optimizer = BeamSearchPromptOptimizer(beam_width=3, max_iterations=5, llm_client=client, patience=2)
print("Running beam search on 30-case validation set...")
t0 = time.time()
best_template = optimizer.search(base_template, val_set)
print(f"Done in {time.time()-t0:.1f}s — best path: {best_template.mutation_path()}")
for e in optimizer.history:
    print(f"  iter {e['iteration']}: acc={e['best_accuracy']:.3f}  path={e['best_path']}")

# ── Step 2: 4-way evaluation ──────────────────────────────────────────────────
def run_mode(cases, mode, template=None):
    predictions, ground_truth = [], []
    for tc in cases:
        q, expected = tc["question"], tc["expected_answer"]
        if mode == "baseline":
            prompt = f"You are a WSU academic advisor.\n\nQuestion: {q}"
        elif mode == "search_only":
            prompt = template.render(q)
        elif mode == "rag_only":
            prompt, _ = builder.build(q)
        elif mode == "search_rag":
            rag_prompt, _ = builder.build(q)
            search_prefix = template.render("").replace("\n\nProblem: ", "")
            prompt = search_prefix + "\n\n" + rag_prompt
        predictions.append(client.generate(prompt, temperature=0.0, max_tokens=400))
        ground_truth.append(expected)
    acc = EvaluationMetrics.accuracy(predictions, ground_truth)
    return {"mode": mode, "accuracy": round(acc, 4), "predictions": predictions, "ground_truth": ground_truth}

results = {}
print("\nRunning 4-way comparison...")
for mode in ["baseline", "search_only", "rag_only", "search_rag"]:
    print(f"  {mode}...", end="", flush=True)
    t0 = time.time()
    results[mode] = run_mode(test_cases, mode, template=best_template)
    print(f" {results[mode]['accuracy']:.2%} ({time.time()-t0:.1f}s)")

# ── Step 3: Per-category table ────────────────────────────────────────────────
cat_map = defaultdict(list)
for i, tc in enumerate(test_cases):
    cat_map[tc.get("category", "general")].append(i)

modes = ["baseline", "search_only", "rag_only", "search_rag"]
print(f"\n{'Category':<30} {'Baseline':>9} {'Search':>9} {'RAG':>9} {'Search+RAG':>11}")
print("-" * 72)
category_rows = []
for cat, idxs in sorted(cat_map.items()):
    accs = {}
    for mode in modes:
        preds = [results[mode]["predictions"][i] for i in idxs]
        gt    = [results[mode]["ground_truth"][i] for i in idxs]
        accs[mode] = EvaluationMetrics.accuracy(preds, gt)
    print(f"{cat:<30} {accs['baseline']:>9.2%} {accs['search_only']:>9.2%} {accs['rag_only']:>9.2%} {accs['search_rag']:>11.2%}")
    category_rows.append({"category": cat, **{m: round(accs[m], 4) for m in modes}})

overall = {m: round(results[m]["accuracy"], 4) for m in modes}
print("-" * 72)
print(f"{'OVERALL':<30} {overall['baseline']:>9.2%} {overall['search_only']:>9.2%} {overall['rag_only']:>9.2%} {overall['search_rag']:>11.2%}")

# ── Step 4: Self-consistency (5 samples on 20 cases) ─────────────────────────
SC_SAMPLES, SC_SUBSET = 5, test_cases[:20]
sc_preds, sc_gt = [], []
print(f"\nSelf-consistency ({SC_SAMPLES}x) on {len(SC_SUBSET)} cases...")
for tc in SC_SUBSET:
    prompt, _ = builder.build(tc["question"])
    samples = [client.generate(prompt, temperature=0.7, max_tokens=400) for _ in range(SC_SAMPLES)]
    sc_preds.append(Counter(samples).most_common(1)[0][0])
    sc_gt.append(tc["expected_answer"])

sc_acc     = EvaluationMetrics.accuracy(sc_preds, sc_gt)
rag_acc_20 = EvaluationMetrics.accuracy([results["rag_only"]["predictions"][i] for i in range(len(SC_SUBSET))], sc_gt)
print(f"RAG only (20):         {rag_acc_20:.2%}")
print(f"RAG + SC (5x):         {sc_acc:.2%}  (delta: {sc_acc-rag_acc_20:+.2%})")

# ── Save ──────────────────────────────────────────────────────────────────────
output = {
    "best_mutation_path": best_template.mutation_path(),
    "beam_search_history": optimizer.history,
    "overall": overall,
    "by_category": category_rows,
    "self_consistency": {
        "samples": SC_SAMPLES, "subset_size": len(SC_SUBSET),
        "rag_only_acc": round(rag_acc_20, 4),
        "sc_rag_acc": round(sc_acc, 4),
        "delta": round(sc_acc - rag_acc_20, 4),
    },
}
out_path = RESULTS_DIR / "search_rag_comparison.json"
out_path.write_text(json.dumps(output, indent=2))
print(f"\nResults saved to {out_path}")
