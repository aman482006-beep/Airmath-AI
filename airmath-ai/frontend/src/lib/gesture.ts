import type { Gesture } from "../types/airmath";

type Landmark = { x: number; y: number; z?: number };

/**
 * Determine which fingers are extended by comparing tip vs PIP joint positions.
 * Uses multi-joint analysis for robust detection even with partially bent fingers.
 *
 * Finger anatomy (MediaPipe landmarks):
 *   MCP (knuckle) → PIP (mid joint) → DIP (near tip) → TIP (fingertip)
 *   Index: 5 → 6 → 7 → 8
 *   Middle: 9 → 10 → 11 → 12
 *   Ring: 13 → 14 → 15 → 16
 *   Pinky: 17 → 18 → 19 → 20
 *   Thumb: 1 → 2 → 3 → 4
 */
function fingerStates(landmarks: Landmark[]): {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
  indexStraight: boolean;
  count: number;
} {
  const wrist = landmarks[0];

  // ── Thumb ──
  // Extended if tip is far from wrist horizontally OR tip is above index MCP vertically.
  // Must also be above pinky MCP to avoid false positives when hand is rotated.
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const indexMcp = landmarks[5];
  const pinkyMcp = landmarks[17];
  const thumbExtended =
    (Math.abs(thumbTip.x - wrist.x) > 0.09 || thumbTip.y < indexMcp.y - 0.02) &&
    thumbTip.y < pinkyMcp.y &&
    // Thumb tip must be above thumb IP (finger pointing up, not curled)
    thumbTip.y < thumbIp.y;

  // ── Non-thumb fingers ──
  // Each finger: tip above PIP AND DIP above PIP = extended
  // Using both tip→PIP and DIP→PIP for more robust detection
  const indexTipAbovePip = landmarks[8].y < landmarks[6].y - 0.015;
  const indexDipAbovePip = landmarks[7].y < landmarks[6].y - 0.005;
  const index = indexTipAbovePip && indexDipAbovePip;

  const middle = landmarks[12].y < landmarks[10].y - 0.02 && landmarks[11].y < landmarks[10].y - 0.005;
  const ring = landmarks[16].y < landmarks[14].y - 0.02 && landmarks[15].y < landmarks[14].y - 0.005;
  const pinky = landmarks[20].y < landmarks[18].y - 0.02 && landmarks[19].y < landmarks[18].y - 0.005;

  // Index must be straight (not just extended) for drawing:
  // PIP must not be significantly below MCP — ensures finger is pointing, not just partially open
  const pipNotBelowMcp = landmarks[6].y < landmarks[5].y + 0.025;
  const indexStraight = index && pipNotBelowMcp;

  const count = [thumbExtended, index, middle, ring, pinky].filter(Boolean).length;

  return { thumb: thumbExtended, index, middle, ring, pinky, indexStraight, count };
}

/**
 * Classify a hand pose into one of our gesture types.
 * Uses multi-joint analysis and spatial heuristics for robust detection.
 */
function classifyRawGesture(landmarks: Landmark[]): { gesture: Gesture; confidence: number } {
  const state = fingerStates(landmarks);

  // ── Erase: open palm — ALL 5 fingers clearly extended and spread ──
  const allFingersUp = state.thumb && state.index && state.middle && state.ring && state.pinky;
  const spread = Math.abs(landmarks[8].x - landmarks[12].x) > 0.04;
  const spread2 = Math.abs(landmarks[12].x - landmarks[16].x) > 0.03;
  if (allFingersUp && spread && spread2) {
    return { gesture: "erase", confidence: 0.95 };
  }

  // ── Submit: thumbs up — thumb extended upward, other fingers folded ──
  const directThumbUp =
    landmarks[4].y < landmarks[3].y && // thumb tip above IP
    landmarks[4].y < landmarks[5].y - 0.02 && // thumb tip is high
    [
      landmarks[8].y > landmarks[6].y,   // index folded
      landmarks[12].y > landmarks[10].y,  // middle folded
      landmarks[16].y > landmarks[14].y,  // ring folded
      landmarks[20].y > landmarks[18].y,  // pinky folded
    ].filter(Boolean).length >= 3;

  const thumbHigh =
    landmarks[4].y < landmarks[3].y &&
    landmarks[4].y < landmarks[5].y - 0.02;
  const fingersFolded =
    [state.middle, state.ring, state.pinky].filter(Boolean).length <= 1;

  if (directThumbUp || (state.thumb && thumbHigh && fingersFolded)) {
    return { gesture: "submit", confidence: 0.95 };
  }

  // ── Clear: peace sign — index AND middle extended, ring + pinky down ──
  // Require visible spread between index and middle tips
  const peaceSpread = Math.abs(landmarks[8].x - landmarks[12].x) > 0.04 &&
    landmarks[8].y < landmarks[6].y - 0.03 &&
    landmarks[12].y < landmarks[10].y - 0.03;
  if (state.indexStraight && state.middle && !state.ring && !state.pinky && peaceSpread) {
    return { gesture: "clear", confidence: 0.9 };
  }

  // ── Draw: index finger extended, no other fingers up ──
  if (state.indexStraight && !state.middle && !state.ring && !state.pinky) {
    return { gesture: "draw", confidence: 0.85 };
  }

  return { gesture: "idle", confidence: 0.7 };
}

// ─── Gesture debouncing / hysteresis / state anchoring ───

const GESTURE_BUFFER_SIZE = 10;       // frames to buffer for majority vote
const REQUIRED_CONSECUTIVE = 5;       // frames of same gesture needed to switch
const MIN_CONFIDENCE_TO_SWITCH = 0.75; // minimum confidence to allow a gesture switch

let gestureBuffer: { gesture: Gesture; confidence: number }[] = [];
let currentStable: Gesture = "idle";
let consecutiveCount = 0;

/**
 * Classify gesture with temporal debouncing, majority vote, and state anchoring.
 *
 * Requires N consecutive frames of the same gesture before switching,
 * AND the new gesture must meet a minimum confidence threshold.
 * This eliminates flickering between draw/idle/erase during transitions.
 */
export function classifyGesture(landmarks: Landmark[]): Gesture {
  const { gesture: raw, confidence } = classifyRawGesture(landmarks);

  // Buffer for majority vote
  gestureBuffer.push({ gesture: raw, confidence });
  if (gestureBuffer.length > GESTURE_BUFFER_SIZE) {
    gestureBuffer.shift();
  }

  // Count occurrences of each gesture in the buffer, weighted by confidence
  const counts = new Map<Gesture, number>();
  for (const entry of gestureBuffer) {
    counts.set(entry.gesture, (counts.get(entry.gesture) ?? 0) + entry.confidence);
  }

  // Find the majority gesture (highest total confidence weight)
  let majority: Gesture = raw;
  let maxScore = 0;
  for (const [g, score] of counts) {
    if (score > maxScore) {
      maxScore = score;
      majority = g;
    }
  }

  // State anchoring: if the majority differs from current stable,
  // require consecutive frames AND minimum confidence
  if (majority !== currentStable) {
    // Only count if this frame agrees with the majority AND meets confidence threshold
    if (majority === raw && confidence >= MIN_CONFIDENCE_TO_SWITCH) {
      consecutiveCount++;
    } else {
      consecutiveCount = 0;
    }
    if (consecutiveCount >= REQUIRED_CONSECUTIVE) {
      currentStable = majority;
      consecutiveCount = 0;
    }
  } else {
    consecutiveCount = 0;
  }

  return currentStable;
}

/** Reset the gesture debounce state (call when hand is lost). */
export function resetGestureState() {
  gestureBuffer = [];
  currentStable = "idle";
  consecutiveCount = 0;
}

// ─── Velocity-based stroke width ───

/**
 * Calculate stroke width based on movement speed.
 * Slow movement = thick stroke (like pressing a marker down).
 * Fast movement = thin stroke (like a quick flick).
 */
export function strokeWidth(distance: number): number {
  const minWidth = 3;
  const maxWidth = 10;
  const slowThreshold = 4;
  const fastThreshold = 50;

  if (distance <= slowThreshold) return maxWidth;
  if (distance >= fastThreshold) return minWidth;

  const t = (distance - slowThreshold) / (fastThreshold - slowThreshold);
  return maxWidth + (minWidth - maxWidth) * t;
}
