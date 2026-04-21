def _get_encoder():
    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np
        return SentenceTransformer("all-MiniLM-L6-v2"), np
    except ImportError:
        return None, None


def _cosine(a, b, np):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))


class EvaluationMetrics:
    _encoder = None
    _np = None

    @classmethod
    def _embed(cls, texts: list[str]):
        if cls._encoder is None:
            cls._encoder, cls._np = _get_encoder()
        if cls._encoder is None:
            return None
        return cls._encoder.encode(texts, convert_to_numpy=True, show_progress_bar=False)

    @staticmethod
    def accuracy(predictions: list[str], ground_truth: list[str], threshold: float = 0.60) -> float:
        """Semantic similarity accuracy using sentence embeddings (cosine >= threshold)."""
        if not ground_truth:
            return 0.0

        preds_emb = EvaluationMetrics._embed(predictions)
        gt_emb = EvaluationMetrics._embed(ground_truth)

        if preds_emb is None or gt_emb is None:
            # Fallback to substring match if embeddings unavailable
            correct = sum(
                gt.strip().lower() in pred.strip().lower()
                for pred, gt in zip(predictions, ground_truth)
            )
            return correct / len(ground_truth)

        np = EvaluationMetrics._np
        correct = sum(
            _cosine(p, g, np) >= threshold
            for p, g in zip(preds_emb, gt_emb)
        )
        return correct / len(ground_truth)

    @staticmethod
    def pass_at_k(predictions: list[list[str]], ground_truth: list[str], k: int, threshold: float = 0.60) -> float:
        """At least 1 of k samples is semantically correct for each example."""
        if not ground_truth:
            return 0.0
        passed = 0
        np = EvaluationMetrics._np
        gt_emb = EvaluationMetrics._embed(ground_truth)
        for i, (samples, gt) in enumerate(zip(predictions, ground_truth)):
            top_k = samples[:k]
            if gt_emb is not None and np is not None:
                top_k_emb = EvaluationMetrics._embed(top_k)
                if any(_cosine(p, gt_emb[i], np) >= threshold for p in top_k_emb):
                    passed += 1
            else:
                if any(gt.strip().lower() in pred.strip().lower() for pred in top_k):
                    passed += 1
        return passed / len(ground_truth)

    @staticmethod
    def token_cost(
        usage_stats: dict,
        cost_per_1k_input: float = 0.00025,
        cost_per_1k_output: float = 0.00125,
    ) -> float:
        input_tokens = usage_stats.get("input_tokens", 0)
        output_tokens = usage_stats.get("output_tokens", 0)
        return (input_tokens / 1000) * cost_per_1k_input + (output_tokens / 1000) * cost_per_1k_output

    @staticmethod
    def normalized_score(score: float, baseline_score: float) -> float:
        """Improvement over baseline as a ratio. Returns 0 if baseline is 0."""
        if baseline_score == 0:
            return 0.0
        return (score - baseline_score) / baseline_score
