from abc import ABC, abstractmethod
from typing import Dict


class BaseLLMClient(ABC):
    @abstractmethod
    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        pass

    @abstractmethod
    def get_usage_stats(self) -> Dict:
        pass
