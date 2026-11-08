from pydantic import BaseModel, Field


class SolveRequest(BaseModel):
    text: str = Field(..., description="Recognized math text from the browser OCR.")


class OcrResult(BaseModel):
    text: str
    latex: str
    confidence: float
    provider: str


class SolveResult(BaseModel):
    ocr: OcrResult
    normalized_expression: str
    result: str
    steps: list[str]
    answer_text: str


class TutorRequest(BaseModel):
    question: str
    context: str = ""
    solved_expression: str = ""


class TutorResponse(BaseModel):
    answer: str
