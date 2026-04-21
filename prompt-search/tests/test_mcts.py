import math
from typing import Dict, List

import pytest

from src.llm.base import BaseLLMClient
from src.prompts.mutations import PromptMutator
from src.prompts.template import PromptTemplate
from src.search.mcts import MCTSNode, MCTSPromptSearch


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

    def generate(self, prompt: str, temperature: float = 0.7, max_tokens: int = 500) -> str:
        return self.answer_token if self.trigger_keyword in prompt else self.wrong_token

    def get_usage_stats(self) -> Dict:
        return {}


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def base_template() -> PromptTemplate:
    return PromptTemplate(task_description="Solve these problems.")


@pytest.fixture
def validation_set() -> List[Dict]:
    return [
        {"question": "What is 2+2?", "answer": "CORRECT"},
        {"question": "What is 3+3?", "answer": "CORRECT"},
    ]


# ---------------------------------------------------------------------------
# TestUCB1Score
# ---------------------------------------------------------------------------

class TestUCB1Score:
    def test_unvisited_returns_infinity(self):
        parent = MCTSNode(PromptTemplate())
        parent.visits = 5
        child = MCTSNode(PromptTemplate(), parent=parent)
        assert child.ucb1_score() == float("inf")

    def test_formula_for_visited_node(self):
        parent = MCTSNode(PromptTemplate())
        parent.visits = 10
        child = MCTSNode(PromptTemplate(), parent=parent)
        child.visits = 4
        child.total_reward = 2.0
        exploitation = 2.0 / 4
        exploration = 1.414 * math.sqrt(math.log(10) / 4)
        assert abs(child.ucb1_score() - (exploitation + exploration)) < 1e-9

    def test_custom_exploration_weight(self):
        parent = MCTSNode(PromptTemplate())
        parent.visits = 4
        child = MCTSNode(PromptTemplate(), parent=parent)
        child.visits = 2
        child.total_reward = 1.0
        assert child.ucb1_score(exploration_weight=5.0) > child.ucb1_score(exploration_weight=1.414)


# ---------------------------------------------------------------------------
# TestSearchReturnType
# ---------------------------------------------------------------------------

class TestSearchReturnType:
    def test_returns_prompt_template(self, base_template, validation_set):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        result = optimizer.search(base_template, validation_set, num_iterations=4)
        assert isinstance(result, PromptTemplate)

    def test_zero_iterations_returns_root_template(self, base_template, validation_set):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        result = optimizer.search(base_template, validation_set, num_iterations=0)
        assert isinstance(result, PromptTemplate)
        # With 0 iterations root has no children so root.template is returned
        assert result.mutation_path() == "base"


# ---------------------------------------------------------------------------
# TestBackpropagation
# ---------------------------------------------------------------------------

class TestBackpropagation:
    def test_updates_all_ancestors(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        optimizer.root = MCTSNode(base_template)
        child = MCTSNode(PromptMutator.add_cot(base_template), parent=optimizer.root)
        optimizer.root.children.append(child)

        optimizer._backpropagate(child, reward=1.0)

        assert child.visits == 1
        assert child.total_reward == 1.0
        assert optimizer.root.visits == 1
        assert optimizer.root.total_reward == 1.0

    def test_accumulates_over_multiple_calls(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        optimizer.root = MCTSNode(base_template)
        child = MCTSNode(PromptMutator.add_cot(base_template), parent=optimizer.root)
        optimizer.root.children.append(child)

        optimizer._backpropagate(child, reward=0.5)
        optimizer._backpropagate(child, reward=0.5)

        assert child.visits == 2
        assert abs(child.total_reward - 1.0) < 1e-9

    def test_deep_chain_all_ancestors_updated(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        root = MCTSNode(base_template)
        child = MCTSNode(PromptMutator.add_cot(base_template), parent=root)
        grandchild = MCTSNode(PromptMutator.add_verification_step(child.template), parent=child)
        root.children.append(child)
        child.children.append(grandchild)
        optimizer.root = root

        optimizer._backpropagate(grandchild, reward=0.8)

        assert grandchild.visits == 1
        assert child.visits == 1
        assert root.visits == 1
        assert abs(root.total_reward - 0.8) < 1e-9


# ---------------------------------------------------------------------------
# TestSelection
# ---------------------------------------------------------------------------

class TestSelection:
    def test_selects_unvisited_child_first(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        root = MCTSNode(base_template)
        root.visits = 5

        visited = MCTSNode(PromptMutator.add_cot(base_template), parent=root)
        visited.visits = 5
        visited.total_reward = 4.0

        unvisited = MCTSNode(PromptMutator.remove_cot(base_template), parent=root)
        # visits=0 → ucb1 = inf

        root.children = [visited, unvisited]
        selected = optimizer._select(root)
        assert selected is unvisited

    def test_selects_highest_ucb1_among_visited(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        root = MCTSNode(base_template)
        root.visits = 10

        low = MCTSNode(PromptMutator.add_cot(base_template), parent=root)
        low.visits = 8
        low.total_reward = 2.0

        high = MCTSNode(PromptMutator.add_verification_step(base_template), parent=root)
        high.visits = 2
        high.total_reward = 1.8  # higher UCB1 due to fewer visits

        root.children = [low, high]
        selected = optimizer._select(root)
        assert selected is high

    def test_returns_leaf_when_no_children(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        root = MCTSNode(base_template)
        assert optimizer._select(root) is root


# ---------------------------------------------------------------------------
# TestKeywordMockLLM
# ---------------------------------------------------------------------------

class TestKeywordMockLLM:
    def test_finds_cot_as_best_mutation(self, base_template):
        # add_cot inserts "step-by-step" into the rendered prompt
        # the keyword mock only returns "CORRECT" when that phrase is present
        llm = KeywordMockLLMClient(
            trigger_keyword="step-by-step",
            answer_token="CORRECT",
        )
        optimizer = MCTSPromptSearch(
            llm_client=llm,
            mutation_fns=[PromptMutator.add_cot],
        )
        val = [
            {"question": "q1", "answer": "CORRECT"},
            {"question": "q2", "answer": "CORRECT"},
        ]
        result = optimizer.search(base_template, val, num_iterations=6)
        assert isinstance(result, PromptTemplate)
        assert "add_cot" in result.mutation_path()

    def test_wrong_llm_still_returns_template(self, base_template, validation_set):
        optimizer = MCTSPromptSearch(llm_client=AlwaysWrongLLMClient())
        result = optimizer.search(base_template, validation_set, num_iterations=4)
        assert isinstance(result, PromptTemplate)


# ---------------------------------------------------------------------------
# TestEdgeCases
# ---------------------------------------------------------------------------

class TestEdgeCases:
    def test_empty_validation_set(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        result = optimizer.search(base_template, [], num_iterations=3)
        assert isinstance(result, PromptTemplate)

    def test_single_item_validation_set(self, base_template):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        result = optimizer.search(
            base_template,
            [{"question": "q", "answer": "CORRECT"}],
            num_iterations=3,
        )
        assert isinstance(result, PromptTemplate)

    def test_root_set_after_search(self, base_template, validation_set):
        optimizer = MCTSPromptSearch(llm_client=AlwaysCorrectLLMClient())
        assert optimizer.root is None
        optimizer.search(base_template, validation_set, num_iterations=2)
        assert optimizer.root is not None
        assert isinstance(optimizer.root, MCTSNode)
