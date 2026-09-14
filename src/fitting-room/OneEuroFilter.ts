/** One Euro Filter — low-latency adaptive smoother for tracking data. */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xPrev: number | null = null;
  private dxPrev = 0;
  private tPrev: number | null = null;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
  }

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  filter(x: number, timestamp: number): number {
    const dt = this.tPrev !== null ? Math.max(timestamp - this.tPrev, 0.001) : 0.016;
    this.tPrev = timestamp;
    const dxRaw = this.xPrev !== null ? (x - this.xPrev) / dt : 0;
    const aDeriv = this.alpha(this.dCutoff, dt);
    this.dxPrev = aDeriv * dxRaw + (1 - aDeriv) * this.dxPrev;
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dxPrev);
    const aSmooth = this.alpha(cutoff, dt);
    const result = this.xPrev !== null ? aSmooth * x + (1 - aSmooth) * this.xPrev : x;
    this.xPrev = result;
    return result;
  }

  reset() {
    this.xPrev = null;
    this.dxPrev = 0;
    this.tPrev = null;
  }
}

/** Per-landmark 2D filter pair. */
export class LandmarkFilter2D {
  readonly fx = new OneEuroFilter();
  readonly fy = new OneEuroFilter();

  filter(x: number, y: number, t: number): { x: number; y: number } {
    return { x: this.fx.filter(x, t), y: this.fy.filter(y, t) };
  }

  reset() {
    this.fx.reset();
    this.fy.reset();
  }
}

/** Creates a map of named LandmarkFilter2D entries. */
export function createPoseFilters(keys: string[]): Record<string, LandmarkFilter2D> {
  return Object.fromEntries(keys.map((k) => [k, new LandmarkFilter2D()]));
}
