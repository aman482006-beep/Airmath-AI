/**
 * Stroke Predictor — extrapolates where the fingertip is heading
 * based on recent velocity history, so the drawn line leads ahead
 * of the actual hand position for a more responsive feel.
 *
 * Uses a simple linear regression over recent positions to estimate
 * the velocity vector, then projects forward by a small time offset.
 */

interface Vec2 {
  x: number;
  y: number;
}

interface Sample {
  x: number;
  y: number;
  t: number;
}

const HISTORY_SIZE = 4; // number of recent samples to fit
const PREDICTION_MS = 25; // how far ahead to project (ms)

export class StrokePredictor {
  private history: Sample[] = [];

  /** Feed a new filtered position and get back the predicted position. */
  predict(sample: Vec2): Vec2 {
    const now = performance.now();
    this.history.push({ x: sample.x, y: sample.y, t: now });
    if (this.history.length > HISTORY_SIZE) {
      this.history.shift();
    }

    if (this.history.length < 3) {
      return sample; // not enough data yet
    }

    // Linear regression over recent positions to estimate velocity
    const n = this.history.length;
    const t0 = this.history[0].t;
    let sumT = 0;
    let sumX = 0;
    let sumY = 0;
    let sumTT = 0;
    let sumTX = 0;
    let sumTY = 0;

    for (const s of this.history) {
      const dt = s.t - t0;
      sumT += dt;
      sumX += s.x;
      sumY += s.y;
      sumTT += dt * dt;
      sumTX += dt * s.x;
      sumTY += dt * s.y;
    }

    const denom = n * sumTT - sumT * sumT;
    if (Math.abs(denom) < 1e-6) return sample;

    // Velocity (pixels per ms)
    const vx = (n * sumTX - sumT * sumX) / denom;
    const vy = (n * sumTY - sumT * sumY) / denom;

    // Project forward by PREDICTION_MS, but clamp to avoid overshooting
    const maxLead = 25; // max pixels ahead
    const leadX = Math.max(-maxLead, Math.min(maxLead, vx * PREDICTION_MS));
    const leadY = Math.max(-maxLead, Math.min(maxLead, vy * PREDICTION_MS));

    return {
      x: sample.x + leadX,
      y: sample.y + leadY,
    };
  }

  reset() {
    this.history = [];
  }
}
