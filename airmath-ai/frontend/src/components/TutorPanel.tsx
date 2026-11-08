import { SendHorizontal } from "lucide-react";
import { FormEvent, useState } from "react";
import type { SolutionMessage } from "../types/airmath";

type Props = {
  solution: SolutionMessage | null;
  tutorAnswer: string;
  error: string;
  onAsk: (question: string) => void;
  ocrEnabled: boolean;
  cameraActive: boolean;
};

export function TutorPanel({ solution, tutorAnswer, error, onAsk, ocrEnabled, cameraActive }: Props) {
  const [question, setQuestion] = useState("");

  const ask = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = question.trim();
    if (trimmed) onAsk(trimmed);
    setQuestion("");
  };

  return (
    <section className="tutor-panel">
      <div className="panel-header">
        <span>AI Tutor</span>
        <small>{solution ? `${Math.round(solution.ocr.confidence * 100)}% confidence` : "Ready to solve"}</small>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {!ocrEnabled && (
        <div className="info-banner">
          <strong>Camera recognition unavailable</strong>
          <span>Camera access was denied. Draw with hand gestures to solve equations.</span>
        </div>
      )}
      {solution ? (
        <div className="solution">
          <p className="recognized">{solution.ocr.latex || solution.ocr.text}</p>
          {solution.steps.map((step, index) => (
            <p key={step}><strong>{index + 1}.</strong> {step}</p>
          ))}
          <div className="answer">{solution.answerText}</div>
        </div>
      ) : (
        <div className="empty-state">
          {cameraActive
            ? "Raise one index finger to draw your equation on the canvas, then give a thumbs-up to solve it instantly."
            : "Start the camera above to draw with hand gestures."
          }
        </div>
      )}
      {tutorAnswer && <div className="tutor-answer">{tutorAnswer}</div>}
      <form onSubmit={ask} className="ask-box">
        <input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Explain why, show another method, or make practice problems" />
        <button title="Ask tutor"><SendHorizontal size={18} /></button>
      </form>
    </section>
  );
}
