import copy
import math
import random
from typing import Callable, Dict, List, Optional

from llm.base import BaseLLMClient
from prompts.mutations import PromptMutator
from prompts.template import PromptTemplate


def _default_match(response: str, expected: str) -> bool:
    return expected.strip().lower() in response.strip().lower()


class MCTSNode:
    """A single node in the MCTS tree representing one prompt template state."""

    def __init__(self, template: PromptTemplate, parent: Optional["MCTSNode"] = None):
        self.template = template
        self.parent = parent
        self.children: List["MCTSNode"] = []
        self.visits: int = 0
        self.total_reward: float = 0.0

    def ucb1_score(self, exploration_weight: float = 1.414) -> float:
        if self.visits == 0:
            return float("inf")
        exploitation = self.total_reward / self.visits
        # parent.visits is always > 0 here because an unvisited node is selected first
        exploration = exploration_weight * math.sqrt(math.log(self.parent.visits) / self.visits)
        return exploitation + exploration


class MCTSPromptSearch:
    """
    Searches the prompt mutation space using Monte Carlo Tree Search.

    Each iteration runs four phases: Selection (UCB1 tree traversal to a leaf),
    Expansion (attach one new child via a random mutation), Simulation (evaluate
    the child on the validation set to get a reward), Backpropagation (update
    visits and total_reward for all ancestors).

    After all iterations the child of root with the highest average reward is
    returned as the best prompt.

    Attributes
    ----------
    root : MCTSNode or None
        Set after the first call to search(); None before that.
    """

    def __init__(
        self,
        llm_client: BaseLLMClient,
        mutation_fns: Optional[List[Callable[[PromptTemplate], PromptTemplate]]] = None,
        match_fn: Optional[Callable[[str, str], bool]] = None,
        exploration_weight: float = 1.414,
        temperature: float = 0.0,
        max_tokens: int = 500,
    ) -> None:
        self.llm_client = llm_client
        self.mutation_fns: List[Callable[[PromptTemplate], PromptTemplate]] = (
            mutation_fns if mutation_fns is not None else PromptMutator.all_mutations()
        )
        self.match_fn: Callable[[str, str], bool] = match_fn or _default_match
        self.exploration_weight = exploration_weight
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.root: Optional[MCTSNode] = None
        self.history: List[Dict] = []

    def search(
        self,
        initial_prompt: PromptTemplate,
        validation_set: List[Dict],
        num_iterations: int = 100,
    ) -> PromptTemplate:
        """
        Run MCTS and return the best PromptTemplate found.

        Parameters
        ----------
        initial_prompt : PromptTemplate
            Root of the search tree.
        validation_set : list of {"question": str, "answer": str}
            Ground-truth pairs used to score each candidate.
        num_iterations : int
            Number of selection→expansion→simulation→backprop cycles.
        """
        self.root = MCTSNode(copy.deepcopy(initial_prompt))
        self.history = []

        for i in range(num_iterations):
            node = self._select(self.root)
            child = self._expand(node)
            reward = self._simulate(child, validation_set)
            self._backpropagate(child, reward)

            best_avg = max(
                (c.total_reward / c.visits for c in self.root.children if c.visits > 0),
                default=0.0,
            )
            self.history.append({"iteration": i + 1, "best_avg_reward": best_avg})

        if not self.root.children:
            return self.root.template

        best = max(
            self.root.children,
            key=lambda c: c.total_reward / c.visits if c.visits > 0 else 0.0,
        )
        return best.template

    def _select(self, node: MCTSNode) -> MCTSNode:
        """Traverse the tree via UCB1 until a leaf node is reached."""
        while node.children:
            node = max(node.children, key=lambda c: c.ucb1_score(self.exploration_weight))
        return node

    def _expand(self, node: MCTSNode) -> MCTSNode:
        """Add one new child to node using a randomly chosen mutation."""
        fn = random.choice(self.mutation_fns)
        child = MCTSNode(fn(node.template), parent=node)
        node.children.append(child)
        return child

    def _simulate(self, node: MCTSNode, validation_set: List[Dict]) -> float:
        """Evaluate the node's template against the validation set; returns accuracy in [0, 1]."""
        if not validation_set:
            return 0.0
        correct = 0
        for item in validation_set:
            rendered = node.template.render(item["question"])
            response = self.llm_client.generate(
                rendered,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            if self.match_fn(response, item["answer"]):
                correct += 1
        return correct / len(validation_set)

    def _backpropagate(self, node: MCTSNode, reward: float) -> None:
        """Walk up the tree from node to root, updating visits and total_reward."""
        current = node
        while current is not None:
            current.visits += 1
            current.total_reward += reward
            current = current.parent
