import re
from dataclasses import dataclass

import sympy as sp
from sympy.parsing.latex import parse_latex
from sympy.parsing.sympy_parser import (
    convert_xor,
    implicit_multiplication_application,
    parse_expr,
    standard_transformations,
)


TRANSFORMATIONS = standard_transformations + (implicit_multiplication_application, convert_xor)
LOCAL_DICT = {
    "sin": sp.sin,
    "cos": sp.cos,
    "tan": sp.tan,
    "sec": sp.sec,
    "csc": sp.csc,
    "cot": sp.cot,
    "asin": sp.asin,
    "acos": sp.acos,
    "atan": sp.atan,
    "sqrt": sp.sqrt,
    "log": sp.log,
    "ln": sp.log,
    "exp": sp.exp,
    "pi": sp.pi,
    "e": sp.E,
    # Prevent SymPy namespace lookups from resolving to non-Basic objects (like classes, functions, registry)
    "O": sp.Symbol("O"),
    "S": sp.Symbol("S"),
    "N": sp.Symbol("N"),
    "Q": sp.Symbol("Q"),
}


@dataclass
class SolvedMath:
    normalized: str
    result: str
    steps: list[str]
    answer_text: str


def _latex_to_sympy(source: str):
    cleaned = source.strip()
    if not cleaned:
        raise ValueError("No math expression was recognized.")
    parsed = parse_latex(cleaned)
    if not isinstance(parsed, sp.Basic):
        raise ValueError(f"Parsed LaTeX object is not a SymPy expression: {type(parsed)}")
    return parsed


def _plain_to_sympy(source: str):
    cleaned = source.strip()
    # 1. Strip garbage characters and OCR noise (keep common math symbols/letters)
    cleaned = re.sub(r'[%~&_\\|?!@#$"\';:,{}[\]]', '', cleaned)
    
    # 2. Convert x to * when sandwiched between digits
    cleaned = re.sub(r'(?<=\d)\s*[xX]\s*(?=\d)', '*', cleaned)
    
    cleaned = cleaned.replace("×", "*").replace("÷", "/").replace("^", "**")
    cleaned = re.sub(r"\bpi\b", "pi", cleaned, flags=re.I)
    
    # 3. Collapse multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned).strip()
    
    # 4. Remove leading invalid operators
    cleaned = re.sub(r'^[*\/^=\s]+', '', cleaned)
    
    # 5. Remove trailing operators
    cleaned = re.sub(r'[*\/^=+\-\s]+$', '', cleaned)
    
    if not cleaned:
        raise ValueError("Expression is empty after cleaning.")
    if "=" in cleaned:
        left, right = cleaned.split("=", 1)
        left_parsed = parse_expr(left, local_dict=LOCAL_DICT, transformations=TRANSFORMATIONS, evaluate=False)
        right_parsed = parse_expr(right, local_dict=LOCAL_DICT, transformations=TRANSFORMATIONS, evaluate=False)
        if not isinstance(left_parsed, sp.Basic) or not isinstance(right_parsed, sp.Basic):
            raise ValueError("Parsed equation side is not a SymPy expression.")
        return sp.Eq(left_parsed, right_parsed)
    parsed = parse_expr(cleaned, local_dict=LOCAL_DICT, transformations=TRANSFORMATIONS, evaluate=False)
    if not isinstance(parsed, sp.Basic):
        raise ValueError(f"Parsed plain text object is not a SymPy expression: {type(parsed)}")
    return parsed


def _looks_like_latex(source: str) -> bool:
    return "\\" in source or "{" in source or "}" in source


def _parse(source: str):
    last_error: Exception | None = None
    # Only try the LaTeX parser first when the source text actually looks like
    # LaTeX (contains backslash or curly braces). Otherwise use the plain text
    # parser first — this prevents parse_latex from misinterpreting plain text
    # expressions like "sqrt(4)" as variable products (s*q*r*t(4)).
    if _looks_like_latex(source):
        parsers = (_latex_to_sympy, _plain_to_sympy)
    else:
        parsers = (_plain_to_sympy, _latex_to_sympy)
    for parser in parsers:
        try:
            return parser(source)
        except Exception as exc:
            last_error = exc
    raise ValueError(f"Could not parse recognized math: {last_error}")


def _equation_steps(equation: sp.Equality) -> SolvedMath:
    variables = sorted(equation.free_symbols, key=lambda item: item.name)
    if not variables:
        truth_value = sp.simplify(equation.lhs - equation.rhs) == 0
        return SolvedMath(str(equation), str(truth_value), ["Compare both sides.", f"The statement is {truth_value}."], str(truth_value))

    solutions = sp.solve(equation, variables, dict=True)
    target = ", ".join(str(symbol) for symbol in variables)
    steps = [
        f"Start with {sp.sstr(equation)}.",
        f"Move all terms to one side: {sp.sstr(sp.simplify(equation.lhs - equation.rhs))} = 0.",
        f"Solve for {target}.",
    ]
    if solutions:
        steps.append(f"The solution set is {sp.sstr(solutions)}.")
    else:
        steps.append("SymPy found no finite symbolic solution.")
    result = sp.sstr(solutions)
    if len(variables) == 1 and len(solutions) == 1 and variables[0] in solutions[0]:
        answer_text = f"{variables[0]} = {sp.sstr(solutions[0][variables[0]])}"
    else:
        answer_text = f"Solution: {result}"
    return SolvedMath(sp.sstr(equation), result, steps, answer_text)


def _system_steps(expressions: list[sp.Equality]) -> SolvedMath:
    variables = sorted(set().union(*(expr.free_symbols for expr in expressions)), key=lambda item: item.name)
    solutions = sp.solve(expressions, variables, dict=True)
    steps = [
        "Treat the recognized lines as a system of equations.",
        f"Use the variables {', '.join(str(symbol) for symbol in variables)}.",
        "Solve the equations simultaneously.",
        f"The solution set is {sp.sstr(solutions)}.",
    ]
    return SolvedMath("; ".join(sp.sstr(expr) for expr in expressions), sp.sstr(solutions), steps, f"Solution: {sp.sstr(solutions)}")


def _expression_steps(expression) -> SolvedMath:
    free_symbols = sorted(expression.free_symbols, key=lambda item: item.name)
    if isinstance(expression, sp.Integral):
        computed = sp.integrate(expression.function, *expression.limits) if expression.limits else sp.integrate(expression.function)
        steps = [f"Recognize the integral {sp.sstr(expression)}.", "Apply symbolic integration rules.", f"The antiderivative or value is {sp.sstr(computed)}."]
        return SolvedMath(sp.sstr(expression), sp.sstr(computed), steps, f"{sp.sstr(computed)}")

    if isinstance(expression, sp.Derivative):
        computed = sp.diff(expression.expr, *expression.variable_count)
        steps = [f"Recognize the derivative {sp.sstr(expression)}.", "Apply differentiation rules term by term.", f"The derivative is {sp.sstr(computed)}."]
        return SolvedMath(sp.sstr(expression), sp.sstr(computed), steps, f"{sp.sstr(computed)}")

    simplified = sp.simplify(expression)
    steps = [f"Recognize the expression {sp.sstr(expression)}.", "Simplify using algebraic identities and arithmetic."]
    if free_symbols:
        steps.append(f"The simplified form is {sp.sstr(simplified)}.")
    else:
        steps.append(f"Evaluate the expression to get {sp.sstr(simplified)}.")
    return SolvedMath(sp.sstr(expression), sp.sstr(simplified), steps, f"{sp.sstr(simplified)}")


def solve_math(latex: str, text: str = "") -> SolvedMath:
    source = latex or text
    if "\\begin{cases}" in source or "\n" in source:
        chunks = [chunk.strip() for chunk in re.split(r"\\\\|\n|;", source) if chunk.strip()]
        equations = []
        for chunk in chunks:
            expr = _parse(chunk)
            equations.append(expr if isinstance(expr, sp.Equality) else sp.Eq(expr, 0))
        if len(equations) > 1:
            return _system_steps(equations)

    expression = _parse(source)
    if isinstance(expression, sp.Equality):
        return _equation_steps(expression)
    return _expression_steps(expression)
