"""Shared plotting helpers for search algorithm analysis."""
from collections import Counter
from typing import Dict, List

import matplotlib.pyplot as plt


def _extract_accuracy(entry: dict) -> float:
    """Pull the accuracy value from a history entry regardless of algorithm format."""
    return entry.get("best_accuracy") or entry.get("best_avg_reward") or entry.get("accuracy") or 0.0


def _extract_step(entry: dict) -> int:
    return entry.get("iteration") or entry.get("round") or 0


def plot_search_progress(histories: List[List[dict]], labels: List[str], ax=None) -> plt.Axes:
    """
    Overlay convergence curves (accuracy vs iteration) for multiple algorithms.

    Parameters
    ----------
    histories : list of history lists
        Each list is the .history attribute of a search optimizer.
        Entries may contain 'best_accuracy' (beam search),
        'best_avg_reward' (MCTS), or 'accuracy' (iterative refinement).
    labels : list of str
        Legend label for each history.
    ax : matplotlib Axes, optional
        Axes to draw on; creates a new figure if None.
    """
    if ax is None:
        _, ax = plt.subplots(figsize=(8, 4))

    for history, label in zip(histories, labels):
        steps = [_extract_step(e) for e in history]
        accs = [_extract_accuracy(e) for e in history]
        ax.plot(steps, accs, marker="o", linewidth=2, label=label)

    ax.set_xlabel("Iteration / Round")
    ax.set_ylabel("Accuracy")
    ax.set_title("Search Algorithm Convergence")
    ax.set_ylim(-0.05, 1.05)
    ax.legend()
    ax.grid(True, alpha=0.3)
    plt.tight_layout()
    return ax


def plot_mutation_frequency(history: List[dict], ax=None) -> plt.Axes:
    """
    Bar chart of which mutations were selected most often across a search run.

    Works with beam search history (uses 'best_path') and iterative refinement
    history (uses 'mutation_applied'). MCTS does not record per-iteration
    mutations so passing MCTS history produces an empty chart.

    Parameters
    ----------
    history : list of dict
        The .history attribute of a search optimizer.
    ax : matplotlib Axes, optional
    """
    if ax is None:
        _, ax = plt.subplots(figsize=(7, 4))

    mutations: List[str] = []
    for entry in history:
        if "mutation_applied" in entry:
            name = entry["mutation_applied"]
            if name and name != "none":
                mutations.append(name)
        elif "best_path" in entry:
            # beam search: best_path is a " -> " chain; count last step
            path = entry["best_path"]
            if path and path != "base":
                mutations.append(path.split(" -> ")[-1])

    if not mutations:
        ax.text(0.5, 0.5, "No mutation data", ha="center", va="center", transform=ax.transAxes)
        ax.set_title("Mutation Frequency")
        return ax

    counts = Counter(mutations)
    names, freqs = zip(*sorted(counts.items(), key=lambda x: -x[1]))
    ax.bar(names, freqs, color="steelblue")
    ax.set_xlabel("Mutation")
    ax.set_ylabel("Times Selected")
    ax.set_title("Mutation Frequency")
    plt.xticks(rotation=30, ha="right")
    plt.tight_layout()
    return ax


def plot_algorithm_comparison(results_dict: Dict[str, dict], ax=None) -> plt.Axes:
    """
    Grouped bar chart comparing accuracy, API calls, and runtime across algorithms.

    Parameters
    ----------
    results_dict : dict
        Keys are algorithm names; values are dicts with keys:
        'accuracy' (float), 'api_calls' (int), 'runtime_s' (float).
        Missing keys default to 0.
    ax : matplotlib Axes, optional
    """
    if ax is None:
        _, ax = plt.subplots(figsize=(8, 4))

    algorithms = list(results_dict.keys())
    metrics = ["accuracy", "api_calls", "runtime_s"]
    labels = ["Accuracy", "API Calls", "Runtime (s)"]
    n = len(algorithms)
    group_width = 0.6
    bar_width = group_width / len(metrics)

    import numpy as np
    x = np.arange(n)

    for i, (metric, label) in enumerate(zip(metrics, labels)):
        values = [results_dict[alg].get(metric, 0) for alg in algorithms]
        # Normalise api_calls and runtime_s to [0,1] for display on same axis
        if metric != "accuracy" and max(values) > 0:
            values = [v / max(values) for v in values]
        offset = (i - len(metrics) / 2 + 0.5) * bar_width
        ax.bar(x + offset, values, width=bar_width, label=label)

    ax.set_xticks(x)
    ax.set_xticklabels(algorithms)
    ax.set_ylabel("Normalised Value")
    ax.set_title("Algorithm Comparison (api_calls and runtime normalised)")
    ax.legend()
    ax.grid(True, alpha=0.3, axis="y")
    plt.tight_layout()
    return ax
