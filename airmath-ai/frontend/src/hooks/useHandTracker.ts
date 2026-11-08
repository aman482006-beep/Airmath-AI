import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { classifyGesture, resetGestureState, strokeWidth } from "../lib/gesture";
import { OneEuroFilter } from "../lib/filter";
import { StrokePredictor } from "../lib/predictor";
import type { Gesture } from "../types/airmath";

export type FrameData = {
  fingertip: { x: number; y: number } | null;
  gesture: Gesture;
  strokeWidth: number;
};

type TrackerState = {
  gesture: Gesture;
  fingertip: { x: number; y: number } | null;
  strokeWidth: number;
  fps: number;
  ready: boolean;
  error: string;
};

type Landmark = { x: number; y: number; z?: number };

/**
 * EMA (Exponential Moving Average) smoothing for landmark coordinates.
 * Reduces per-frame jitter from the neural network output before
 * gesture classification, resulting in more stable gesture detection.
 */
function smoothLandmarks(
  landmarks: Landmark[],
  state: { alpha: number; smoothed: Landmark[] | null },
): Landmark[] {
  if (!state.smoothed) {
    state.smoothed = landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z }));
    return state.smoothed;
  }

  const a = state.alpha;
  for (let i = 0; i < landmarks.length; i++) {
    const s = state.smoothed[i] ?? landmarks[i];
    const l = landmarks[i];
    s.x = a * l.x + (1 - a) * s.x;
    s.y = a * l.y + (1 - a) * s.y;
    if (l.z !== undefined) {
      s.z = (s.z ?? l.z) * (1 - a) + l.z * a;
    }
  }

  return state.smoothed;
}

/**
 * useHandTracker — manages MediaPipe HandLandmarker lifecycle and runs a
 * requestAnimationFrame detection loop.
 *
 * The onFrameRef callback is called every frame with the latest fingertip,
 * gesture, and strokeWidth. Use this for smooth, jank-free drawing without
 * cascading React re-renders.
 */
export function useHandTracker(
  videoRef: RefObject<HTMLVideoElement | null>,
  active: boolean,
  onFrameRef?: RefObject<((data: FrameData) => void) | null>,
) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const rafRef = useRef<number | null>(null);
  // One-Euro filter tuned for responsive yet jitter-free cursor tracking
  const filterRef = useRef(new OneEuroFilter({ minCutoff: 1.0, beta: 0.5, dCutoff: 1.0 }));
  // EMA smoothing for raw landmarks before gesture classification
  const landmarkEmaRef = useRef<{ alpha: number; smoothed: Landmark[] | null }>({
    alpha: 0.35,
    smoothed: null,
  });
  const predictorRef = useRef(new StrokePredictor());
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const lastFrameTimeRef = useRef(performance.now());
  const mpTimestampRef = useRef(0);
  const lostCountRef = useRef(0);
  const loopActiveRef = useRef(false);
  const frameCountRef = useRef(0);

  // Live refs so App can read the latest values without a React state update
  const fingertipRef = useRef<{ x: number; y: number } | null>(null);
  const gestureRef = useRef<Gesture>("idle");
  const strokeWidthRef = useRef(7);

  const [state, setState] = useState<TrackerState>({
    gesture: "idle",
    fingertip: null,
    strokeWidth: 7,
    fps: 0,
    ready: false,
    error: "",
  });

  // Boot MediaPipe once
  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        console.log("[Tracker] Loading MediaPipe WASM...");
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.20/wasm",
        );
        console.log("[Tracker] Creating HandLandmarker...");
        const landmarker = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task",
            delegate: "GPU",
          },
          runningMode: "VIDEO",
          numHands: 1,
          // Production-grade thresholds — higher = fewer false positives
          minHandDetectionConfidence: 0.7,
          minHandPresenceConfidence: 0.6,
          minTrackingConfidence: 0.7,
        });
        if (!cancelled) {
          landmarkerRef.current = landmarker;
          console.log("[Tracker] HandLandmarker ready!");
          setState((c) => ({ ...c, ready: true }));
        }
      } catch (err) {
        console.error("[Tracker] Failed to load MediaPipe:", err);
        setState((c) => ({
          ...c,
          error: err instanceof Error ? err.message : "Hand tracker failed to load.",
        }));
      }
    }
    boot();
    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
    };
  }, []);

  // Main detection loop
  useEffect(() => {
    if (!active) {
      loopActiveRef.current = false;
      // Reset state when camera is turned off
      fingertipRef.current = null;
      gestureRef.current = "idle";
      strokeWidthRef.current = 7;
      landmarkEmaRef.current.smoothed = null;
      setState((c) => ({ ...c, gesture: "idle", fingertip: null }));
      return;
    }

    loopActiveRef.current = true;
    lastPointRef.current = null;
    frameCountRef.current = 0;
    landmarkEmaRef.current.smoothed = null;

    const loop = () => {
      if (!loopActiveRef.current) return;

      const video = videoRef.current;
      const landmarker = landmarkerRef.current;

      if (!video || !landmarker || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const now = performance.now();
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      const rawTs = performance.now();
      mpTimestampRef.current = Math.max(mpTimestampRef.current + 1, rawTs);
      const mpTs = mpTimestampRef.current;

      try {
        const result = landmarker.detectForVideo(video, mpTs);
        const landmarks = result.landmarks[0];

        if (landmarks && landmarks.length > 0) {
          lostCountRef.current = 0;

          // EMA-smooth all 21 landmarks to reduce jitter
          const smoothed = smoothLandmarks(landmarks, landmarkEmaRef.current);

          const tip = smoothed[8];
          const rawX = (1 - tip.x) * video.clientWidth;
          const rawY = tip.y * video.clientHeight;

          const filtered = filterRef.current.filter({ x: rawX, y: rawY });
          const predicted = predictorRef.current.predict(filtered);

          const dx = filtered.x - (lastPointRef.current?.x ?? filtered.x);
          const dy = filtered.y - (lastPointRef.current?.y ?? filtered.y);
          const distance = Math.hypot(dx, dy);
          lastPointRef.current = filtered;

          const gesture = classifyGesture(smoothed);
          const sw = strokeWidth(distance);
          const fps = dt > 0 ? Math.round(1000 / dt) : 0;

          // Always update refs (zero-lag reads for drawing)
          fingertipRef.current = predicted;
          gestureRef.current = gesture;
          strokeWidthRef.current = sw;

          // Call the frame callback for drawing (every frame)
          onFrameRef?.current?.({ fingertip: predicted, gesture, strokeWidth: sw });

          // Throttle React state to ~every 4th frame — HUD can update slower
          frameCountRef.current += 1;
          if (frameCountRef.current % 4 === 0) {
            setState({
              gesture,
              fingertip: predicted,
              strokeWidth: sw,
              fps,
              ready: true,
              error: "",
            });
          }
        } else {
          lostCountRef.current++;
          if (lostCountRef.current > 15) {
            lastPointRef.current = null;
            resetGestureState();
            predictorRef.current.reset();
            landmarkEmaRef.current.smoothed = null;
            fingertipRef.current = null;
            gestureRef.current = "idle";
            strokeWidthRef.current = 7;
            // Immediately notify drawing callback of lost hand
            onFrameRef?.current?.({ fingertip: null, gesture: "idle", strokeWidth: 7 });
            setState((c) => ({ ...c, gesture: "idle", fingertip: null }));
          }
        }
      } catch (err) {
        console.warn("[Tracker] detectForVideo error:", err);
        mpTimestampRef.current += 10;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => {
      loopActiveRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, videoRef, onFrameRef]);

  // Return both throttled state (for UI/HUD) and live refs (for drawing)
  return {
    gesture: state.gesture,
    fingertip: state.fingertip,
    strokeWidth: state.strokeWidth,
    fps: state.fps,
    ready: state.ready,
    error: state.error,
    fingertipRef,
    gestureRef,
    strokeWidthRef,
  };
}
