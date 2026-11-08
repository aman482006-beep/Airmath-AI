from .schemas import OcrResult


class OcrUnavailable(RuntimeError):
    pass


def recognize_text(text: str) -> OcrResult:
    """Accept pre-recognized text from the browser OCR (Tesseract.js).

    No external API keys needed — the browser handles recognition
    and sends plain text here for SymPy solving.
    """
    cleaned = text.strip()
    if not cleaned:
        raise ValueError("No text was recognized from the canvas.")
    return OcrResult(
        text=cleaned,
        latex=cleaned,
        confidence=1.0,
        provider="browser",
    )
