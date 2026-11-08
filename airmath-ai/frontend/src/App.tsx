import { Camera, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { drawStroke, exportForOcr, fitCanvas, point, redraw } from "./lib/canvas";
import { recognizeText } from "./lib/ocr";
import { beautifyStroke } from "./lib/beautify";
import { useHandTracker } from "./hooks/useHandTracker";
import type { FrameData } from "./hooks/useHandTracker";
import { useAirMathSocket } from "./hooks/useWebSocket";
import { Toolbar } from "./components/Toolbar";
import { TutorPanel } from "./components/TutorPanel";
import type { Gesture, ServerMessage, SolutionMessage, Stroke } from "./types/airmath";
import "./styles.css";

const gestureLabels: Record<Gesture, string> = {
  idle: "Hold a gesture in view",
  draw: "Draw",
  erase: "Erase",
  submit: "Submit",
  clear: "Clear",
};

function newStroke(color: string, mode: "ink" | "erase", sw: number): Stroke {
  return { id: crypto.randomUUID(), color, width: mode === "erase" ? 34 : sw, mode, points: [] };
}

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const currentStrokeRef = useRef<Stroke | null>(null);
  const answerFrameRef = useRef<number | null>(null);
  const solveTimeoutRef = useRef<number | null>(null);
  const lastGestureActionRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("Starting camera");
  const strokesRef = useRef<Stroke[]>([]);
  const [, forceUpdate] = useState(0);
  const [inkColor, setInkColor] = useState("#67e8f9");
  const [dark, setDark] = useState(true);
  const [solution, setSolution] = useState<SolutionMessage | null>(null);
  const [tutorAnswer, setTutorAnswer] = useState("");
  const [error, setError] = useState("");
  const [isSolving, setIsSolving] = useState(false);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [manualInput, setManualInput] = useState("");

  // Mouse & touch fallback modes and submit modal state
  const [inputMode, setInputMode] = useState<"air" | "mouse">("air");
  const [mouseTool, setMouseTool] = useState<"draw" | "erase">("draw");
  const [isDrawing, setIsDrawing] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [modalInputText, setModalInputText] = useState("");

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputMode !== "mouse") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDrawing(true);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const stroke = newStroke(inkColor, mouseTool === "erase" ? "erase" : "ink", 7);
    stroke.points.push({ x, y, t: performance.now(), pressure: 0.5 });
    currentStrokeRef.current = stroke;

    const ctx = e.currentTarget.getContext("2d");
    if (ctx) drawStroke(ctx, stroke);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputMode !== "mouse" || !isDrawing || !currentStrokeRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    currentStrokeRef.current.points.push({ x, y, t: performance.now(), pressure: 0.5 });
    const ctx = e.currentTarget.getContext("2d");
    if (ctx) {
      drawStroke(ctx, currentStrokeRef.current);
    }
  };

  const pushStroke = useCallback((stroke: Stroke) => {
    const beautified = beautifyStroke(stroke);
    strokesRef.current.push(beautified);
    const canvas = canvasRef.current;
    if (canvas) {
      redraw(canvas, strokesRef.current);
    }
    forceUpdate((n) => n + 1);
  }, []);

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (inputMode !== "mouse" || !isDrawing) return;
    setIsDrawing(false);

    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      pushStroke(currentStrokeRef.current);
    }
    currentStrokeRef.current = null;
  };

  // Refs so the rAF drawing loop always has fresh values without React state.
  const inkColorRef = useRef(inkColor);
  inkColorRef.current = inkColor;
  const isSolvingRef = useRef(isSolving);
  isSolvingRef.current = isSolving;

  const animateAnswer = useCallback((text: string) => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;

    if (answerFrameRef.current) {
      cancelAnimationFrame(answerFrameRef.current);
      answerFrameRef.current = null;
    }

    const width = overlay.clientWidth;
    const y = Math.max(120, overlay.clientHeight - 160);
    let index = 0;
    ctx.clearRect(0, 0, overlay.clientWidth, overlay.clientHeight);
    ctx.font = "34px 'Segoe Print', 'Comic Sans MS', cursive";
    ctx.fillStyle = dark ? "#e0fffb" : "#083344";
    ctx.shadowColor = "#67e8f9";
    ctx.shadowBlur = 8;

    const tick = () => {
      ctx.clearRect(0, 0, width, overlay.clientHeight);
      const visible = text.slice(0, index);
      ctx.fillText(visible, 42, y, width - 84);
      index += 1;
      if (index <= text.length) {
        answerFrameRef.current = requestAnimationFrame(tick);
      }
    };

    answerFrameRef.current = requestAnimationFrame(tick);
  }, [dark]);

  const onServerMessage = useCallback((message: ServerMessage) => {
    if (message.type === "solution") {
      setSolution(message);
      setError("");
      setIsSolving(false);
      if (solveTimeoutRef.current) {
        window.clearTimeout(solveTimeoutRef.current);
        solveTimeoutRef.current = null;
      }
      animateAnswer(message.answerText);
      // Auto-clear canvas after showing answer so user can start next question
      setTimeout(() => {
        strokesRef.current = [];
        currentStrokeRef.current = null;
        const c = canvasRef.current;
        if (c) redraw(c, []);
      }, 2000);
    }
    if (message.type === "error") {
      setError(message.message);
      setIsSolving(false);
      if (solveTimeoutRef.current) {
        window.clearTimeout(solveTimeoutRef.current);
        solveTimeoutRef.current = null;
      }
    }
    if (message.type === "tutor") setTutorAnswer(message.answer);
  }, [animateAnswer]);

  const { connected, send } = useAirMathSocket(onServerMessage);

  // ── Frame-level drawing callback (runs every frame from the tracker loop) ──
  const onFrameRef = useRef<((data: FrameData) => void) | null>(null);
  const submitCanvasRef = useRef(submitCanvas);
  const cursorRef = useRef<HTMLSpanElement | null>(null);

  onFrameRef.current = (data: FrameData) => {
    const canvas = canvasRef.current;

    // Update cursor position directly via DOM (no React state lag)
    if (cursorRef.current) {
      if (data.fingertip) {
        cursorRef.current.style.display = "block";
        cursorRef.current.style.transform = `translate(${data.fingertip.x}px, ${data.fingertip.y}px)`;
      } else {
        cursorRef.current.style.display = "none";
      }
    }

    if (!canvas) return;

    const now = performance.now();
    const gesture = data.gesture;
    const fingertip = data.fingertip;

    // Clear gesture — debounced at 800ms for faster response
    if (gesture === "clear" && now - lastGestureActionRef.current > 800) {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      redraw(canvas, []);
      lastGestureActionRef.current = now;
      return;
    }

    // Submit gesture — debounced at 1500ms
    if (gesture === "submit" && now - lastGestureActionRef.current > 1500) {
      // Save current stroke before submitting so it's included in OCR
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
        pushStroke(currentStrokeRef.current);
      }
      currentStrokeRef.current = null;
      submitCanvasRef.current();
      lastGestureActionRef.current = now;
      return;
    }

    // If not drawing or erasing, finalize the current stroke
    if (gesture !== "draw" && gesture !== "erase") {
      if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
        pushStroke(currentStrokeRef.current);
      }
      currentStrokeRef.current = null;
      return;
    }

    if (!fingertip) return;

    const mode = gesture === "erase" ? "erase" : "ink";
    const p = point(fingertip.x, fingertip.y);
    let stroke = currentStrokeRef.current;
    if (!stroke || stroke.mode !== mode) {
      if (stroke && stroke.points.length > 1) {
        pushStroke(stroke);
      }
      stroke = newStroke(inkColorRef.current, mode, data.strokeWidth);
      currentStrokeRef.current = stroke;
    }
    stroke.points.push(p);
    const ctx = canvas.getContext("2d");
    if (ctx) drawStroke(ctx, stroke);
  };

  // Keep submitCanvasRef.current pointing at the latest submitCanvas closure
  useEffect(() => {
    submitCanvasRef.current = submitCanvas;
  });

  const tracker = useHandTracker(videoRef, cameraActive, onFrameRef);

  const stopCamera = useCallback(() => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus("Camera API is unavailable in this browser.");
      setError("Camera API is unavailable. Open the app in Chrome, Edge, or another webcam-capable browser.");
      return;
    }

    stopCamera();
    const requestId = ++cameraRequestRef.current;
    setCameraStatus("Requesting camera permission");
    setError("");

    const attempts: MediaStreamConstraints[] = [
      { video: true, audio: false },
      { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: { ideal: "user" } }, audio: false },
    ];

    let lastError: unknown = null;
    for (const constraints of attempts) {
      try {
        console.log("Attempting camera with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log("Camera stream obtained:", stream);

        if (requestId !== cameraRequestRef.current) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          streamRef.current = stream;
          videoRef.current.muted = true;
          videoRef.current.playsInline = true;
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraActive(true);
          setCameraStatus("Camera live");
          console.log("Camera successfully activated");
          return;
        }
      } catch (cameraError) {
        console.error("Camera attempt failed:", cameraError);
        lastError = cameraError;
      }
    }

    const message = lastError instanceof DOMException
      ? `${lastError.name}: ${lastError.message}`
      : lastError instanceof Error
        ? lastError.message
        : "Could not access the webcam.";
    setCameraActive(false);
    setCameraStatus("Camera blocked or unavailable");
    console.error("All camera attempts failed:", message);
    setError(`${message}. Check browser permissions or close other apps using the webcam.`);
    // Automatically switch to mouse/touch fallback mode so whiteboard is still fully usable
    setInputMode("mouse");
  }, [stopCamera]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    setOcrEnabled(true);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Ctrl+Z = undo last stroke
      if (e.ctrlKey && e.key === "z") {
        e.preventDefault();
        handleUndo();
      }
      // Delete/Backspace = clear canvas
      if (e.key === "Delete" || e.key === "Backspace") {
        // Don't clear if user is typing in the manual input field
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        e.preventDefault();
        handleClear();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  useEffect(() => {
    return () => {
      if (answerFrameRef.current) {
        cancelAnimationFrame(answerFrameRef.current);
      }
      if (solveTimeoutRef.current) {
        window.clearTimeout(solveTimeoutRef.current);
      }
    };
  }, []);



  useEffect(() => {
    const resize = () => {
      const host = document.querySelector(".stage") as HTMLElement | null;
      if (!host || !canvasRef.current || !overlayRef.current) return;
      fitCanvas(canvasRef.current, host.clientWidth, host.clientHeight);
      fitCanvas(overlayRef.current, host.clientWidth, host.clientHeight);
      redraw(canvasRef.current, strokesRef.current);
      // Also redraw current stroke if it has points
      const cur = currentStrokeRef.current;
      if (cur && cur.points.length > 1) {
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) drawStroke(ctx, cur);
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  async function submitCanvas() {
    const canvas = canvasRef.current;
    if (!canvas || isSolvingRef.current) return;
    setError("");
    setIsSolving(true);

    if (solveTimeoutRef.current) {
      window.clearTimeout(solveTimeoutRef.current);
    }

    // Save any active/in-progress stroke first!
    if (currentStrokeRef.current && currentStrokeRef.current.points.length > 1) {
      pushStroke(currentStrokeRef.current);
      currentStrokeRef.current = null;
    }

    // Validate that the whiteboard contains actual drawings
    const activeStrokes = strokesRef.current.filter((s) => s.mode === "ink" && s.points.length > 1);
    if (activeStrokes.length === 0) {
      setIsSolving(false);
      setError("Please draw a mathematical expression on the whiteboard first.");
      return;
    }

    let ocrText = "";
    try {
      const imageDataUrl = exportForOcr(canvas, strokesRef.current, "#f7fbff");
      ocrText = await recognizeText(imageDataUrl);
    } catch (e: any) {
      console.warn("OCR failed:", e);
      setIsSolving(false);
      setError(`OCR Engine Error: ${e?.message || e}. Please try again or type manually.`);
      return;
    }

    const text = ocrText.trim();
    if (!text) {
      setIsSolving(false);
      setError("No math was recognized from the canvas.");
      return;
    }

    const sent = send({ type: "solve_text", text });
    if (!sent) {
      setIsSolving(false);
      setError("Backend WebSocket is not connected.");
      return;
    }

    solveTimeoutRef.current = window.setTimeout(() => {
      setIsSolving(false);
      setError("Solve request timed out. Check the backend and try again.");
      solveTimeoutRef.current = null;
    }, 30000);
  }

  function handleModalSubmit(e: React.FormEvent) {
    e.preventDefault();
  }

  function saveImage() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "airmath-whiteboard.png";
    link.href = exportForOcr(canvas, strokesRef.current, dark ? "#071018" : "#f7fbff");
    link.click();
  }

  function speakSolution() {
    if (!solution) return;
    const utterance = new SpeechSynthesisUtterance(solution.steps.join(". ") + `. Final answer: ${solution.answerText}`);
    utterance.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }

  function askTutor(question: string) {
    setTutorAnswer("");
    const sent = send({ type: "tutor", question, context: solution?.steps.join("\n") ?? "", solvedExpression: solution?.normalizedExpression ?? "" });
    if (!sent) {
      setError("Backend WebSocket is not connected.");
    }
  }

  function fullscreen() {
    document.documentElement.requestFullscreen?.();
  }

  function handleUndo() {
    strokesRef.current = strokesRef.current.slice(0, -1);
    currentStrokeRef.current = null;
    forceUpdate((n) => n + 1);
    const c = canvasRef.current;
    if (c) {
      redraw(c, strokesRef.current);
    }
  }

  function handleClear() {
    strokesRef.current = [];
    currentStrokeRef.current = null;
    setSolution(null);
    setTutorAnswer("");
    setError("");
    forceUpdate((n) => n + 1);
    const c = canvasRef.current;
    if (c) redraw(c, []);
  }

  function handleManualSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = manualInput.trim();
    if (!text) return;
    setIsSolving(true);
    setError("");
    if (solveTimeoutRef.current) window.clearTimeout(solveTimeoutRef.current);
    const sent = send({ type: "solve_text", text });
    if (!sent) {
      setIsSolving(false);
      setError("Backend WebSocket is not connected.");
    }
    solveTimeoutRef.current = window.setTimeout(() => {
      setIsSolving(false);
      setError("Solve request timed out.");
      solveTimeoutRef.current = null;
    }, 30000);
  }

  return (
    <main className={dark ? "app dark" : "app light"}>
      <Toolbar
        gesture={inputMode === "mouse" ? "idle" : tracker.gesture}
        connected={connected}
        color={inkColor}
        dark={dark}
        onColor={setInkColor}
        onUndo={handleUndo}
        onClear={handleClear}
        onSave={saveImage}
        onSpeak={speakSolution}
        onDark={() => setDark((value) => !value)}
        onFullscreen={fullscreen}
        inputMode={inputMode}
        onInputMode={(mode) => {
          setInputMode(mode);
          if (mode === "mouse") {
            stopCamera();
          } else {
            startCamera();
          }
        }}
        mouseTool={mouseTool}
        onMouseTool={setMouseTool}
        onSubmit={submitCanvas}
      />
      <section className="stage-shell">
        <div className="stage">
          <video ref={videoRef} muted playsInline style={{ display: inputMode === "mouse" ? "none" : "block" }} />
          <canvas
            ref={canvasRef}
            className="ink-canvas"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: inputMode === "mouse" ? (mouseTool === "erase" ? "cell" : "crosshair") : "default" }}
          />
          <canvas ref={overlayRef} className="answer-canvas" />
          {!connected && (
            <div className="ws-disconnected-banner" role="alert">
              <span className="ws-disconnected-dot" />
              <div>
                <strong>Backend disconnected</strong>
                <span>Equation solving is unavailable. Make sure the backend server is running on port 8000.</span>
              </div>
            </div>
          )}
          {!cameraActive && inputMode === "air" && (
            <div className="camera-panel">
              <Camera size={32} />
              <strong>{cameraStatus}</strong>
              <span>Allow camera access, then start tracking. If another app is using the webcam, close it first.</span>
              <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
                <button onClick={startCamera}>
                  <RefreshCw size={17} />
                  Start camera
                </button>
                <button onClick={() => setInputMode("mouse")} style={{ background: "rgba(148, 163, 184, 0.2)", borderColor: "rgba(148, 163, 184, 0.4)" }}>
                  Use Mouse/Pen
                </button>
              </div>
            </div>
          )}

          {inputMode === "air" && <span ref={cursorRef} className="cursor" style={{ display: "none" }} />}
          <div className="hud">
            <span>{inputMode === "mouse" ? `Mouse Mode: ${mouseTool}` : gestureLabels[tracker.gesture]}</span>
            <span>{inputMode === "mouse" ? "Webcam Off" : cameraStatus}</span>
            {inputMode === "air" && <span>{tracker.fps || 0} FPS</span>}
            {inputMode === "air" && <span>{tracker.ready ? "MediaPipe ready" : "Loading tracker"}</span>}
            {isSolving && <span>Solving</span>}
          </div>
          {tracker.error && inputMode === "air" && <div className="camera-error">{tracker.error}</div>}
        </div>
      </section>
      <TutorPanel solution={solution} tutorAnswer={tutorAnswer} error={error} onAsk={askTutor} ocrEnabled={ocrEnabled} cameraActive={cameraActive || inputMode === "mouse"} />
      <form className="manual-input-bar" onSubmit={handleManualSubmit}>
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Type equation here (e.g. 7 * 3, 2x + 5 = 15)"
          className="manual-input"
        />
        <button type="submit" className="manual-submit" disabled={isSolving || !manualInput.trim()}>
          Solve
        </button>
      </form>

      {showSubmitModal && (
        <div className="submit-overlay">
          <div className="submit-overlay-card">
            <strong>Confirm Equation</strong>
            <small>Verify what was recognized from your drawing, or type it directly below.</small>
            <form onSubmit={handleModalSubmit} className="submit-overlay-form">
              <input
                type="text"
                value={modalInputText}
                onChange={(e) => setModalInputText(e.target.value)}
                placeholder="Type equation here (e.g. 2x + 3 = 7)"
                autoFocus
              />
              <div className="submit-overlay-actions">
                <button type="button" onClick={() => setShowSubmitModal(false)} className="btn-cancel">
                  Cancel
                </button>
                <button type="submit" className="btn-solve" disabled={isSolving || !modalInputText.trim()}>
                  Solve
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
