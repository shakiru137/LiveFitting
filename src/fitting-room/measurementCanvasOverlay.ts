/**
 * measurementCanvasOverlay.ts
 *
 * Real-time computer vision rendering engine.
 * Draws MediaPipe body landmarks, skeletal tracking lines, measurement callout tapes,
 * and metric status HUD directly onto the HTML5 Canvas every frame.
 */

import type { RawLandmark } from './useBodyTracking';
import { projectLandmarkToContainer } from './useBodyTracking';
import type { PositionStatus, MeasurementPhase } from '../types';

interface DrawOverlayOptions {
  ctx: CanvasRenderingContext2D;
  rawLandmarks: RawLandmark[] | null;
  videoW: number;
  videoH: number;
  canvasW: number;
  canvasH: number;
  posStatus: PositionStatus | null;
  frameValues: Partial<Record<string, number>> | null;
  bufferedMeans: Partial<Record<string, number>> | null;
  progress: number;
  phase: MeasurementPhase;
}

// MediaPipe Indices
const IDX = {
  NOSE: 0,
  LEFT_EYE: 2,       RIGHT_EYE: 5,
  LEFT_EAR: 7,       RIGHT_EAR: 8,
  MOUTH_LEFT: 9,     MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,    RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,    RIGHT_WRIST: 16,
  LEFT_PINKY: 17,    RIGHT_PINKY: 18,
  LEFT_INDEX: 19,    RIGHT_INDEX: 20,
  LEFT_HIP: 23,      RIGHT_HIP: 24,
  LEFT_KNEE: 25,     RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,    RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,     RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

// Joint connections for drawing skeleton
const SKELETON_PAIRS: [number, number][] = [
  // Facial / Head
  [IDX.NOSE, IDX.LEFT_EYE], [IDX.NOSE, IDX.RIGHT_EYE],
  [IDX.LEFT_EYE, IDX.LEFT_EAR], [IDX.RIGHT_EYE, IDX.RIGHT_EAR],
  // Shoulders & Arms
  [IDX.LEFT_SHOULDER, IDX.RIGHT_SHOULDER],
  [IDX.LEFT_SHOULDER, IDX.LEFT_ELBOW], [IDX.LEFT_ELBOW, IDX.LEFT_WRIST],
  [IDX.RIGHT_SHOULDER, IDX.RIGHT_ELBOW], [IDX.RIGHT_ELBOW, IDX.RIGHT_WRIST],
  // Torso
  [IDX.LEFT_SHOULDER, IDX.LEFT_HIP], [IDX.RIGHT_SHOULDER, IDX.RIGHT_HIP],
  [IDX.LEFT_HIP, IDX.RIGHT_HIP],
  // Legs
  [IDX.LEFT_HIP, IDX.LEFT_KNEE], [IDX.LEFT_KNEE, IDX.LEFT_ANKLE],
  [IDX.RIGHT_HIP, IDX.RIGHT_KNEE], [IDX.RIGHT_KNEE, IDX.RIGHT_ANKLE],
  [IDX.LEFT_ANKLE, IDX.LEFT_FOOT_INDEX], [IDX.RIGHT_ANKLE, IDX.RIGHT_FOOT_INDEX],
];

const fmtVal = (val: number | undefined | null, unit = 'cm'): string =>
  val != null && isFinite(val) && val > 0 ? `${val.toFixed(1)} ${unit}` : 'Measuring…';

export function drawComputerVisionOverlay(options: DrawOverlayOptions): void {
  const {
    ctx, rawLandmarks, videoW, videoH, canvasW, canvasH,
    posStatus, frameValues, bufferedMeans, progress, phase
  } = options;

  if (!rawLandmarks || rawLandmarks.length < 29) return;

  const project = (idx: number) => {
    const lm = rawLandmarks[idx];
    if (!lm) return null;
    return {
      ...projectLandmarkToContainer(lm.x, lm.y, videoW, videoH, canvasW, canvasH),
      vis: lm.visibility ?? 0,
    };
  };

  // Helper for midpoints
  const mid = (a: { x: number; y: number }, b: { x: number; y: number }, t = 0.5) => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  });

  const isPositioned = posStatus?.isReady ?? false;
  const mainColor    = isPositioned ? '#4ADE80' : '#E5C158'; // Green if ready, Gold if positioning
  const lineDash     = isPositioned ? [] : [4, 4];

  ctx.save();

  // ── 1. Draw Skeleton Lines ───────────────────────────────────────────────────
  ctx.lineWidth = 2;
  ctx.strokeStyle = isPositioned ? 'rgba(74, 222, 128, 0.45)' : 'rgba(229, 193, 88, 0.35)';
  ctx.setLineDash(lineDash);

  for (const [i1, i2] of SKELETON_PAIRS) {
    const p1 = project(i1);
    const p2 = project(i2);
    if (p1 && p2 && p1.vis > 0.3 && p2.vis > 0.3) {
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);

  // ── 2. Draw Landmark Dots ─────────────────────────────────────────────────────
  for (let i = 0; i < rawLandmarks.length; i++) {
    const p = project(i);
    if (p && p.vis > 0.35) {
      // Glow outer circle
      ctx.fillStyle = isPositioned ? 'rgba(74, 222, 128, 0.25)' : 'rgba(229, 193, 88, 0.25)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
      ctx.fill();

      // Solid inner dot
      ctx.fillStyle = mainColor;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── 3. Draw Measurement Guide Lines & Live Value Badges ─────────────────────
  const lShoulder = project(IDX.LEFT_SHOULDER);
  const rShoulder = project(IDX.RIGHT_SHOULDER);
  const lHip      = project(IDX.LEFT_HIP);
  const rHip      = project(IDX.RIGHT_HIP);
  const nose      = project(IDX.NOSE);
  const lEar      = project(IDX.LEFT_EAR);
  const rEar      = project(IDX.RIGHT_EAR);
  const lWrist    = project(IDX.LEFT_WRIST);
  const lElbow    = project(IDX.LEFT_ELBOW);
  const lAnkle    = project(IDX.LEFT_ANKLE);

  const activeVals = bufferedMeans || frameValues || {};

  // (a) Shoulder Width Tape Line
  if (lShoulder && rShoulder && lShoulder.vis > 0.4 && rShoulder.vis > 0.4) {
    drawTapeLine(
      ctx, lShoulder, rShoulder,
      'Shoulder', fmtVal(activeVals.shoulderWidth),
      '#D8B4A0'
    );
  }

  // (b) Chest / Bust Tape Line (22% down torso)
  if (lShoulder && rShoulder && lHip && rHip) {
    const chestL = mid(lShoulder, lHip, 0.22);
    const chestR = mid(rShoulder, rHip, 0.22);
    drawTapeLine(
      ctx, chestL, chestR,
      'Chest', fmtVal(activeVals.chestGirth),
      '#F472B6'
    );
  }

  // (c) Waist Tape Line (63% down torso)
  if (lShoulder && rShoulder && lHip && rHip) {
    const waistL = mid(lShoulder, lHip, 0.63);
    const waistR = mid(rShoulder, rHip, 0.63);
    drawTapeLine(
      ctx, waistL, waistR,
      'Waist', fmtVal(activeVals.waistGirth),
      '#4ADE80'
    );
  }

  // (d) Hip Tape Line
  if (lHip && rHip && lHip.vis > 0.4 && rHip.vis > 0.4) {
    drawTapeLine(
      ctx, lHip, rHip,
      'Hips', fmtVal(activeVals.hipGirth),
      '#38BDF8'
    );
  }

  // (e) Head & Neck Region Guide
  if (nose && nose.vis > 0.4) {
    const headRadius = lEar && rEar ? Math.max(16, Math.abs(lEar.x - rEar.x) / 2 + 8) : 24;
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(nose.x, nose.y - 4, headRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    drawBadge(
      ctx, nose.x, nose.y - headRadius - 14,
      `Head: ${fmtVal(activeVals.headCircumference)}`,
      '#94A3B8'
    );
  }

  // (f) Sleeve / Arm Path Line
  if (lShoulder && lElbow && lWrist && lWrist.vis > 0.3) {
    ctx.strokeStyle = '#C084FC';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(lShoulder.x, lShoulder.y);
    ctx.lineTo(lElbow.x, lElbow.y);
    ctx.lineTo(lWrist.x, lWrist.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const sleeveMid = mid(lElbow, lWrist, 0.5);
    drawBadge(ctx, sleeveMid.x - 40, sleeveMid.y, `Sleeve: ${fmtVal(activeVals.sleeveLength)}`, '#C084FC');
  }

  // (g) Leg / Trouser Line
  if (rHip && lAnkle && lAnkle.vis > 0.3) {
    const legTop = mid(lHip ?? rHip, rHip, 0.5);
    ctx.strokeStyle = '#FB923C';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(legTop.x, legTop.y);
    ctx.lineTo(lAnkle.x, lAnkle.y);
    ctx.stroke();
    ctx.setLineDash([]);

    const legMid = mid(legTop, lAnkle, 0.5);
    drawBadge(ctx, legMid.x + 35, legMid.y, `Trouser: ${fmtVal(activeVals.trouserLength)}`, '#FB923C');
  }

  // ── 4. Live Tracking Metrics HUD Panel ─────────────────────────────────────
  drawMetricsHUD(ctx, activeVals, progress, phase, canvasW);

  ctx.restore();
}

// ─── Tape Line Drawer ────────────────────────────────────────────────────────
function drawTapeLine(
  ctx: CanvasRenderingContext2D,
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  label: string,
  valStr: string,
  color: string
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 3]);

  // Main measurement line
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();

  // End ticks
  ctx.setLineDash([]);
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = -dy / len * 6;
  const ny = dx / len * 6;

  ctx.beginPath();
  ctx.moveTo(p1.x + nx, p1.y + ny);
  ctx.lineTo(p1.x - nx, p1.y - ny);
  ctx.moveTo(p2.x + nx, p2.y + ny);
  ctx.lineTo(p2.x - nx, p2.y - ny);
  ctx.stroke();

  // Label badge
  const midX = (p1.x + p2.x) / 2;
  const midY = (p1.y + p2.y) / 2;
  drawBadge(ctx, midX, midY - 12, `${label}: ${valStr}`, color);

  ctx.restore();
}

// ─── Text Badge Drawer ────────────────────────────────────────────────────────
function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  color: string
) {
  ctx.save();
  ctx.font = '600 11px "JetBrains Mono", monospace';
  const textWidth = ctx.measureText(text).width;
  const padX = 8;
  const boxW = textWidth + padX * 2;
  const boxH = 18;
  const rx = x - boxW / 2;
  const ry = y - boxH / 2;

  // Background blur pill
  ctx.fillStyle = 'rgba(10, 10, 15, 0.85)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.roundRect(rx, ry, boxW, boxH, 4);
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#F0EEE8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);

  ctx.restore();
}

// ─── Live Metrics HUD Panel ──────────────────────────────────────────────────
function drawMetricsHUD(
  ctx: CanvasRenderingContext2D,
  vals: Partial<Record<string, number>>,
  progress: number,
  phase: MeasurementPhase,
  canvasW: number
) {
  const isMeasuring = phase === 'MEASURING' || phase === 'VALIDATING';
  if (!isMeasuring && phase !== 'CALIBRATING') return;

  const items = [
    { label: 'Shoulders', val: vals.shoulderWidth },
    { label: 'Chest',     val: vals.chestGirth },
    { label: 'Waist',     val: vals.waistGirth },
    { label: 'Hips',      val: vals.hipGirth },
    { label: 'Head',      val: vals.headCircumference },
    { label: 'Sleeve',    val: vals.sleeveLength },
  ];

  ctx.save();

  const hudW = 160;
  const rowH = 18;
  const hudH = 32 + items.length * rowH;
  const posX = canvasW > 500 ? 16 : 10;
  const posY = 70;

  // Panel background
  ctx.fillStyle = 'rgba(17, 17, 24, 0.82)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(posX, posY, hudW, hudH, 8);
  ctx.fill();
  ctx.stroke();

  // Header
  ctx.font = '700 10px "Inter", sans-serif';
  ctx.fillStyle = '#E5C158';
  ctx.textAlign = 'left';
  ctx.fillText('LIVE MEASUREMENT', posX + 10, posY + 16);

  ctx.font = '400 9px "JetBrains Mono", monospace';
  ctx.fillStyle = '#8B8A90';
  ctx.textAlign = 'right';
  ctx.fillText(`${Math.round(progress * 100)}%`, posX + hudW - 10, posY + 16);

  // Divider line
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.moveTo(posX + 10, posY + 24);
  ctx.lineTo(posX + hudW - 10, posY + 24);
  ctx.stroke();

  // Items list
  ctx.font = '500 10px "Inter", sans-serif';
  let curY = posY + 38;

  for (const item of items) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#F0EEE8';
    ctx.fillText(item.label, posX + 10, curY);

    ctx.textAlign = 'right';
    if (item.val != null && item.val > 0) {
      ctx.fillStyle = '#4ADE80';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillText(`${item.val.toFixed(1)} cm`, posX + hudW - 10, curY);
    } else {
      ctx.fillStyle = '#8B8A90';
      ctx.font = '400 9px "Inter", sans-serif';
      ctx.fillText('Detecting…', posX + hudW - 10, curY);
    }
    ctx.font = '500 10px "Inter", sans-serif';
    curY += rowH;
  }

  ctx.restore();
}
