/**
 * One-Euro Filter — the industry standard for low-latency, low-jitter cursor smoothing.
 *
 * It adapts its cutoff frequency based on speed:
 *   - When the hand is still → low cutoff → heavy smoothing (kills jitter)
 *   - When the hand moves fast → high cutoff → minimal lag (stays responsive)
 *
 * Reference: https://hal.inria.fr/hal-00670496/document
 */

export class OneEuroFilter {
  private x: OneEuroAxis;
  private y: OneEuroAxis;

  constructor(params?: OneEuroParams) {
    this.x = new OneEuroAxis(params);
    this.y = new OneEuroAxis(params);
  }

  /** Feed a new (x, y) sample and get the filtered position back. */
  filter(sample: { x: number; y: number }): { x: number; y: number } {
    return {
      x: this.x.filter(sample.x),
      y: this.y.filter(sample.y),
    };
  }

  reset() {
    this.x.reset();
    this.y.reset();
  }
}

class OneEuroAxis {
  private readonly minCutoff: number;
  private readonly beta: number;
  private readonly dCutoff: number;

  private prev: number | null = null;
  private prevDt: number | null = null;
  private prevDeriv: number | null = null;
  private isFirst: boolean = true;

  constructor(params?: OneEuroParams) {
    this.minCutoff = params?.minCutoff ?? 1.7;
    this.beta = params?.beta ?? 0.3;
    this.dCutoff = params?.dCutoff ?? 1.0;

  }

  filter(sample: number): number {
    const now = performance.now();
    const dt = this.prevDt !== null ? (now - this.prevDt) / 1000 : 1 / 60;
    this.prevDt = now;

    if (this.isFirst || this.prev === null) {
      this.prev = sample;
      this.prevDeriv = 0;
      this.isFirst = false;
      return sample;
    }

    // Estimate derivative (low-pass filtered)
    const dx = (sample - this.prev) / Math.max(dt, 1e-6);
    const alphaD = this._smoothingFactor(dt, this.dCutoff);
    const deriv = alphaD * dx + (1 - alphaD) * (this.prevDeriv ?? 0);
    this.prevDeriv = deriv;

    // Adaptive cutoff: speed-dependent
    const speed = Math.abs(deriv);
    const cutoff = this.minCutoff + this.beta * speed;

    // Filter the value
    const alpha = this._smoothingFactor(dt, cutoff);
    const filtered = alpha * sample + (1 - alpha) * this.prev;
    this.prev = filtered;

    return filtered;
  }

  reset() {
    this.prev = null;
    this.prevDt = null;
    this.prevDeriv = null;
    this.isFirst = true;
  }

  private _smoothingFactor(dt: number, cutoff: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / Math.max(dt, 1e-6));
  }
}

export interface OneEuroParams {
  /** Lower = smoother but more lag (default 1.7) */
  minCutoff?: number;
  /** Higher = more responsive to fast movements (default 0.3) */
  beta?: number;
  /** Cutoff for derivative smoothing (default 1.0) */
  dCutoff?: number;

}
