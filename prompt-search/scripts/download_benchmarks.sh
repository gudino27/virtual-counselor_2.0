#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Activate venv if present
if [ -f "$REPO_ROOT/.venv/bin/activate" ]; then
    source "$REPO_ROOT/.venv/bin/activate"
elif [ -f "$REPO_ROOT/venv/bin/activate" ]; then
    source "$REPO_ROOT/venv/bin/activate"
fi

echo "Downloading GSM8K and MATH benchmark subsets..."

python3 -c "
import sys
sys.path.insert(0, '${REPO_ROOT}/src')
from evaluation.benchmarks import BenchmarkLoader
loader = BenchmarkLoader()
gsm8k = loader.load_gsm8k()
print(f'GSM8K loaded: {len(gsm8k)} records')
math = loader.load_math()
print(f'MATH loaded: {len(math)} records')
"

GSM8K_FILE="$REPO_ROOT/data/benchmarks/gsm8k_subset.json"
MATH_FILE="$REPO_ROOT/data/benchmarks/math_subset.json"

if [ ! -f "$GSM8K_FILE" ]; then
    echo "ERROR: $GSM8K_FILE not found" >&2
    exit 1
fi

if [ ! -f "$MATH_FILE" ]; then
    echo "ERROR: $MATH_FILE not found" >&2
    exit 1
fi

GSM8K_COUNT=$(python3 -c "import json; print(len(json.load(open('$GSM8K_FILE'))))")
MATH_COUNT=$(python3 -c "import json; print(len(json.load(open('$MATH_FILE'))))")

echo ""
echo "Cache files verified:"
echo "  gsm8k_subset.json  — $GSM8K_COUNT records"
echo "  math_subset.json   — $MATH_COUNT records"
