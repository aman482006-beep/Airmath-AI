from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .ocr import OcrUnavailable, recognize_text
from .schemas import SolveRequest, SolveResult, TutorRequest, TutorResponse
from .solver import solve_math
from .tutor import explain

settings = get_settings()

app = FastAPI(title="AirMath AI API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict[str, object]:
    return {"ok": True}


@app.post("/api/solve", response_model=SolveResult)
async def solve(request: SolveRequest) -> SolveResult:
    ocr = recognize_text(request.text)
    solved = solve_math(ocr.latex, ocr.text)
    return SolveResult(
        ocr=ocr,
        normalized_expression=solved.normalized,
        result=solved.result,
        steps=solved.steps,
        answer_text=solved.answer_text,
    )


@app.post("/api/tutor", response_model=TutorResponse)
async def tutor(request: TutorRequest) -> TutorResponse:
    return TutorResponse(answer=explain(request.question, request.context, request.solved_expression))


@app.websocket("/ws/solve")
async def solve_socket(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            kind = payload.get("type")
            if kind in ("solve", "solve_text"):
                try:
                    text_input = payload.get("text", "")
                    if not text_input.strip():
                        await websocket.send_json({"type": "error", "message": "No equation provided."})
                        continue
                    ocr = recognize_text(text_input.strip())
                    solved = solve_math(ocr.latex, ocr.text)
                    await websocket.send_json(
                        {
                            "type": "solution",
                            "ocr": ocr.model_dump(),
                            "normalizedExpression": solved.normalized,
                            "result": solved.result,
                            "steps": solved.steps,
                            "answerText": solved.answer_text,
                        }
                    )
                except (OcrUnavailable, ValueError, RuntimeError) as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})
            elif kind == "tutor":
                await websocket.send_json(
                    {
                        "type": "tutor",
                        "answer": explain(
                            payload.get("question", ""),
                            payload.get("context", ""),
                            payload.get("solvedExpression", ""),
                        ),
                    }
                )
    except WebSocketDisconnect:
        return
