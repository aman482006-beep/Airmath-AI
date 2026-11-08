import { Camera, Download, Eraser, Maximize, Mic2, Moon, Palette, RotateCcw, Send, Sun, Undo2, MousePointer } from "lucide-react";
import type { Gesture } from "../types/airmath";

type Props = {
  gesture: Gesture;
  connected: boolean;
  color: string;
  dark: boolean;
  onColor: (color: string) => void;
  onUndo: () => void;
  onClear: () => void;
  onSave: () => void;
  onSpeak: () => void;
  onDark: () => void;
  onFullscreen: () => void;
  inputMode: "air" | "mouse";
  onInputMode: (mode: "air" | "mouse") => void;
  mouseTool: "draw" | "erase";
  onMouseTool: (tool: "draw" | "erase") => void;
  onSubmit: () => void;
};

const colors = ["#67e8f9", "#a7f3d0", "#fef08a", "#f0abfc", "#fb7185", "#ffffff"];

export function Toolbar(props: Props) {
  return (
    <aside className="toolbar" aria-label="Whiteboard controls">
      <div className="brand">
        <span className="brand-mark">A</span>
        <div>
          <strong>AirMath AI</strong>
          <small className={`connection-status ${props.connected ? "online" : "offline"}`}>
            <span className="status-dot" />
            {props.connected ? "Tutor online" : "Backend disconnected"}
          </small>
        </div>
      </div>

      <div className="mode-selector" style={{ display: "flex", gap: "6px", margin: "12px 0", padding: "4px", background: "rgba(15, 23, 42, 0.4)", borderRadius: "8px" }}>
        <button
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            height: "36px",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            background: props.inputMode === "air" ? (props.dark ? "rgba(34, 211, 238, 0.2)" : "rgba(14, 116, 144, 0.15)") : "transparent",
            color: props.inputMode === "air" ? (props.dark ? "#67e8f9" : "#0891b2") : "inherit",
            fontWeight: 600,
          }}
          onClick={() => props.onInputMode("air")}
          title="Draw in the air via webcam"
        >
          <Camera size={14} />
          <span>Air</span>
        </button>
        <button
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            height: "36px",
            border: "none",
            borderRadius: "6px",
            cursor: "pointer",
            background: props.inputMode === "mouse" ? (props.dark ? "rgba(34, 211, 238, 0.2)" : "rgba(14, 116, 144, 0.15)") : "transparent",
            color: props.inputMode === "mouse" ? (props.dark ? "#67e8f9" : "#0891b2") : "inherit",
            fontWeight: 600,
          }}
          onClick={() => props.onInputMode("mouse")}
          title="Draw with mouse or touchscreen/stylus"
        >
          <MousePointer size={14} />
          <span>Mouse/Pen</span>
        </button>
      </div>

      {props.inputMode === "mouse" ? (
        <div className="mouse-tool-selector" style={{ display: "flex", gap: "6px", marginBottom: "12px", padding: "4px", background: "rgba(15, 23, 42, 0.4)", borderRadius: "8px" }}>
          <button
            style={{
              flex: 1,
              height: "32px",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              background: props.mouseTool === "draw" ? "rgba(16, 185, 129, 0.2)" : "transparent",
              color: props.mouseTool === "draw" ? "#34d399" : "inherit",
              fontWeight: 600,
            }}
            onClick={() => props.onMouseTool("draw")}
          >
            Draw
          </button>
          <button
            style={{
              flex: 1,
              height: "32px",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              background: props.mouseTool === "erase" ? "rgba(239, 68, 68, 0.2)" : "transparent",
              color: props.mouseTool === "erase" ? "#f87171" : "inherit",
              fontWeight: 600,
            }}
            onClick={() => props.onMouseTool("erase")}
          >
            Erase
          </button>
        </div>
      ) : (
        <div className="gesture-readout" data-gesture={props.gesture}>
          <span>{props.gesture}</span>
        </div>
      )}

      <div className="tool-row">
        <button title="Undo last stroke" onClick={props.onUndo}><Undo2 size={18} /></button>
        <button title="Clear canvas" onClick={props.onClear}><RotateCcw size={18} /></button>
        <button title="Save whiteboard as image" onClick={props.onSave}><Download size={18} /></button>
        <button title="Voice readout" onClick={props.onSpeak}><Mic2 size={18} /></button>
        <button title="Dark mode" onClick={props.onDark}>{props.dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        <button title="Classroom fullscreen" onClick={props.onFullscreen}><Maximize size={18} /></button>
      </div>

      <div style={{ marginTop: "10px", display: "flex", flexDirection: "column", gap: "8px" }}>
        <button
          onClick={props.onSubmit}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            width: "100%",
            height: "42px",
            border: "1px solid rgba(103, 232, 249, 0.4)",
            borderRadius: "8px",
            cursor: "pointer",
            background: "rgba(34, 211, 238, 0.15)",
            color: "#67e8f9",
            fontWeight: 700,
            fontSize: "0.95rem",
            boxShadow: "0 0 12px rgba(34, 211, 238, 0.1)",
            transition: "all 0.2s",
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = "rgba(34, 211, 238, 0.25)";
            e.currentTarget.style.boxShadow = "0 0 16px rgba(34, 211, 238, 0.2)";
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = "rgba(34, 211, 238, 0.15)";
            e.currentTarget.style.boxShadow = "0 0 12px rgba(34, 211, 238, 0.1)";
          }}
        >
          <Send size={15} />
          <span>Submit Drawing</span>
        </button>
      </div>

      <div className="palette" aria-label="Ink colors">
        <Palette size={16} />
        {colors.map((item) => (
          <button
            key={item}
            title={`Ink ${item}`}
            className={props.color === item ? "selected" : ""}
            style={{ background: item }}
            onClick={() => props.onColor(item)}
          />
        ))}
        <Eraser size={16} />
      </div>
    </aside>
  );
}
