import os
from typing import Dict, List, Optional


class LocalLlamaClient:
    """
    LLM client for local GGUF models via llama-cpp-python.

    Requires: pip install llama-cpp-python
    For GPU support: CMAKE_ARGS="-DLLAMA_CUDA=on" pip install llama-cpp-python --force-reinstall
    """

    def __init__(
        self,
        model_path: str,
        n_ctx: int = 2048,
        n_threads: int = 4,
        use_mlock: bool = True,
        stop_sequences: Optional[List[str]] = None,
    ):
        try:
            from llama_cpp import Llama
        except ImportError:
            raise ImportError(
                "llama-cpp-python is not installed. "
                "Run: pip install llama-cpp-python"
            )

        if not os.path.exists(model_path):
            raise FileNotFoundError(f"Model file not found: {model_path}")

        n_gpu_layers = self._detect_gpu_layers()

        self._model_name = os.path.basename(model_path)
        self._stop_sequences = stop_sequences or ["</s>", "\n\n", "Question:", "###"]
        self._total_tokens = 0

        self._llm = Llama(
            model_path=model_path,
            n_ctx=n_ctx,
            n_threads=n_threads,
            n_gpu_layers=n_gpu_layers,
            use_mlock=use_mlock,
            verbose=False,
        )

    def _detect_gpu_layers(self) -> int:
        if os.environ.get("FORCE_CPU", "0") == "1":
            return 0

        # Apple Silicon Metal — offload all layers
        try:
            import platform
            if platform.system() == "Darwin" and platform.machine() == "arm64":
                return -1  # -1 = all layers on Metal
        except Exception:
            pass

        # CUDA (Nvidia)
        try:
            import torch
            if torch.cuda.is_available():
                vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
                if vram_gb >= 6:
                    return 35
        except ImportError:
            pass

        return 0

    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        # Reset KV cache before each call so questions are fully independent
        self._llm.reset()
        try:
            output = self._llm(
                prompt,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=self._stop_sequences,
            )
        except Exception:
            # If prompt exceeds context, truncate and retry
            words = prompt.split()
            truncated = " ".join(words[:int(len(words) * 0.75)])
            self._llm.reset()
            output = self._llm(
                truncated,
                max_tokens=max_tokens,
                temperature=temperature,
                stop=self._stop_sequences,
            )
        self._total_tokens += output["usage"]["total_tokens"]
        return output["choices"][0]["text"]

    def get_usage_stats(self) -> Dict:
        return {
            "model": self._model_name,
            "provider": "local",
            "total_tokens": self._total_tokens,
        }
