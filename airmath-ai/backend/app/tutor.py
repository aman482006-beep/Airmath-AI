import random


def explain(question: str, context: str = "", solved_expression: str = "") -> str:
    q = question.lower().strip()
    context_line = f"For your current work, I am looking at: {solved_expression or context}." if (solved_expression or context) else ""

    if "why" in q:
        return "\n".join(
            part
            for part in [
                context_line,
                "The key idea is that each step preserves the value or truth of the original expression.",
                "When we simplify, differentiate, integrate, or isolate a variable, we use rules that produce an equivalent statement. That is why the final answer still belongs to the original problem.",
            ]
            if part
        )

    if "another" in q or "method" in q:
        return "\n".join(
            part
            for part in [
                context_line,
                "Another method is to rewrite the problem into a simpler structure first: collect like terms, identify the main operation, then solve from the outside inward.",
                "For equations, graphing both sides or substituting the answer back in is a strong second check.",
            ]
            if part
        )

    if "harder" in q:
        variants = [
            "Add one extra variable and ask for a system solution.",
            "Turn the expression into an equation with a parameter.",
            "Add a fraction, exponent, or trig identity so you must simplify before solving.",
        ]
        return f"{context_line}\nHarder version: {random.choice(variants)}".strip()

    if "practice" in q or "similar" in q or "5" in q:
        return "\n".join(
            [
                "Try these five related practice prompts:",
                "1. Solve a same-shape equation with different constants.",
                "2. Simplify a fraction version of the expression.",
                "3. Add an exponent and simplify before solving.",
                "4. Create a two-equation system using the same variables.",
                "5. Verify a proposed answer by substitution.",
            ]
        )

    return "\n".join(
        part
        for part in [
            context_line,
            "I would approach it like a tutor: identify the math type, name the rule being used, perform one small transformation, then check whether the result still matches the original problem.",
        ]
        if part
    )
