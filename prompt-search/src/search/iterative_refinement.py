import copy
import random
from typing import Callable, Dict, List, Optional, Tuple

from llm.base import BaseLLMClient
from prompts.mutations import PromptMutator
from prompts.template import PromptTemplate


def _default_match(response: str, expected: str) -> bool:
    return expected.strip().lower() in response.strip().lower()


# Ordered keyword → mutation mapping used to parse LLM critiques.
# Earlier entries take priority when multiple keywords appear.
_CRITIQUE_KEYWORD_MAP = [
    ("add_cot",              PromptMutator.add_cot),
    ("remove_cot",           PromptMutator.remove_cot),
    ("add_verification",     PromptMutator.add_verification_step),
    ("add_self_consistency", PromptMutator.add_self_consistency),
    ("add_domain",           lambda t: PromptMutator.add_domain_context(t, "course_planning")),
    ("add_expert",           lambda t: PromptMutator.add_expert_persona(t, "a WSU academic advisor")),
]

_CRITIQUE_SAMPLE_QUESTION = "What courses should I take next semester to stay on track for graduation?"


class IterativeRefinementOptimizer:
    """
    Iteratively improves a prompt by asking the LLM to critique it and
    applying the best-matching static mutation.

    Each round:
    1. Evaluate the current prompt on the validation set.
    2. If accuracy is below accuracy_threshold, ask the LLM to critique
       the prompt and suggest one named mutation.
    3. Apply that mutation (or a random fallback if no keyword matches).
    4. Stop when accuracy has not improved for patience consecutive rounds
       or when max_rounds is reached.

    Attributes
    ----------
    history : list of dict
        One entry per completed round:
        {"round": int, "accuracy": float,
         "mutation_applied": str, "critique": str}
    """

    def __init__(
        self,
        llm_client: BaseLLMClient,
        max_rounds: int = 5,
        patience: int = 2,
        accuracy_threshold: float = 1.0,
        min_delta: float = 0.0,
        mutation_fns: Optional[List[Callable[[PromptTemplate], PromptTemplate]]] = None,
        match_fn: Optional[Callable[[str, str], bool]] = None,
        temperature: float = 0.0,
        max_tokens: int = 500,
        critique_max_tokens: int = 200,
    ) -> None:
        self.llm_client = llm_client
        self.max_rounds = max_rounds
        self.patience = patience
        self.accuracy_threshold = accuracy_threshold
        self.min_delta = min_delta
        self.mutation_fns: List[Callable[[PromptTemplate], PromptTemplate]] = (
            mutation_fns if mutation_fns is not None else PromptMutator.all_mutations()
        )
        self.match_fn: Callable[[str, str], bool] = match_fn or _default_match
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.critique_max_tokens = critique_max_tokens
        self.history: List[Dict] = []

    def refine(
        self,
        initial_prompt: PromptTemplate,
        validation_set: List[Dict],
    ) -> PromptTemplate:
        """
        Run iterative refinement and return the best PromptTemplate found.

        Parameters
        ----------
        initial_prompt : PromptTemplate
            Starting point for refinement.
        validation_set : list of {"question": str, "answer": str}
            Ground-truth pairs used to score each candidate.
        """
        self.history = []
        prompt = copy.deepcopy(initial_prompt)
        best_accuracy = -1.0
        best_prompt = copy.deepcopy(prompt)
        no_improvement_count = 0

        for round_num in range(1, self.max_rounds + 1):
            accuracy = self._evaluate(prompt, validation_set)

            # Track best
            if accuracy > best_accuracy + self.min_delta:
                best_accuracy = accuracy
                best_prompt = copy.deepcopy(prompt)
                no_improvement_count = 0
            else:
                no_improvement_count += 1

            # Critique and mutate if still below target
            if accuracy < self.accuracy_threshold:
                critique = self._get_critique(prompt, accuracy)
                prompt, mutation_name = self._apply_mutation_from_critique(prompt, critique)
            else:
                critique = ""
                mutation_name = "none"

            self.history.append({
                "round": round_num,
                "accuracy": accuracy,
                "mutation_applied": mutation_name,
                "critique": critique,
            })

            if no_improvement_count >= self.patience:
                break

        return best_prompt

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _evaluate(self, template: PromptTemplate, validation_set: List[Dict]) -> float:
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

    def _get_critique(self, template: PromptTemplate, accuracy: float) -> str:
        """Ask the LLM to critique the template and name one improvement."""
        sample = template.render(_CRITIQUE_SAMPLE_QUESTION)
        critique_prompt = (
            f"This prompt template achieved {accuracy:.0%} accuracy on a WSU course advising task.\n\n"
            f"Prompt:\n{sample}\n\n"
            "Suggest exactly one improvement from this list:\n"
            "- add_cot: add chain-of-thought reasoning\n"
            "- remove_cot: remove chain-of-thought (if over-complicated)\n"
            "- add_verification: add a verification step\n"
            "- add_self_consistency: add self-consistency instruction\n"
            "- add_domain_context: add WSU academic advisor domain context\n"
            "- add_expert_persona: add an expert persona\n\n"
            "Reply with the improvement name followed by a brief reason."
        )
        return self.llm_client.generate(
            critique_prompt,
            temperature=self.temperature,
            max_tokens=self.critique_max_tokens,
        )

    def _apply_mutation_from_critique(
        self,
        template: PromptTemplate,
        critique: str,
    ) -> Tuple[PromptTemplate, str]:
        """Map critique text to a static mutation via keyword scanning."""
        lower = critique.lower()
        for keyword, fn in _CRITIQUE_KEYWORD_MAP:
            if keyword in lower:
                return fn(template), keyword
        # Fallback: random mutation from the configured set
        fn = random.choice(self.mutation_fns)
        mutated = fn(template)
        name = mutated.history[-1] if mutated.history else "random"
        return mutated, name
