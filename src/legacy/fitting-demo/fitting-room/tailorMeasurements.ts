import type { RawLandmark } from './useBodyTracking';
import { projectLandmarkToContainer } from './useBodyTracking';

export interface Point2D {
  x: number;
  y: number;
}

export interface TailorMeasurements {
  shoulderWidthCm: number;
  shoulderWidthIn: number;
  bustGirthCm: number;
  bustGirthIn: number;
  underbustGirthCm: number;
  underbustGirthIn: number;
  waistGirthCm: number;
  waistGirthIn: number;
  hipGirthCm: number;
  hipGirthIn: number;
  torsoLengthCm: number;
  torsoLengthIn: number;
  sleeveLengthCm: number;
  sleeveLengthIn: number;
  skirtLengthCm: number;
  skirtLengthIn: number;
  suggestedSize: string;
  isPoseValid: boolean;
  heightCm: number;
  points: {
    leftShoulder: Point2D;
    rightShoulder: Point2D;
    bustLeft: Point2D;
    bustRight: Point2D;
    waistLeft: Point2D;
    waistRight: Point2D;
    hipLeft: Point2D;
    hipRight: Point2D;
    neck: Point2D;
    waistMid: Point2D;
    leftElbow: Point2D;
    leftWrist: Point2D;
    rightElbow: Point2D;
    rightWrist: Point2D;
    leftAnkle: Point2D;
    rightAnkle: Point2D;
  };
}

function dist(p1: Point2D, p2: Point2D): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerpPoint(p1: Point2D, p2: Point2D, t: number): Point2D {
  return {
    x: p1.x + (p2.x - p1.x) * t,
    y: p1.y + (p2.y - p1.y) * t,
  };
}

const CM_TO_INCH = 0.393701;

// Simple exponential smoothing cache for stable numbers
let prevMeasurements: TailorMeasurements | null = null;

export function resetTailorSmoothing() {
  prevMeasurements = null;
}

export function computeTailorMeasurements(
  rawLandmarks: RawLandmark[] | null,
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number,
  userHeightCm: number = 168
): TailorMeasurements | null {
  if (!rawLandmarks || rawLandmarks.length < 29) {
    return prevMeasurements ? { ...prevMeasurements, isPoseValid: false } : null;
  }

  // Helper to project landmark index
  const getP = (idx: number): Point2D => {
    const lm = rawLandmarks[idx];
    return projectLandmarkToContainer(lm.x, lm.y, videoW, videoH, containerW, containerH);
  };

  const nose = getP(0);
  const leftShoulder = getP(11);
  const rightShoulder = getP(12);
  const leftElbow = getP(13);
  const rightElbow = getP(14);
  const leftWrist = getP(15);
  const rightWrist = getP(16);
  const leftHip = getP(23);
  const rightHip = getP(24);
  const leftAnkle = getP(27);
  const rightAnkle = getP(28);

  const shoulderMid = lerpPoint(leftShoulder, rightShoulder, 0.5);
  const hipMid = lerpPoint(leftHip, rightHip, 0.5);
  const ankleMid = lerpPoint(leftAnkle, rightAnkle, 0.5);

  // Check landmark visibilities if present
  const shoulderVis = ((rawLandmarks[11].visibility ?? 1) + (rawLandmarks[12].visibility ?? 1)) / 2;
  const hipVis = ((rawLandmarks[23].visibility ?? 1) + (rawLandmarks[24].visibility ?? 1)) / 2;
  const ankleVis = ((rawLandmarks[27].visibility ?? 1) + (rawLandmarks[28].visibility ?? 1)) / 2;

  const isPoseValid = shoulderVis > 0.4 && hipVis > 0.4;

  // Derive pixels-to-cm scale ratio based on height calibration
  let scaleCmPerPx = 0.2; // default fallback

  if (ankleVis > 0.4 && dist(nose, ankleMid) > 50) {
    // Full body detected: nose to ankles is ~87% of full height
    const fullBodyPx = dist(nose, ankleMid) * 1.15;
    scaleCmPerPx = userHeightCm / fullBodyPx;
  } else {
    // Upper body detected: torso height (shoulder mid to hip mid) is ~28.5% of total height
    const torsoPx = dist(shoulderMid, hipMid);
    if (torsoPx > 30) {
      const targetTorsoCm = userHeightCm * 0.285;
      scaleCmPerPx = targetTorsoCm / torsoPx;
    }
  }

  // 1. Cross Shoulder Width (Shoulder point to Shoulder point)
  const shoulderPx = dist(leftShoulder, rightShoulder);
  const rawShoulderCm = shoulderPx * scaleCmPerPx;

  // 2. Torso / Back Length (Neck/Shoulder mid to Waist mid)
  const rawTorsoCm = dist(shoulderMid, hipMid) * scaleCmPerPx * 0.92;

  // Contour points along torso
  const bustLeft = lerpPoint(leftShoulder, leftHip, 0.22);
  const bustRight = lerpPoint(rightShoulder, rightHip, 0.22);
  const underbustLeft = lerpPoint(leftShoulder, leftHip, 0.42);
  const underbustRight = lerpPoint(rightShoulder, rightHip, 0.42);
  const waistLeft = lerpPoint(leftShoulder, leftHip, 0.65);
  const waistRight = lerpPoint(rightShoulder, rightHip, 0.65);

  // 3. Bust Girth (Circumference)
  const bustWidthPx = dist(bustLeft, bustRight);
  const rawBustCm = bustWidthPx * scaleCmPerPx * 2.24;

  // 4. Underbust Girth
  const underbustWidthPx = dist(underbustLeft, underbustRight);
  const rawUnderbustCm = underbustWidthPx * scaleCmPerPx * 2.14;

  // 5. Waist Girth
  const waistWidthPx = dist(waistLeft, waistRight);
  const rawWaistCm = waistWidthPx * scaleCmPerPx * 2.18;

  // 6. Hip Girth
  const hipWidthPx = dist(leftHip, rightHip);
  const rawHipCm = hipWidthPx * scaleCmPerPx * 2.30;

  // 7. Sleeve / Arm Length (Shoulder -> Elbow -> Wrist)
  const leftArmPx = dist(leftShoulder, leftElbow) + dist(leftElbow, leftWrist);
  const rightArmPx = dist(rightShoulder, rightElbow) + dist(rightElbow, rightWrist);
  const rawSleeveCm = Math.max(leftArmPx, rightArmPx) * scaleCmPerPx;

  // 8. Skirt / Floor Length
  const rawSkirtCm = (dist(hipMid, ankleMid) * scaleCmPerPx) || (rawTorsoCm * 1.75);

  // Suggested dress size calculator (UK standard)
  let suggestedSize = 'UK 8';
  if (rawBustCm < 82) suggestedSize = 'UK 6 (XS)';
  else if (rawBustCm < 86) suggestedSize = 'UK 8 (S)';
  else if (rawBustCm < 91) suggestedSize = 'UK 10 (M)';
  else if (rawBustCm < 96) suggestedSize = 'UK 12 (M/L)';
  else if (rawBustCm < 102) suggestedSize = 'UK 14 (L)';
  else suggestedSize = 'UK 16 (XL)';

  // Apply smooth temporal filtering (alpha = 0.15) to eliminate jitter
  const alpha = prevMeasurements ? 0.15 : 1.0;
  const smooth = (val: number, prevVal?: number) => {
    if (prevVal === undefined) return val;
    return prevVal + (val - prevVal) * alpha;
  };

  const pM = prevMeasurements;

  const shoulderWidthCm = smooth(rawShoulderCm, pM?.shoulderWidthCm);
  const bustGirthCm     = smooth(rawBustCm, pM?.bustGirthCm);
  const underbustGirthCm = smooth(rawUnderbustCm, pM?.underbustGirthCm);
  const waistGirthCm    = smooth(rawWaistCm, pM?.waistGirthCm);
  const hipGirthCm      = smooth(rawHipCm, pM?.hipGirthCm);
  const torsoLengthCm   = smooth(rawTorsoCm, pM?.torsoLengthCm);
  const sleeveLengthCm  = smooth(rawSleeveCm, pM?.sleeveLengthCm);
  const skirtLengthCm   = smooth(rawSkirtCm, pM?.skirtLengthCm);

  const current: TailorMeasurements = {
    shoulderWidthCm,
    shoulderWidthIn: shoulderWidthCm * CM_TO_INCH,
    bustGirthCm,
    bustGirthIn: bustGirthCm * CM_TO_INCH,
    underbustGirthCm,
    underbustGirthIn: underbustGirthCm * CM_TO_INCH,
    waistGirthCm,
    waistGirthIn: waistGirthCm * CM_TO_INCH,
    hipGirthCm,
    hipGirthIn: hipGirthCm * CM_TO_INCH,
    torsoLengthCm,
    torsoLengthIn: torsoLengthCm * CM_TO_INCH,
    sleeveLengthCm,
    sleeveLengthIn: sleeveLengthCm * CM_TO_INCH,
    skirtLengthCm,
    skirtLengthIn: skirtLengthCm * CM_TO_INCH,
    suggestedSize,
    isPoseValid,
    heightCm: userHeightCm,
    points: {
      leftShoulder,
      rightShoulder,
      bustLeft,
      bustRight,
      waistLeft,
      waistRight,
      hipLeft: leftHip,
      hipRight: rightHip,
      neck: shoulderMid,
      waistMid: lerpPoint(waistLeft, waistRight, 0.5),
      leftElbow,
      leftWrist,
      rightElbow,
      rightWrist,
      leftAnkle,
      rightAnkle,
    },
  };

  prevMeasurements = current;
  return current;
}

/**
 * Draws tailor measuring tape lines and callout badges on top of the 2D canvas overlay.
 */
export function drawTailorOverlayLines(
  ctx: CanvasRenderingContext2D,
  measurements: TailorMeasurements,
  unitMode: 'cm' | 'in' | 'both' = 'both'
) {
  const { points } = measurements;
  const formatVal = (cm: number, inch: number) => {
    if (unitMode === 'cm') return `${cm.toFixed(1)} cm`;
    if (unitMode === 'in') return `${inch.toFixed(1)} in`;
    return `${cm.toFixed(1)} cm / ${inch.toFixed(1)}"`;
  };

  ctx.save();

  // Helper for drawing measuring tape dashed lines with end crosshair ticks
  const drawTapeLine = (
    p1: Point2D,
    p2: Point2D,
    label: string,
    valText: string,
    color: string = '#E5C158',
    labelSide: 'top' | 'bottom' | 'right' | 'left' = 'top'
  ) => {
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;

    // 1. Draw dashed measuring line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. Draw end ticks / crosshairs
    const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const tickLen = 8;
    [p1, p2].forEach((pt) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pt.x - Math.sin(angle) * tickLen, pt.y + Math.cos(angle) * tickLen);
      ctx.lineTo(pt.x + Math.sin(angle) * tickLen, pt.y - Math.cos(angle) * tickLen);
      ctx.stroke();
    });

    // 3. Draw measurement badge callout
    const fullText = `${label}: ${valText}`;
    ctx.font = 'bold 10px monospace';
    const textWidth = ctx.measureText(fullText).width;
    const paddingH = 8;
    const badgeW = textWidth + paddingH * 2;
    const badgeH = 20;

    let badgeX = midX - badgeW / 2;
    let badgeY = midY - badgeH / 2;
    if (labelSide === 'top') badgeY = midY - 18;
    if (labelSide === 'bottom') badgeY = midY + 8;
    if (labelSide === 'right') badgeX = Math.max(p1.x, p2.x) + 12;

    // Pill background
    ctx.fillStyle = 'rgba(18, 18, 18, 0.88)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    // Text inside pill
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(fullText, badgeX + badgeW / 2, badgeY + badgeH / 2);
  };

  // 1. Cross Shoulder Width Tape Line
  drawTapeLine(
    points.leftShoulder,
    points.rightShoulder,
    'SHOULDER',
    formatVal(measurements.shoulderWidthCm, measurements.shoulderWidthIn),
    '#E5C158',
    'top'
  );

  // 2. Bust Line Tape
  drawTapeLine(
    points.bustLeft,
    points.bustRight,
    'BUST',
    formatVal(measurements.bustGirthCm, measurements.bustGirthIn),
    '#D8B4A0',
    'bottom'
  );

  // 3. Waist Line Tape
  drawTapeLine(
    points.waistLeft,
    points.waistRight,
    'WAIST',
    formatVal(measurements.waistGirthCm, measurements.waistGirthIn),
    '#4ADE80',
    'top'
  );

  // 4. Hip Line Tape
  drawTapeLine(
    points.hipLeft,
    points.hipRight,
    'HIPS',
    formatVal(measurements.hipGirthCm, measurements.hipGirthIn),
    '#38BDF8',
    'bottom'
  );

  // 5. Sleeve / Arm Tape Line (Shoulder -> Elbow -> Wrist)
  ctx.strokeStyle = '#F472B6';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(points.leftShoulder.x, points.leftShoulder.y);
  ctx.lineTo(points.leftElbow.x, points.leftElbow.y);
  ctx.lineTo(points.leftWrist.x, points.leftWrist.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Arm label badge
  const armMid = points.leftElbow;
  const armText = `SLEEVE: ${formatVal(measurements.sleeveLengthCm, measurements.sleeveLengthIn)}`;
  ctx.font = 'bold 9px monospace';
  const armW = ctx.measureText(armText).width + 12;
  ctx.fillStyle = 'rgba(18,18,18,0.85)';
  ctx.strokeStyle = '#F472B6';
  ctx.beginPath();
  ctx.roundRect(armMid.x + 10, armMid.y - 10, armW, 18, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(armText, armMid.x + 16, armMid.y - 1);

  // 6. Torso Back Length Spine Line (Neck mid to Waist mid)
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(points.neck.x, points.neck.y);
  ctx.lineTo(points.waistMid.x, points.waistMid.y);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.restore();
}
