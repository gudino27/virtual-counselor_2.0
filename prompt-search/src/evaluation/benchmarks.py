import json
import random
from pathlib import Path

try:
    from datasets import load_dataset
except ImportError:
    load_dataset = None

CACHE_DIR = Path(__file__).parent.parent.parent / "data" / "benchmarks"


class BenchmarkLoader:
    def __init__(self, cache_dir: Path = CACHE_DIR):
        self.cache_dir = Path(cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def load_gsm8k(self, subset_size: int = 500) -> list[dict]:
        cache_path = self.cache_dir / "gsm8k_subset.json"
        if cache_path.exists():
            with open(cache_path) as f:
                return json.load(f)

        ds = load_dataset("gsm8k", "main", split="test")
        rng = random.Random(42)
        indices = rng.sample(range(len(ds)), min(subset_size, len(ds)))
        subset = [{"question": ds[i]["question"], "answer": ds[i]["answer"]} for i in indices]

        with open(cache_path, "w") as f:
            json.dump(subset, f, indent=2)
        return subset

    def load_math(self, subset_size: int = 200) -> list[dict]:
        cache_path = self.cache_dir / "math_subset.json"
        if cache_path.exists():
            with open(cache_path) as f:
                return json.load(f)

        ds = load_dataset("hendrycks/math", "all", split="test", trust_remote_code=True)
        rng = random.Random(42)
        indices = rng.sample(range(len(ds)), min(subset_size, len(ds)))
        subset = [{"question": ds[i]["problem"], "answer": ds[i]["solution"]} for i in indices]

        with open(cache_path, "w") as f:
            json.dump(subset, f, indent=2)
        return subset
