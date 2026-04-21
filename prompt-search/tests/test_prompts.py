import pytest

from src.prompts.mutations import PromptMutator
from src.prompts.template import PromptTemplate


class TestPromptTemplate:
    def test_render_minimal(self):
        t = PromptTemplate(task_description="Solve the problem.")
        rendered = t.render("What is 2+2?")
        assert "Solve the problem." in rendered
        assert "What is 2+2?" in rendered

    def test_render_with_system_role(self):
        t = PromptTemplate(system_role="an expert mathematician")
        rendered = t.render("problem")
        assert "You are an expert mathematician." in rendered

    def test_render_with_cot(self):
        t = PromptTemplate(cot_trigger="Think through this step-by-step:")
        rendered = t.render("problem")
        assert "Think through this step-by-step:" in rendered

    def test_render_with_examples(self):
        t = PromptTemplate(examples=["Q: 1+1? A: 2", "Q: 2+2? A: 4"])
        rendered = t.render("problem")
        assert "Q: 1+1? A: 2" in rendered
        assert "Q: 2+2? A: 4" in rendered

    def test_render_with_constraints(self):
        t = PromptTemplate(constraints=["Be concise", "Use plain English"])
        rendered = t.render("problem")
        assert "Be concise" in rendered

    def test_render_with_output_format(self):
        t = PromptTemplate(output_format="JSON with keys: answer, confidence")
        rendered = t.render("problem")
        assert "JSON" in rendered

    def test_render_with_verification_step(self):
        t = PromptTemplate(verification_step="Verify your answer.")
        rendered = t.render("problem")
        assert "Verify your answer." in rendered

    def test_mutation_path_empty(self):
        t = PromptTemplate()
        assert t.mutation_path() == "base"

    def test_mutation_path_with_history(self):
        t = PromptTemplate(history=["add_cot", "add_example"])
        assert t.mutation_path() == "add_cot -> add_example"


class TestPromptMutator:
    def setup_method(self):
        self.base = PromptTemplate(task_description="Solve math problems.")

    def test_add_cot_sets_trigger(self):
        mutated = PromptMutator.add_cot(self.base)
        assert mutated.cot_trigger != ""
        assert "add_cot" in mutated.history

    def test_add_cot_does_not_mutate_original(self):
        PromptMutator.add_cot(self.base)
        assert self.base.cot_trigger == ""
        assert len(self.base.history) == 0

    def test_remove_cot_clears_trigger(self):
        with_cot = PromptMutator.add_cot(self.base)
        without_cot = PromptMutator.remove_cot(with_cot)
        assert without_cot.cot_trigger == ""
        assert "remove_cot" in without_cot.history

    def test_add_domain_context_course_planning(self):
        mutated = PromptMutator.add_domain_context(self.base, "course_planning")
        assert "Washington State University" in mutated.system_role
        assert len(mutated.constraints) > 0
        assert any("add_domain" in h for h in mutated.history)

    def test_add_domain_context_invalid_raises(self):
        with pytest.raises(ValueError):
            PromptMutator.add_domain_context(self.base, "nonexistent_domain")

    def test_add_example(self):
        mutated = PromptMutator.add_example(self.base, "Q: 1+1? A: 2")
        assert "Q: 1+1? A: 2" in mutated.examples
        assert "add_example" in mutated.history

    def test_add_example_accumulates(self):
        m1 = PromptMutator.add_example(self.base, "Example 1")
        m2 = PromptMutator.add_example(m1, "Example 2")
        assert len(m2.examples) == 2

    def test_set_output_format(self):
        mutated = PromptMutator.set_output_format(self.base, "plain text")
        assert mutated.output_format == "plain text"

    def test_add_constraint(self):
        mutated = PromptMutator.add_constraint(self.base, "Be brief")
        assert "Be brief" in mutated.constraints

    def test_add_constraint_no_duplicates(self):
        m1 = PromptMutator.add_constraint(self.base, "Be brief")
        m2 = PromptMutator.add_constraint(m1, "Be brief")
        assert m2.constraints.count("Be brief") == 1

    def test_rephrase_task(self):
        mutated = PromptMutator.rephrase_task(self.base, "Answer these questions.")
        assert mutated.task_description == "Answer these questions."
        assert "rephrase_task" in mutated.history

    def test_add_verification_step(self):
        mutated = PromptMutator.add_verification_step(self.base)
        assert mutated.verification_step != ""
        assert "add_verification_step" in mutated.history

    def test_add_self_consistency(self):
        mutated = PromptMutator.add_self_consistency(self.base)
        assert "3" in mutated.self_consistency_instruction
        assert "add_self_consistency" in mutated.history

    def test_add_expert_persona(self):
        mutated = PromptMutator.add_expert_persona(self.base, "a software engineer")
        assert mutated.system_role == "a software engineer"
        assert any("add_expert_persona" in h for h in mutated.history)

    def test_chain_of_mutations_history(self):
        result = PromptMutator.add_cot(self.base)
        result = PromptMutator.add_verification_step(result)
        result = PromptMutator.add_domain_context(result, "course_planning")
        assert len(result.history) == 3

    def test_all_mutations_returns_list(self):
        mutations = PromptMutator.all_mutations()
        assert len(mutations) >= 4
        for fn in mutations:
            mutated = fn(self.base)
            assert isinstance(mutated, PromptTemplate)
