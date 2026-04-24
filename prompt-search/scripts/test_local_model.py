"""
Quick smoke test: run 5 WSU domain questions through the local GGUF model
and compare quality/speed vs the Claude Haiku baseline.

Usage:
    python3 scripts/test_local_model.py
    python3 scripts/test_local_model.py --model models/llama-3.2-3b-instruct-q4_k_m.gguf
    python3 scripts/test_local_model.py --gpu-layers 32   # GTX 950 full GPU (3B model)
"""
import sys, os, time, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

from retrieval.retriever import CourseRetriever
from retrieval.context_builder import ContextBuilder

INDEX_DIR = ROOT / "data" / "domain"

SAMPLE_QUESTIONS = [
    ("prerequisite",     "What are the prerequisites for CPT S 360?"),
    ("prerequisite",     "What courses do I need before taking CPT S 451?"),
    ("degree_progress",  "What core CS courses are required for a CS degree at WSU?"),
    ("ucore_planning",   "Which UCORE categories does CPT S 492 satisfy?"),
    ("credit_calc",      "How many credits is CPT S 223?"),
]

def run_local(model_path: str, gpu_layers: int, n_threads: int):
    from llama_cpp import Llama
    print(f"\nLoading model: {os.path.basename(model_path)}")
    print(f"  GPU layers: {gpu_layers} | Threads: {n_threads}")
    t0 = time.time()
    llm = Llama(model_path=model_path, n_ctx=2048, n_threads=n_threads,
                n_gpu_layers=gpu_layers, verbose=False)
    print(f"  Load time: {time.time()-t0:.1f}s\n")

    retriever = CourseRetriever(index_dir=str(INDEX_DIR))
    builder   = ContextBuilder(retriever, top_k=3)

    print(f"{'Category':20s} {'Tok/s':>7}  Answer (first 120 chars)")
    print("-" * 80)
    for cat, q in SAMPLE_QUESTIONS:
        prompt, _ = builder.build(q)
        t0 = time.time()
        out = llm(prompt, max_tokens=200, temperature=0.0, stop=["</s>", "\n\nQuestion:", "###"])
        elapsed = time.time() - t0
        text  = out["choices"][0]["text"].strip()
        toks  = out["usage"]["total_tokens"]
        tps   = round(toks / elapsed, 1)
        print(f"{cat:20s} {tps:>6.1f}  {text[:120].replace(chr(10),' ')}")

def run_claude():
    from llm.claude_client import ClaudeClient
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("\n[skip] ANTHROPIC_API_KEY not set — skipping Claude comparison")
        return

    client   = ClaudeClient(model="claude-haiku-4-5", api_key=api_key)
    retriever = CourseRetriever(index_dir=str(INDEX_DIR))
    builder   = ContextBuilder(retriever, top_k=3)

    print(f"\n{'Category':20s} {'Tok/s':>7}  Answer (first 120 chars)")
    print("-" * 80)
    for cat, q in SAMPLE_QUESTIONS:
        prompt, _ = builder.build(q)
        t0 = time.time()
        answer = client.generate(prompt, temperature=0.0, max_tokens=200)
        elapsed = time.time() - t0
        # Estimate tokens (~4 chars/token)
        tps = round(len(answer) / 4 / elapsed, 1)
        print(f"{cat:20s} {tps:>6.1f}  {answer[:120].replace(chr(10),' ')}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=str(ROOT / "models" / "Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf"))
    parser.add_argument("--gpu-layers", type=int, default=0)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--skip-claude", action="store_true")
    args = parser.parse_args()

    if not Path(args.model).exists():
        # Try 3B fallback
        fallback = ROOT / "models" / "Llama-3.2-3B-Instruct-Q4_K_M.gguf"
        if fallback.exists():
            args.model = str(fallback)
            print(f"8B not found, using 3B: {fallback.name}")
        else:
            print(f"Model not found: {args.model}")
            sys.exit(1)

    print("=" * 80)
    print(f"LOCAL MODEL: {os.path.basename(args.model)}")
    print("=" * 80)
    run_local(args.model, args.gpu_layers, args.threads)

    if not args.skip_claude:
        print("\n" + "=" * 80)
        print("CLAUDE HAIKU (API baseline)")
        print("=" * 80)
        run_claude()
