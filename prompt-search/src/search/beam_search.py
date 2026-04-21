import copy
from typing import Callable, Dict, List, Optional

from llm.base import BaseLLMClient
from prompts.mutations import PromptMutator
from prompts.template import PromptTemplate


def _default_match(response: str, expected: str) -> bool:
    """Case-insensitive substring containment check."""
    return expected.strip().lower() in response.strip().lower()


class BeamSearchPromptOptimizer:
    """
    Searches the prompt mutation space using beam search.

    At each iteration every beam candidate is expanded by applying all
    mutation_fns, candidates are deduplicated by mutation_path(), scored
    against the validation set, and pruned to beam_width. Search stops
    when accuracy has not improved by more than min_delta for patience
    consecutive iterations, or when max_iterations is reached.

    Attributes
    ----------
    history : list of dict
        One entry per completed iteration:
        {"iteration": int, "best_accuracy": float,
         "beam_accuracies": list, "best_path": str}
    """

    def __init__(
        self,
        beam_width: int,
        max_iterations: int,
        llm_client: BaseLLMClient,
        mutator: Optional[PromptMutator] = None,
        mutation_fns: Optional[List[Callable[[PromptTemplate], PromptTemplate]]] = None,
        match_fn: Optional[Callable[[str, str], bool]] = None,
        patience: int = 2,
        min_delta: float = 0.0,
        temperature: float = 0.0,
        max_tokens: int = 500,
    ) -> None:
        self.beam_width = beam_width
        self.max_iterations = max_iterations
        self.llm_client = llm_client
        self.mutator = mutator
        self.mutation_fns: List[Callable[[PromptTemplate], PromptTemplate]] = (
            mutation_fns if mutation_fns is not None else PromptMutator.all_mutations()
        )
        self.match_fn: Callable[[str, str], bool] = match_fn or _default_match
        self.patience = patience
        self.min_delta = min_delta
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.history: List[Dict] = []

    def search(
        self,
        initial_prompt: PromptTemplate,
        validation_set: List[Dict],
    ) -> PromptTemplate:
        """
        Run beam search and return the best PromptTemplate found.

        Parameters
        ----------
        initial_prompt : PromptTemplate
            Seed of the beam.
        validation_set : list of {"question": str, "answer": str}
            Ground-truth pairs used to score each candidate.
        """
        self.history = []

        initial_accuracy = self._evaluate(initial_prompt, validation_set)
        beam: List[tuple] = [(initial_accuracy, initial_prompt)]

        best_accuracy = initial_accuracy
        best_template = copy.deepcopy(initial_prompt)
        no_improvement_count = 0

        for iteration in range(1, self.max_iterations + 1):
            candidates: List[tuple] = []
            seen_paths = set()

            for _, template in beam:
                for fn in self.mutation_fns:
                    mutated = fn(template)
                    path = mutated.mutation_path()
                    if path in seen_paths:
                        continue
                    seen_paths.add(path)
                    acc = self._evaluate(mutated, validation_set)
                    candidates.append((acc, mutated))

            candidates.sort(key=lambda t: t[0], reverse=True)
            beam = candidates[: self.beam_width]

            beam_accuracies = [acc for acc, _ in beam]
            iteration_best_acc = beam_accuracies[0] if beam_accuracies else 0.0
            iteration_best_path = beam[0][1].mutation_path() if beam else ""

            self.history.append(
                {
                    "iteration": iteration,
                    "best_accuracy": iteration_best_acc,
                    "beam_accuracies": beam_accuracies,
                    "best_path": iteration_best_path,
                }
            )

            if iteration_best_acc > best_accuracy + self.min_delta:
                best_accuracy = iteration_best_acc
                best_template = copy.deepcopy(beam[0][1])
                no_improvement_count = 0
            else:
                no_improvement_count += 1

            if no_improvement_count >= self.patience:
                break

        return best_template

    def _evaluate(
        self,
        template: PromptTemplate,
        validation_set: List[Dict],
    ) -> float:
        """Score a template against the validation set; returns accuracy in [0, 1]."""
        if not validation_set:
            return 0.0

        correct = 0
        for item in validation_set:
            rendered = template.render(item["question"])
            response = self.llm_client.generate(
                rendered,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )
            if self.match_fn(response, item["answer"]):
                correct += 1

        return correct / len(validation_set)
