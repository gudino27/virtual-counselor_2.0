import copy

from .template import PromptTemplate

_DOMAIN_CONFIGS = {
    "course_planning": {
        "system_role": "an academic advisor at Washington State University",
        "constraints": [
            "Use WSU course codes (e.g., CPTS 121, MATH 171)",
            "Verify prerequisites before recommending courses",
        ],
    },
    "math_reasoning": {
        "system_role": "a mathematics tutor who specializes in step-by-step problem solving",
        "constraints": [
            "Show all intermediate steps",
            "State any formulas used before applying them",
        ],
    },
}


class PromptMutator:
    @staticmethod
    def add_cot(template: PromptTemplate) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.cot_trigger = "Think through this step-by-step:"
        mutated.history.append("add_cot")
        return mutated

    @staticmethod
    def remove_cot(template: PromptTemplate) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.cot_trigger = ""
        mutated.history.append("remove_cot")
        return mutated

    @staticmethod
    def add_domain_context(template: PromptTemplate, domain: str) -> PromptTemplate:
        config = _DOMAIN_CONFIGS.get(domain)
        if not config:
            raise ValueError(f"Unknown domain: {domain}. Available: {list(_DOMAIN_CONFIGS)}")
        mutated = copy.deepcopy(template)
        mutated.system_role = config["system_role"]
        for constraint in config["constraints"]:
            if constraint not in mutated.constraints:
                mutated.constraints.append(constraint)
        mutated.history.append(f"add_domain:{domain}")
        return mutated

    @staticmethod
    def add_example(template: PromptTemplate, example: str) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.examples.append(example)
        mutated.history.append("add_example")
        return mutated

    @staticmethod
    def set_output_format(template: PromptTemplate, fmt: str) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.output_format = fmt
        mutated.history.append(f"set_output_format:{fmt[:20]}")
        return mutated

    @staticmethod
    def add_constraint(template: PromptTemplate, constraint: str) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        if constraint not in mutated.constraints:
            mutated.constraints.append(constraint)
        mutated.history.append("add_constraint")
        return mutated

    @staticmethod
    def rephrase_task(template: PromptTemplate, new_description: str) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.task_description = new_description
        mutated.history.append("rephrase_task")
        return mutated

    @staticmethod
    def add_verification_step(template: PromptTemplate) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.verification_step = (
            "Before finalizing your answer, verify it by checking each step for errors."
        )
        mutated.history.append("add_verification_step")
        return mutated

    @staticmethod
    def add_self_consistency(template: PromptTemplate) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.self_consistency_instruction = (
            "Generate 3 independent solutions to this problem, "
            "then select the answer that appears most consistently across all 3."
        )
        mutated.history.append("add_self_consistency")
        return mutated

    @staticmethod
    def add_expert_persona(template: PromptTemplate, role: str) -> PromptTemplate:
        mutated = copy.deepcopy(template)
        mutated.system_role = role
        mutated.history.append(f"add_expert_persona:{role[:20]}")
        return mutated

    @classmethod
    def all_mutations(cls) -> list:
        return [
            cls.add_cot,
            cls.remove_cot,
            cls.add_verification_step,
            cls.add_self_consistency,
        ]
