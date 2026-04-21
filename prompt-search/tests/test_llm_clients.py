import tempfile
import time
from unittest.mock import MagicMock, patch

import pytest

from src.llm.cache import ResponseCache
from src.llm.rate_limiter import TokenBucketRateLimiter


class TestResponseCache:
    def setup_method(self):
        self._tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self._cache = ResponseCache(db_path=self._tmp.name, max_age_hours=168)

    def test_miss_returns_none(self):
        result = self._cache.get("some prompt", "gpt-4", 0.7)
        assert result is None

    def test_set_then_get(self):
        self._cache.set("my prompt", "gpt-4", 0.7, "cached response")
        result = self._cache.get("my prompt", "gpt-4", 0.7)
        assert result == "cached response"

    def test_different_temperature_is_separate_entry(self):
        self._cache.set("prompt", "gpt-4", 0.7, "response A")
        self._cache.set("prompt", "gpt-4", 0.0, "response B")
        assert self._cache.get("prompt", "gpt-4", 0.7) == "response A"
        assert self._cache.get("prompt", "gpt-4", 0.0) == "response B"

    def test_different_model_is_separate_entry(self):
        self._cache.set("prompt", "gpt-4", 0.7, "response A")
        self._cache.set("prompt", "gpt-3.5-turbo", 0.7, "response B")
        assert self._cache.get("prompt", "gpt-4", 0.7) == "response A"
        assert self._cache.get("prompt", "gpt-3.5-turbo", 0.7) == "response B"

    def test_replace_existing_entry(self):
        self._cache.set("prompt", "gpt-4", 0.7, "first")
        self._cache.set("prompt", "gpt-4", 0.7, "second")
        assert self._cache.get("prompt", "gpt-4", 0.7) == "second"

    def test_stats_returns_count(self):
        self._cache.set("p1", "gpt-4", 0.7, "r1")
        self._cache.set("p2", "gpt-4", 0.7, "r2")
        stats = self._cache.stats()
        assert stats["total_entries"] == 2


class TestTokenBucketRateLimiter:
    def test_acquire_within_capacity(self):
        limiter = TokenBucketRateLimiter(requests_per_minute=60)
        start = time.monotonic()
        limiter.acquire()
        elapsed = time.monotonic() - start
        assert elapsed < 0.1

    def test_acquire_multiple_within_capacity(self):
        limiter = TokenBucketRateLimiter(requests_per_minute=60)
        for _ in range(5):
            limiter.acquire()

    def test_bucket_blocks_when_empty(self):
        fast_limiter = TokenBucketRateLimiter(requests_per_minute=6000)
        fast_limiter.acquire()


class TestClaudeClientMocked:
    def _make_mock_response(self, text: str, input_tokens: int = 10, output_tokens: int = 5):
        mock_block = MagicMock()
        mock_block.type = "text"
        mock_block.text = text
        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_response.usage.input_tokens = input_tokens
        mock_response.usage.output_tokens = output_tokens
        return mock_response

    def test_generate_returns_content(self):
        with patch("src.llm.claude_client.anthropic.Anthropic") as MockAnthropic:
            mock_client = MagicMock()
            MockAnthropic.return_value = mock_client
            mock_client.messages.create.return_value = self._make_mock_response("The answer is 42.")

            from src.llm.claude_client import ClaudeClient
            client = ClaudeClient(model="claude-haiku-4-5", api_key="fake-key")
            result = client.generate("What is 6 times 7?")

            assert result == "The answer is 42."

    def test_usage_stats_accumulate(self):
        with patch("src.llm.claude_client.anthropic.Anthropic") as MockAnthropic:
            mock_client = MagicMock()
            MockAnthropic.return_value = mock_client
            mock_client.messages.create.return_value = self._make_mock_response("Response.")

            from src.llm.claude_client import ClaudeClient
            client = ClaudeClient(model="claude-haiku-4-5", api_key="fake-key")
            client.generate("prompt 1")
            client.generate("prompt 2")

            stats = client.get_usage_stats()
            assert stats["total_input_tokens"] == 20
            assert stats["total_output_tokens"] == 10
            assert stats["total_tokens"] == 30

    def test_usage_stats_fields(self):
        with patch("src.llm.claude_client.anthropic.Anthropic") as MockAnthropic:
            mock_client = MagicMock()
            MockAnthropic.return_value = mock_client
            mock_client.messages.create.return_value = self._make_mock_response("ok")

            from src.llm.claude_client import ClaudeClient
            client = ClaudeClient(model="claude-haiku-4-5", api_key="fake-key")
            stats = client.get_usage_stats()

            assert stats["provider"] == "claude"
            assert stats["model"] == "claude-haiku-4-5"
