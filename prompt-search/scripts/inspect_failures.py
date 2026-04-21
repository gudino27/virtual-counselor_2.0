"""Print the questions the current best config gets wrong."""
import sys, os, json
from pathlib import Path
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder
from llm.claude_client import ClaudeClient
from evaluation.metrics import EvaluationMetrics

INDEX_DIR  = ROOT / "data" / "domain"
TEST_CASES = ROOT / "data" / "domain" / "test_cases.json"

raw = json.loads(TEST_CASES.read_text())
cases = (raw["cases"] if isinstance(raw, dict) else raw)[:40]

client   = ClaudeClient(model="claude-haiku-4-5", api_key=os.getenv("ANTHROPIC_API_KEY"))
retriever = CourseRetriever(index_dir=str(INDEX_DIR))
builder  = ContextBuilder(retriever)

failures = []
for i, tc in enumerate(cases):
    prompt, sources = builder.build(tc["question"])
    pred = client.generate(prompt, temperature=0.0, max_tokens=400)
    score = EvaluationMetrics.accuracy([pred], [tc["expected_answer"]])
    if score < 0.60:
        failures.append({
            "idx": i + 1,
            "question": tc["question"],
            "expected": tc["expected_answer"],
            "got": pred,
            "score": round(score, 3),
            "category": tc.get("category", "unknown"),
        })
    print(f"  [{i+1:2d}] {'FAIL' if score < 0.60 else 'pass'}  score={score:.3f}  {tc['question'][:60]}")

print(f"\n{len(failures)} failures out of {len(cases)}\n")
for f in failures:
    print(f"[{f['idx']}] ({f['category']}) score={f['score']}")
    print(f"  Q: {f['question']}")
    print(f"  Expected: {f['expected']}")
    print(f"  Got:      {f['got']}\n")
