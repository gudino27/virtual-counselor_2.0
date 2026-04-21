from typing import Dict, List

import pytest

from src.llm.base import BaseLLMClient
from src.prompts.mutations import PromptMutator
from src.prompts.template import PromptTemplate
from src.search.iterative_refinement import (
    IterativeRefinementOptimizer,
    _CRITIQUE_SAMPLE_QUESTION,
)


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


class CritiqueMockLLMClient(BaseLLMClient):
    """
    Returns critique_response when the prompt looks like a critique request
    (contains the sample question used in _get_critique), otherwise returns
    eval_response for normal evaluation prompts.
    """

    def __init__(self, critique_response: str = "add_cot", eval_response: str = "WRONG"):
        self.critique_response = critique_response
        self.eval_response = eval_response
        self.critique_calls = 0
        self.eval_calls = 0

    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        if _CRITIQUE_SAMPLE_QUESTION in prompt:
            self.critique_calls += 1
            return self.critique_response
        self.eval_calls += 1
        return self.eval_response

    def get_usage_stats(self) -> Dict:
        return {"critique_calls": self.critique_calls, "eval_calls": self.eval_calls}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_template() -> PromptTemplate:
    return PromptTemplate(task_description="Answer this WSU advising question.")


@pytest.fixture
def validation_set() -> List[Dict]:
    return [
        {"question": "Can I take CPTS 360 after CPTS 223?", "answer": "CORRECT"},
        {"question": "Is MATH 171 required for CS?", "answer": "CORRECT"},
    ]


# ---------------------------------------------------------------------------
# TestReturnType
# ---------------------------------------------------------------------------

class TestReturnType:
    def test_returns_prompt_template(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(), max_rounds=2
        )
        result = optimizer.refine(base_template, validation_set)
        assert isinstance(result, PromptTemplate)

    def test_does_not_mutate_original(self, base_template, validation_set):
        original_path = base_template.mutation_path()
        optimizer = IterativeRefinementOptimizer(
            llm_client=CritiqueMockLLMClient(), max_rounds=2
        )
        optimizer.refine(base_template, validation_set)
        assert base_template.mutation_path() == original_path


# ---------------------------------------------------------------------------
# TestStoppingConditions
# ---------------------------------------------------------------------------

class TestStoppingConditions:
    def test_stops_after_max_rounds(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysWrongLLMClient(),
            max_rounds=3,
            patience=100,
            accuracy_threshold=1.0,
        )
        optimizer.refine(base_template, validation_set)
        assert len(optimizer.history) == 3

    def test_stops_early_on_patience_plateau(self, base_template, validation_set):
        # AlwaysCorrect → accuracy=1.0 every round, never improves after round 1
        # patience=2 means stop after 2 rounds of no improvement → 3 rounds total
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(),
            max_rounds=10,
            patience=2,
            accuracy_threshold=0.5,  # already above threshold, no critique needed
        )
        optimizer.refine(base_template, validation_set)
        assert len(optimizer.history) < 10
        assert len(optimizer.history) == 3

    def test_patience_one_stops_quickly(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(),
            max_rounds=10,
            patience=1,
            accuracy_threshold=0.5,
        )
        optimizer.refine(base_template, validation_set)
        # Round 1 improves (from -1 to 1.0), round 2 no improvement → stop
        assert len(optimizer.history) == 2


# ---------------------------------------------------------------------------
# TestRefinementTrace
# ---------------------------------------------------------------------------

class TestRefinementTrace:
    def test_trace_has_one_entry_per_round(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysWrongLLMClient(),
            max_rounds=4,
            patience=100,
        )
        optimizer.refine(base_template, validation_set)
        assert len(optimizer.history) == 4

    def test_trace_entry_keys(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=CritiqueMockLLMClient(), max_rounds=2
        )
        optimizer.refine(base_template, validation_set)
        for entry in optimizer.history:
            assert "round" in entry
            assert "accuracy" in entry
            assert "mutation_applied" in entry
            assert "critique" in entry

    def test_trace_round_numbers_sequential(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysWrongLLMClient(),
            max_rounds=4,
            patience=100,
        )
        optimizer.refine(base_template, validation_set)
        rounds = [e["round"] for e in optimizer.history]
        assert rounds == list(range(1, len(rounds) + 1))

    def test_no_critique_when_above_threshold(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(),
            max_rounds=3,
            patience=100,
            accuracy_threshold=0.5,
        )
        optimizer.refine(base_template, validation_set)
        for entry in optimizer.history:
            assert entry["mutation_applied"] == "none"
            assert entry["critique"] == ""

    def test_history_cleared_on_second_call(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysWrongLLMClient(), max_rounds=3, patience=100
        )
        optimizer.refine(base_template, validation_set)
        optimizer.refine(base_template, validation_set)
        assert len(optimizer.history) == 3


# ---------------------------------------------------------------------------
# TestCritiqueMockLLM
# ---------------------------------------------------------------------------

class TestCritiqueMockLLM:
    def test_applies_add_cot_from_critique(self, base_template, validation_set):
        llm = CritiqueMockLLMClient(critique_response="add_cot", eval_response="WRONG")
        optimizer = IterativeRefinementOptimizer(
            llm_client=llm, max_rounds=2, patience=100, accuracy_threshold=1.0
        )
        result = optimizer.refine(base_template, validation_set)
        assert isinstance(result, PromptTemplate)
        mutations = [e["mutation_applied"] for e in optimizer.history]
        assert "add_cot" in mutations

    def test_critique_calls_separated_from_eval_calls(self, base_template, validation_set):
        llm = CritiqueMockLLMClient(critique_response="add_verification", eval_response="WRONG")
        optimizer = IterativeRefinementOptimizer(
            llm_client=llm, max_rounds=3, patience=100, accuracy_threshold=1.0
        )
        optimizer.refine(base_template, validation_set)
        assert llm.critique_calls > 0
        assert llm.eval_calls > 0

    def test_unknown_critique_falls_back_to_random(self, base_template, validation_set):
        llm = CritiqueMockLLMClient(
            critique_response="completely unrecognised suggestion XYZ",
            eval_response="WRONG",
        )
        optimizer = IterativeRefinementOptimizer(
            llm_client=llm, max_rounds=2, patience=100, accuracy_threshold=1.0
        )
        result = optimizer.refine(base_template, validation_set)
        assert isinstance(result, PromptTemplate)


# ---------------------------------------------------------------------------
# TestEdgeCases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_validation_set(self, base_template):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(), max_rounds=2
        )
        result = optimizer.refine(base_template, [])
        assert isinstance(result, PromptTemplate)

    def test_single_round(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysCorrectLLMClient(), max_rounds=1, patience=10
        )
        optimizer.refine(base_template, validation_set)
        assert len(optimizer.history) == 1

    def test_accuracy_values_in_range(self, base_template, validation_set):
        optimizer = IterativeRefinementOptimizer(
            llm_client=AlwaysWrongLLMClient(), max_rounds=3, patience=100
        )
        optimizer.refine(base_template, validation_set)
        for entry in optimizer.history:
            assert 0.0 <= entry["accuracy"] <= 1.0
