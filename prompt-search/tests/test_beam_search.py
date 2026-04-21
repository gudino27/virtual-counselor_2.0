import copy
from functools import partial
from typing import Dict, List

import pytest

from src.llm.base import BaseLLMClient
from src.prompts.mutations import PromptMutator
from src.prompts.template import PromptTemplate
from src.search.beam_search import BeamSearchPromptOptimizer, _default_match


# ---------------------------------------------------------------------------
# Mock LLM clients
# ---------------------------------------------------------------------------

class AlwaysCorrectLLMClient(BaseLLMClient):
    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        return "CORRECT"

    def get_usage_stats(self) -> Dict:
        return {}


class AlwaysWrongLLMClient(BaseLLMClient):
    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        return "WRONG"

    def get_usage_stats(self) -> Dict:
        return {}


class KeywordMockLLMClient(BaseLLMClient):
    """Returns answer_token when prompt contains trigger_keyword, else wrong_token."""

    def __init__(self, trigger_keyword: str, answer_token: str, wrong_token: str = "WRONG"):
        self.trigger_keyword = trigger_keyword
        self.answer_token = answer_token
        self.wrong_token = wrong_token
        self._calls = 0

    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        self._calls += 1
        if self.trigger_keyword in prompt:
            return self.answer_token
        return self.wrong_token

    def get_usage_stats(self) -> Dict:
        return {"calls": self._calls}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_template() -> PromptTemplate:
    return PromptTemplate(task_description="Solve these problems.")


@pytest.fixture
def simple_validation_set() -> List[Dict]:
    return [
        {"question": "What is 1+1?", "answer": "CORRECT"},
        {"question": "What is 2+2?", "answer": "CORRECT"},
    ]


# ---------------------------------------------------------------------------
# Return type
# ---------------------------------------------------------------------------

class TestBeamSearchReturnType:
    def test_search_returns_prompt_template(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        result = optimizer.search(base_template, simple_validation_set)
        assert isinstance(result, PromptTemplate)

    def test_returns_prompt_template_when_no_improvement(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysWrongLLMClient(), patience=1
        )
        result = optimizer.search(base_template, simple_validation_set)
        assert isinstance(result, PromptTemplate)


# ---------------------------------------------------------------------------
# Beam pruning
# ---------------------------------------------------------------------------

class TestBeamPruning:
    def test_beam_pruned_to_beam_width(self, base_template, simple_validation_set):
        beam_width = 2
        optimizer = BeamSearchPromptOptimizer(
            beam_width=beam_width, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            assert len(record["beam_accuracies"]) <= beam_width

    def test_beam_width_one_keeps_single_best(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=1, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            assert len(record["beam_accuracies"]) == 1

    def test_beam_accuracies_sorted_descending(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=3, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            accs = record["beam_accuracies"]
            assert accs == sorted(accs, reverse=True)


# ---------------------------------------------------------------------------
# History recording
# ---------------------------------------------------------------------------

class TestHistoryRecording:
    def test_history_records_each_iteration(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=3, llm_client=AlwaysCorrectLLMClient(), patience=10
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(optimizer.history) == 3

    def test_history_has_required_keys(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            assert "iteration" in record
            assert "best_accuracy" in record
            assert "beam_accuracies" in record
            assert "best_path" in record

    def test_history_iteration_numbers_are_sequential(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=4, llm_client=AlwaysCorrectLLMClient(), patience=10
        )
        optimizer.search(base_template, simple_validation_set)
        for i, record in enumerate(optimizer.history, start=1):
            assert record["iteration"] == i

    def test_history_reset_on_second_search(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        first_len = len(optimizer.history)
        optimizer.search(base_template, simple_validation_set)
        assert len(optimizer.history) == first_len

    def test_history_best_accuracy_is_float(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            assert isinstance(record["best_accuracy"], float)

    def test_history_best_path_is_string(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        optimizer.search(base_template, simple_validation_set)
        for record in optimizer.history:
            assert isinstance(record["best_path"], str)


# ---------------------------------------------------------------------------
# Early stopping
# ---------------------------------------------------------------------------

class TestEarlyStopping:
    def test_early_stopping_patience_one(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=10, llm_client=AlwaysWrongLLMClient(), patience=1
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(optimizer.history) < 10

    def test_early_stopping_patience_two(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=20, llm_client=AlwaysWrongLLMClient(), patience=2
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(optimizer.history) == 2

    def test_no_early_stop_when_improving(self):
        # add_cot inserts the trigger into the rendered prompt, making accuracy jump to 1.0
        trigger = "Think through this step-by-step:"
        client = KeywordMockLLMClient(trigger_keyword=trigger, answer_token="CORRECT")
        validation_set = [{"question": "Q1", "answer": "CORRECT"}]
        base = PromptTemplate(task_description="Solve.")
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=5, llm_client=client, patience=2
        )
        optimizer.search(base, validation_set)
        # iteration 1 improves (0.0 -> 1.0), then plateaus for patience=2 iterations
        assert len(optimizer.history) == 3

    def test_does_not_exceed_max_iterations(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=3, llm_client=AlwaysCorrectLLMClient(), patience=100
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(optimizer.history) <= 3


# ---------------------------------------------------------------------------
# Keyword mock LLM end-to-end
# ---------------------------------------------------------------------------

class TestKeywordMockLLM:
    def test_mock_returns_correct_on_trigger(self):
        client = KeywordMockLLMClient(trigger_keyword="step-by-step", answer_token="42")
        assert client.generate("Think step-by-step about this.") == "42"

    def test_mock_returns_wrong_without_trigger(self):
        client = KeywordMockLLMClient(trigger_keyword="step-by-step", answer_token="42")
        assert client.generate("What is the answer?") == "WRONG"

    def test_optimizer_finds_add_cot_as_best(self):
        trigger = "Think through this step-by-step:"
        client = KeywordMockLLMClient(trigger_keyword=trigger, answer_token="CORRECT")
        validation_set = [
            {"question": "Q1", "answer": "CORRECT"},
            {"question": "Q2", "answer": "CORRECT"},
        ]
        base = PromptTemplate(task_description="Solve problems.")
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=3, llm_client=client, patience=2
        )
        result = optimizer.search(base, validation_set)
        assert isinstance(result, PromptTemplate)
        assert "add_cot" in result.history
        assert optimizer.history[0]["best_accuracy"] == 1.0


# ---------------------------------------------------------------------------
# _default_match
# ---------------------------------------------------------------------------

class TestDefaultMatch:
    def test_substring_match(self):
        assert _default_match("The answer is 42 exactly.", "42") is True

    def test_case_insensitive(self):
        assert _default_match("The answer is YES.", "yes") is True

    def test_no_match(self):
        assert _default_match("The answer is 42.", "100") is False

    def test_full_string_match(self):
        assert _default_match("CORRECT", "CORRECT") is True


# ---------------------------------------------------------------------------
# Custom mutation_fns
# ---------------------------------------------------------------------------

class TestCustomMutationFns:
    def test_custom_mutation_fn_is_called(self, base_template, simple_validation_set):
        call_log = []

        def custom_mutation(template: PromptTemplate) -> PromptTemplate:
            t = copy.deepcopy(template)
            t.history.append("custom_op")
            call_log.append(True)
            return t

        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=1, llm_client=AlwaysCorrectLLMClient(),
            mutation_fns=[custom_mutation],
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(call_log) > 0

    def test_partial_parametric_mutation_works(self, base_template, simple_validation_set):
        bound = partial(PromptMutator.add_constraint, constraint="Be concise")
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=1, llm_client=AlwaysCorrectLLMClient(),
            mutation_fns=[bound],
        )
        result = optimizer.search(base_template, simple_validation_set)
        assert isinstance(result, PromptTemplate)


# ---------------------------------------------------------------------------
# Custom match_fn
# ---------------------------------------------------------------------------

class TestCustomMatchFn:
    def test_custom_match_fn_is_invoked(self, base_template, simple_validation_set):
        calls = []

        def exact_match(response: str, expected: str) -> bool:
            calls.append((response, expected))
            return response.strip() == expected.strip()

        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=1, llm_client=AlwaysCorrectLLMClient(),
            match_fn=exact_match,
        )
        optimizer.search(base_template, simple_validation_set)
        assert len(calls) > 0


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_validation_set_returns_template(self, base_template):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        result = optimizer.search(base_template, [])
        assert isinstance(result, PromptTemplate)

    def test_single_item_validation_set(self, base_template):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=2, llm_client=AlwaysCorrectLLMClient()
        )
        result = optimizer.search(base_template, [{"question": "Q", "answer": "CORRECT"}])
        assert isinstance(result, PromptTemplate)

    def test_max_iterations_zero_returns_template(self, base_template, simple_validation_set):
        optimizer = BeamSearchPromptOptimizer(
            beam_width=2, max_iterations=0, llm_client=AlwaysCorrectLLMClient()
        )
        result = optimizer.search(base_template, simple_validation_set)
        assert isinstance(result, PromptTemplate)
        assert len(optimizer.history) == 0
