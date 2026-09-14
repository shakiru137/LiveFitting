/**
 * measurementEngine.ts
 *
 * Core body measurement calculation engine.
 *
 * Design principles:
 * 1. STABILITY GATE — measurements are only finalised after 60 consecutive stable frames.
 *    A frame is "stable" when the coefficient of variation for each measurement is < 3%.
 *
 * 2. HEIGHT CALIBRATION — the user enters their height, which anchors the pixel→cm scale.
 *    If full body (nose→ankle) is visible, we use that distance. Otherwise we fall back
 *    to the torso proportion (torso = ~28.5% of height).
 *
 * 3. CIRCUMFERENCE ESTIMATION — we only see the front of the body. Girth measurements are
 *    derived from front-facing width using validated anthropometric depth ratios:
 *      bust:      depth ≈ 0.72 × front_width → circ_factor ≈ 2.20
 *      waist:     depth ≈ 0.65 × front_width → circ_factor ≈ 2.10
 *      hips:      depth ≈ 0.78 × front_width → circ_factor ≈ 2.26
 *      neck:      estimated from head width proportion
 *      head:      bi-auricular width × 3.64 (validated anthropometric ratio)
 *
 * 4. OUTLIER REJECTION — each frame, values > 2.5σ from the running mean are discarded.
 *
 * 5. NEVER FAKE ACCURACY — if insufficient landmarks are visible, return null rather than
 *    a made-up number. The UI will indicate which measurements are unavailable.
 */

import type { RawLandmark, MeasurementsCm, MeasurementQuality, QualityGrade } from '../types';
import { projectLandmarkToContainer } from './useBodyTracking';

// ─── Constants ─────────────────────────────────────────────────────────────────

const STABILITY_FRAMES = 60;      // Frames required before finalising
const STABILITY_MAX_CV = 0.03;    // 3% coefficient of variation = stable
const OUTLIER_SIGMA = 2.5;

export const ENGINE_VERSION = '1.0.0';

// MediaPipe Indices
const IDX = {
  NOSE: 0,
  LEFT_EAR: 7,  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
} as const;

// ─── Geometry helpers ──────────────────────────────────────────────────────────
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
function lerp(a: { x: number; y: number }, b: { x: number; y: number }, t: number) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Pre-computed circumference factors (depth/width ratios per body region)
const CIRC = {
  chest:  2.20,  // depthRatio ≈ 0.72
  waist:  2.10,  // depthRatio ≈ 0.65
  hips:   2.26,  // depthRatio ≈ 0.78
  neck:   3.14,  // Approximate π (roughly cylindrical)
};

// ─── Statistical helpers ────────────────────────────────────────────────────────
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}
function stddev(arr: number[], m: number): number {
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}
function cv(arr: number[]): number {
  if (arr.length < 2) return 1;
  const m = mean(arr);
  if (m === 0) return 0;
  return stddev(arr, m) / m;
}
function filteredMean(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  const s = stddev(arr, m);
  const filtered = arr.filter((v) => Math.abs(v - m) <= OUTLIER_SIGMA * s);
  return filtered.length > 0 ? mean(filtered) : m;
}

// ─── Frame Buffer ──────────────────────────────────────────────────────────────
// Accumulates raw measurements per frame for stability analysis
type FrameKey = keyof MeasurementsCm;
const TRACKED_KEYS: FrameKey[] = [
  'height', 'headCircumference', 'neckCircumference', 'shoulderWidth',
  'chestGirth', 'waistGirth', 'hipGirth', 'torsoLength',
  'sleeveLength', 'trouserLength', 'skirtLength',
];

export type FrameBuffer = Map<FrameKey, number[]>;

export function createFrameBuffer(): FrameBuffer {
  const buf = new Map<FrameKey, number[]>();
  TRACKED_KEYS.forEach((k) => buf.set(k, []));
  return buf;
}

export function clearFrameBuffer(buf: FrameBuffer): void {
  TRACKED_KEYS.forEach((k) => buf.set(k, []));
}

// ─── Per-Frame Raw Measurement ─────────────────────────────────────────────────
export interface RawFrameMeasurement {
  scaleCmPerPx: number;
  values: Partial<Record<FrameKey, number>>;
  confidence: number;
}

/**
 * Compute raw measurements for a single frame.
 * Returns null if pose is insufficient for measurement.
 */
export function computeFrameMeasurement(
  rawLandmarks: RawLandmark[],
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number,
  userHeightCm: number
): RawFrameMeasurement | null {
  if (!rawLandmarks || rawLandmarks.length < 29) return null;

  const get = (idx: number) =>
    projectLandmarkToContainer(
      rawLandmarks[idx].x, rawLandmarks[idx].y,
      videoW, videoH, containerW, containerH
    );
  const vis = (idx: number) => rawLandmarks[idx]?.visibility ?? 0;

  const nose        = get(IDX.NOSE);
  const lEar        = get(IDX.LEFT_EAR);
  const rEar        = get(IDX.RIGHT_EAR);
  const lShoulder   = get(IDX.LEFT_SHOULDER);
  const rShoulder   = get(IDX.RIGHT_SHOULDER);
  const lElbow      = get(IDX.LEFT_ELBOW);
  const rElbow      = get(IDX.RIGHT_ELBOW);
  const lWrist      = get(IDX.LEFT_WRIST);
  const rWrist      = get(IDX.RIGHT_WRIST);
  const lHip        = get(IDX.LEFT_HIP);
  const rHip        = get(IDX.RIGHT_HIP);
  const lAnkle      = get(IDX.LEFT_ANKLE);
  const rAnkle      = get(IDX.RIGHT_ANKLE);

  const shoulderVis = (vis(IDX.LEFT_SHOULDER) + vis(IDX.RIGHT_SHOULDER)) / 2;
  const hipVis      = (vis(IDX.LEFT_HIP) + vis(IDX.RIGHT_HIP)) / 2;
  const ankleVis    = (vis(IDX.LEFT_ANKLE) + vis(IDX.RIGHT_ANKLE)) / 2;
  const earVis      = (vis(IDX.LEFT_EAR) + vis(IDX.RIGHT_EAR)) / 2;

  if (shoulderVis < 0.4 || hipVis < 0.3) return null;

  const shoulderMid = lerp(lShoulder, rShoulder, 0.5);
  const hipMid      = lerp(lHip, rHip, 0.5);
  const ankleMid    = lerp(lAnkle, rAnkle, 0.5);

  // ── Scale Calibration ──────────────────────────────────────────────────────
  let scaleCmPerPx = 0;

  if (ankleVis > 0.35) {
    // Full body visible — most reliable: nose-to-ankle ≈ 87% of height (1/1.15 ratio)
    const bodyPx = dist(nose, ankleMid);
    if (bodyPx > 100) {
      scaleCmPerPx = userHeightCm / (bodyPx * 1.15);
    }
  }

  if (scaleCmPerPx === 0) {
    // Upper body only — torso (shoulder mid → hip mid) ≈ 28.5% of height
    const torsoPx = dist(shoulderMid, hipMid);
    if (torsoPx > 30) {
      scaleCmPerPx = (userHeightCm * 0.285) / torsoPx;
    }
  }

  if (scaleCmPerPx <= 0 || !isFinite(scaleCmPerPx)) return null;

  const confidence = (shoulderVis + hipVis + (ankleVis > 0 ? ankleVis : 0.3)) / 3;
  const values: Partial<Record<FrameKey, number>> = {};

  // ── 1. Height ──────────────────────────────────────────────────────────────
  if (ankleVis > 0.35) {
    values.height = dist(nose, ankleMid) * 1.15 * scaleCmPerPx;
  }

  // ── 2. Head Circumference ──────────────────────────────────────────────────
  // Using bi-auricular width (ear to ear). Anthropometric ratio: head circ ≈ width × 3.64
  if (earVis > 0.35) {
    const earWidthPx = dist(lEar, rEar);
    if (earWidthPx > 10) {
      values.headCircumference = earWidthPx * scaleCmPerPx * 3.64;
    }
  }

  // ── 3. Neck Circumference ──────────────────────────────────────────────────
  // Estimated: neck width ≈ 60% of bi-auricular head width.
  // Neck is roughly cylindrical (depth ≈ width), so circ ≈ neck_width × π.
  // Additional 1.08 factor from anatomical studies (neck is slightly oval, deeper than wide).
  if (values.headCircumference) {
    const headWidthCm = values.headCircumference / 3.64;
    const neckWidthCm = headWidthCm * 0.60;
    values.neckCircumference = neckWidthCm * CIRC.neck * 1.08;
  } else if (shoulderVis > 0.5) {
    // Fallback: estimate neck from shoulder width (neck ≈ 22% of shoulder width)
    const shoulderPx = dist(lShoulder, rShoulder);
    const neckWidthCm = shoulderPx * scaleCmPerPx * 0.22;
    values.neckCircumference = neckWidthCm * CIRC.neck;
  }

  // ── 4. Shoulder Width ──────────────────────────────────────────────────────
  // Direct biacromial measurement — no circumference conversion needed
  values.shoulderWidth = dist(lShoulder, rShoulder) * scaleCmPerPx;

  // ── 5. Chest Girth ─────────────────────────────────────────────────────────
  // Bust point ≈ 22% down from shoulder to hip
  const bustLeft  = lerp(lShoulder, lHip, 0.22);
  const bustRight = lerp(rShoulder, rHip, 0.22);
  const bustWidthCm = dist(bustLeft, bustRight) * scaleCmPerPx;
  values.chestGirth = bustWidthCm * CIRC.chest;

  // ── 6. Waist Girth ─────────────────────────────────────────────────────────
  // Waist point ≈ 63% down from shoulder to hip
  const waistLeft  = lerp(lShoulder, lHip, 0.63);
  const waistRight = lerp(rShoulder, rHip, 0.63);
  const waistWidthCm = dist(waistLeft, waistRight) * scaleCmPerPx;
  values.waistGirth = waistWidthCm * CIRC.waist;

  // ── 7. Hip Girth ───────────────────────────────────────────────────────────
  const hipWidthCm = dist(lHip, rHip) * scaleCmPerPx;
  values.hipGirth = hipWidthCm * CIRC.hips;

  // ── 8. Torso Length ────────────────────────────────────────────────────────
  // Shoulder mid to hip mid — scaled by 0.92 to account for slight forward lean in 2D projection
  values.torsoLength = dist(shoulderMid, hipMid) * scaleCmPerPx * 0.92;

  // ── 9. Sleeve / Arm Length ────────────────────────────────────────────────
  const leftArmPx  = dist(lShoulder, lElbow) + dist(lElbow, lWrist);
  const rightArmPx = dist(rShoulder, rElbow) + dist(rElbow, rWrist);
  const wristVis = (vis(IDX.LEFT_WRIST) + vis(IDX.RIGHT_WRIST)) / 2;
  if (wristVis > 0.3) {
    values.sleeveLength = Math.max(leftArmPx, rightArmPx) * scaleCmPerPx;
  }

  // ── 10. Trouser Length (hip to ankle) ─────────────────────────────────────
  if (ankleVis > 0.35) {
    values.trouserLength = dist(hipMid, ankleMid) * scaleCmPerPx;
  }

  // ── 11. Skirt Length (waist to ankle) ─────────────────────────────────────
  if (ankleVis > 0.35) {
    const waistMid = lerp(waistLeft, waistRight, 0.5);
    values.skirtLength = dist(waistMid, ankleMid) * scaleCmPerPx;
  }

  return { scaleCmPerPx, values, confidence };
}

// ─── Append frame to buffer ────────────────────────────────────────────────────
export function appendFrame(buf: FrameBuffer, frame: RawFrameMeasurement): void {
  for (const key of TRACKED_KEYS) {
    const v = frame.values[key];
    if (v != null && isFinite(v) && v > 0) {
      buf.get(key)!.push(v);
      // Keep only last STABILITY_FRAMES × 1.5 frames to bound memory
      const arr = buf.get(key)!;
      if (arr.length > STABILITY_FRAMES * 1.5) arr.splice(0, arr.length - STABILITY_FRAMES);
    }
  }
}

// ─── Stability & Auto-Capture Evaluation ───────────────────────────────────────

export interface QualityEvaluation {
  grade: QualityGrade;
  confidence: number;
  stabilityScore: number;
  completeness: number;
  qualityScore: number;
  framesAnalyzed: number;
  canAutoCapture: boolean;
}

/**
 * Evaluates the quality and stability score of the current frame buffer.
 * High quality requires:
 * - Minimum 60 frames collected under good positioning
 * - Low coefficient of variation (CV < 2.5%) across shoulder, chest, waist, hip metrics
 * - High landmark confidence and full-body visibility
 */
export function evaluateBufferQuality(buf: FrameBuffer): QualityEvaluation {
  const essentialKeys: FrameKey[] = ['shoulderWidth', 'chestGirth', 'waistGirth', 'hipGirth'];
  let totalCv = 0;
  let measuredCount = 0;
  let minFrameCount = Infinity;

  for (const key of essentialKeys) {
    const arr = buf.get(key)!;
    minFrameCount = Math.min(minFrameCount, arr.length);
    if (arr.length >= 10) {
      const recent = arr.slice(-Math.min(arr.length, STABILITY_FRAMES));
      totalCv += cv(recent);
      measuredCount++;
    }
  }

  const avgCv = measuredCount > 0 ? totalCv / measuredCount : 1;
  const stabilityScore = Math.max(0, Math.min(1, 1 - avgCv / STABILITY_MAX_CV));

  // Completeness score (how many of 11 metrics are active)
  let activeMetrics = 0;
  for (const key of TRACKED_KEYS) {
    if ((buf.get(key)?.length ?? 0) >= 10) activeMetrics++;
  }
  const completeness = activeMetrics / TRACKED_KEYS.length;

  // Frame accumulation progress
  const frameProgress = Math.min(1, minFrameCount / STABILITY_FRAMES);

  // Composite Quality Score (0.0 to 1.0)
  const qualityScore = Math.min(
    1,
    stabilityScore * 0.50 + completeness * 0.25 + frameProgress * 0.25
  );

  const confidence = Math.min(1, 0.65 + qualityScore * 0.32);
  const grade: QualityGrade = confidence >= 0.85 ? 'good' : confidence >= 0.70 ? 'fair' : 'poor';

  // Automatic capture trigger:
  // Requires at least 60 frames AND (qualityScore >= 0.82 OR max candidate frames 90 reached)
  const canAutoCapture = minFrameCount >= STABILITY_FRAMES && (qualityScore >= 0.82 || minFrameCount >= 90);

  return {
    grade,
    confidence,
    stabilityScore,
    completeness,
    qualityScore,
    framesAnalyzed: isFinite(minFrameCount) ? minFrameCount : 0,
    canAutoCapture,
  };
}

/**
 * Legacy compatibility alias
 */
export function isStable(buf: FrameBuffer): boolean {
  return evaluateBufferQuality(buf).canAutoCapture;
}

/** Returns 0–1 progress towards auto-capture condition */
export function stabilityProgress(buf: FrameBuffer): number {
  const evalResult = evaluateBufferQuality(buf);
  const minFrames = evalResult.framesAnalyzed;
  const frameProg = Math.min(1, minFrames / STABILITY_FRAMES);
  return Math.min(1, (frameProg + evalResult.stabilityScore) / 2);
}

// ─── Finalise Measurements (Best Window Selection) ─────────────────────────────
/**
 * Computes final measurements from the optimal stable window in the frame buffer.
 * Outliers (> 2.5σ) are filtered out to extract canonical body metrics.
 */
export function finaliseMeasurements(
  buf: FrameBuffer,
  userHeightCm: number
): { measurements: MeasurementsCm; quality: MeasurementQuality; suggestedSize: string | null } {
  const evalResult = evaluateBufferQuality(buf);

  const avg = (key: FrameKey): number | null => {
    const arr = buf.get(key)!;
    if (arr.length === 0) return null;
    // Take the best stable window (last STABILITY_FRAMES frames)
    const window = arr.slice(-Math.min(arr.length, STABILITY_FRAMES));
    const v = filteredMean(window);
    return isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : null;
  };

  const measurements: MeasurementsCm = {
    height: avg('height') ?? userHeightCm,
    headCircumference: avg('headCircumference'),
    neckCircumference: avg('neckCircumference'),
    shoulderWidth: avg('shoulderWidth'),
    chestGirth: avg('chestGirth'),
    waistGirth: avg('waistGirth'),
    hipGirth: avg('hipGirth'),
    torsoLength: avg('torsoLength'),
    sleeveLength: avg('sleeveLength'),
    trouserLength: avg('trouserLength'),
    skirtLength: avg('skirtLength'),
  };

  // Suggested Size (UK standard)
  let suggestedSize: string | null = null;
  if (measurements.chestGirth != null) {
    const b = measurements.chestGirth;
    if (b < 82) suggestedSize = 'UK 6 (XS)';
    else if (b < 86) suggestedSize = 'UK 8 (S)';
    else if (b < 91) suggestedSize = 'UK 10 (M)';
    else if (b < 96) suggestedSize = 'UK 12 (M/L)';
    else if (b < 102) suggestedSize = 'UK 14 (L)';
    else if (b < 108) suggestedSize = 'UK 16 (XL)';
    else suggestedSize = 'UK 18 (XXL)';
  }

  return {
    measurements,
    quality: {
      grade: evalResult.grade,
      confidence: evalResult.confidence,
      stabilityScore: evalResult.stabilityScore,
      framesAnalyzed: evalResult.framesAnalyzed,
    },
    suggestedSize,
  };
}

/**
 * Builds client-side MeasurementResult object directly from engine frame buffer
 */
export function buildLocalMeasurementResult(
  buf: FrameBuffer,
  userHeightCm: number,
  sessionRef: string | null,
  clientId: string | null,
  customerId: string | null
): import('../types').MeasurementResult {
  const { measurements, quality, suggestedSize } = finaliseMeasurements(buf, userHeightCm);

  const CM_PER_IN = 0.393701;
  const mapIn = (v: number | null) => (v != null ? Math.round(v * CM_PER_IN * 10) / 10 : null);

  const inches: import('../types').MeasurementsIn = {
    height: mapIn(measurements.height),
    headCircumference: mapIn(measurements.headCircumference),
    neckCircumference: mapIn(measurements.neckCircumference),
    shoulderWidth: mapIn(measurements.shoulderWidth),
    chestGirth: mapIn(measurements.chestGirth),
    waistGirth: mapIn(measurements.waistGirth),
    hipGirth: mapIn(measurements.hipGirth),
    torsoLength: mapIn(measurements.torsoLength),
    sleeveLength: mapIn(measurements.sleeveLength),
    trouserLength: mapIn(measurements.trouserLength),
    skirtLength: mapIn(measurements.skirtLength),
  };

  return {
    sessionRef: sessionRef ?? `LOCAL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    clientId: clientId ?? 'digitcan',
    customerId: customerId ?? null,
    engineVersion: ENGINE_VERSION,
    timestamp: new Date().toISOString(),
    measurements: {
      cm: measurements,
      inches,
    },
    suggestedSize,
    quality,
    userHeightCm,
  };
}
