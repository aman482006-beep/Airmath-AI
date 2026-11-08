# AirMath AI

AirMath AI is a webcam-driven math whiteboard. Raise one index finger to write in the air, open your palm to erase, raise two fingers to clear, and give a thumbs-up to submit the current board for OCR and symbolic solving.

## Stack

- Frontend: React, TypeScript, Vite, MediaPipe Hands, Tesseract.js (browser OCR), HTML5 Canvas, Web Speech API
- Backend: FastAPI, WebSockets, SymPy (symbolic math solver)
- Runtime: Python 3.11+, Node 20+
- **No external API keys required** — all OCR runs in the browser via Tesseract.js, and math solving uses the local SymPy library.

## Project Structure

```text
airmath-ai/
  backend/
    app/
      main.py          FastAPI app and WebSocket API
      ocr.py           Browser OCR passthrough (text from Tesseract.js)
      solver.py        SymPy parsing and step generation
      tutor.py         Tutor follow-up responses
      schemas.py       Pydantic contracts
      config.py        Environment configuration
    requirements.txt
    .env.example
  frontend/
    src/
      App.tsx
      components/
      hooks/
      lib/
      types/
    package.json
    vite.config.ts
```

## Backend Setup

```bash
cd airmath-ai/backend
python -m venv .venv
.venv\\Scripts\\activate
pip install -r requirements.txt
```

Start the API locally (bound to this computer only):

```bash
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Health check:

```bash
curl http://localhost:8000/health
```

## Frontend Setup

```bash
cd airmath-ai/frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Gesture Controls

- Index finger up: draw mode
- Open palm: erase mode
- Thumbs up: submit equation
- Two fingers up: clear canvas
- Toolbar: undo, clear, save image, read solution aloud, dark mode, fullscreen classroom mode, ink color

## OCR and Solving

Tesseract.js runs entirely in the browser to recognize handwritten math from the canvas. The recognized text is sent to the backend, where SymPy parses and solves arithmetic, algebra, fractions, exponents, integrals, derivatives, systems, and trigonometric expressions. No external API keys are needed.

## Advanced AI Tutor Mode

Use the tutor box for follow-up prompts such as:

- Explain why.
- Show another method.
- Give me a harder version.
- Create 5 similar practice problems.

The built-in tutor responds from the solved context without needing a separate LLM key.

## Production Deployment

1. Build the frontend:

   ```bash
   cd airmath-ai/frontend
   npm run build
   ```

2. Deploy `frontend/dist` to a static host.
3. Deploy the FastAPI app behind HTTPS with a process manager:

   ```bash
   cd airmath-ai/backend
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```

   The `0.0.0.0` binding is for a server/container environment only. Do not use it for local laptop development.

4. Set production environment variables:

   ```env
   AIR_MATH_ALLOWED_ORIGINS=https://your-frontend-domain.example
   ```

5. Configure the frontend WebSocket URL when the API is hosted elsewhere:

   ```env
   VITE_AIRMATH_WS_URL=wss://your-api-domain.example/ws/solve
   ```

Browsers require HTTPS for webcam access outside `localhost`, so production deployments should serve both the frontend and backend over TLS.
