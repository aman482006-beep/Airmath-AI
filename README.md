# AirMath AI ✍️🧮

> A webcam-driven math workspace that turns handwritten equations in the air into structured, solvable mathematics.

AirMath AI combines **computer vision, browser OCR, symbolic mathematics, and a real-time WebSocket backend** into an interactive whiteboard. You write with hand gestures, submit the equation, and the system recognises and solves it without requiring an external AI API key.

## The interaction loop

```text
Webcam
  ↓
MediaPipe Hands → gesture detection
  ↓
HTML5 Canvas → air-written equation
  ↓
Tesseract.js → browser-side OCR
  ↓
WebSocket
  ↓
FastAPI + SymPy → parse / solve / generate steps
  ↓
Tutor context → explain / extend / practise
```

## Features

- ☝️ **Air writing** — raise one finger to enter draw mode.
- ✋ **Gesture erase** — open palm to erase.
- ✌️ **Clear gesture** — two fingers clears the board.
- 👍 **Submit gesture** — thumbs-up sends the current equation for solving.
- 🔎 **Browser OCR** — Tesseract.js processes handwriting locally in the browser.
- ∑ **Symbolic solving** — SymPy handles arithmetic, algebra, fractions, exponents, calculus, systems, and trigonometric expressions.
- 🔊 **Read solutions aloud** using the Web Speech API.
- 🧑‍🏫 **Tutor mode** for follow-ups such as alternative methods and generated practice questions.
- 🌐 **Real-time communication** between frontend and backend over WebSockets.
- 🔐 **No external API keys required** for the core OCR + solving pipeline.

## Why this project is interesting

The interesting part isn't simply putting a math solver behind a text box. The project connects several systems into one interaction loop:

**Vision → interaction → OCR → structured computation → explanation.**

That makes it a useful exploration of how multimodal interfaces can sit on top of deterministic computational systems instead of treating an LLM as the entire product.

## Architecture

```text
airmath-ai/
├── backend/
│   └── app/
│       ├── main.py       # FastAPI + WebSocket entry point
│       ├── ocr.py        # OCR data boundary
│       ├── solver.py     # SymPy parsing + solution generation
│       ├── tutor.py      # Context-aware tutoring responses
│       ├── schemas.py     # Pydantic contracts
│       └── config.py      # Environment configuration
│
├── frontend/
│   └── src/
│       ├── components/
│       ├── hooks/
│       ├── lib/
│       ├── types/
│       └── App.tsx
│
└── draw.js
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Computer vision | MediaPipe Hands |
| OCR | Tesseract.js |
| Rendering | HTML5 Canvas |
| Backend | FastAPI, Python |
| Realtime | WebSockets |
| Math engine | SymPy |
| Contracts | Pydantic |
| Voice | Web Speech API |

## Run locally

### Backend

```bash
cd airmath-ai/backend
python -m venv .venv

# Windows
.venv\Scripts\activate

pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd airmath-ai/frontend
npm install
npm run dev
```

Then open the Vite development URL shown in the terminal.

## Design principles

- **Deterministic where possible:** symbolic mathematics is handled by SymPy rather than asking a language model to calculate.
- **Local-first OCR:** handwriting recognition runs in the browser.
- **Typed boundaries:** Pydantic schemas define the backend contracts.
- **Realtime UX:** WebSockets keep the solve interaction responsive.
- **Separation of concerns:** gesture handling, UI, transport, solving, and tutoring are separate layers.

## Status

🚧 Personal engineering project. The current implementation is a working foundation for experimenting with multimodal educational interfaces and richer tutoring workflows.
