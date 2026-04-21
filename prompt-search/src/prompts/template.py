from dataclasses import dataclass, field
from typing import List


@dataclass
class PromptTemplate:
    system_role: str = ""
    task_description: str = ""
    cot_trigger: str = ""
    verification_step: str = ""
    self_consistency_instruction: str = ""
    examples: List[str] = field(default_factory=list)
    constraints: List[str] = field(default_factory=list)
    output_format: str = ""
    history: List[str] = field(default_factory=list)

    def render(self, problem: str) -> str:
        parts = []

        if self.system_role:
            parts.append(f"You are {self.system_role}.")

        if self.task_description:
            parts.append(self.task_description)

        for example in self.examples:
            parts.append(f"Example:\n{example}")

        if self.constraints:
            parts.append("Constraints: " + ", ".join(self.constraints))

        if self.cot_trigger:
            parts.append(self.cot_trigger)

        if self.self_consistency_instruction:
            parts.append(self.self_consistency_instruction)

        parts.append(f"Problem: {problem}")

        if self.output_format:
            parts.append(f"Format your response as: {self.output_format}")

        if self.verification_step:
            parts.append(self.verification_step)

        return "\n\n".join(parts)

    def mutation_path(self) -> str:
        return " -> ".join(self.history) if self.history else "base"
