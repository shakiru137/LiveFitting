/**
 * positionValidator.ts
 *
 * Evaluates whether the user's body position in frame is suitable for measurement.
 * Returns structured PositionStatus with specific issues and user-facing guidance.
 *
 * This is separate from the measurement engine so it can run every frame cheaply
 * without triggering full measurement calculation.
 */

import type { RawLandmark, PositionStatus, PositionIssue } from '../types';
import { projectLandmarkToContainer } from './useBodyTracking';

// MediaPipe landmark indices
const IDX = {
  NOSE: 0,
  LEFT_EYE: 2,
  RIGHT_EYE: 5,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
} as const;

/** Thresholds — tuned for a standard front-facing webcam ~2m away */
const THRESHOLDS = {
  MIN_BODY_FRACTION: 0.45,   // Body must occupy at least 45% of frame height
  MAX_BODY_FRACTION: 0.90,   // Body must not exceed 90% of frame height (too close)
  MAX_CENTER_OFFSET: 0.25,   // Body center must be within 25% of frame center
  MAX_TILT_DEG: 8,           // Shoulder tilt must be less than 8 degrees
  MIN_SHOULDER_VIS: 0.5,     // Shoulder landmark visibility threshold
  MIN_HIP_VIS: 0.4,
  MIN_ANKLE_VIS: 0.35,
  MIN_OVERALL_CONFIDENCE: 0.55,
};

/** Maps PositionIssues to user-facing guidance strings (priority order) */
const GUIDANCE: Record<PositionIssue, string> = {
  NO_BODY:       'Stand in front of the camera so your body is visible.',
  PARTIAL_BODY:  'Make sure your full body is visible — head to feet.',
  TOO_CLOSE:     'Move further away from the camera.',
  TOO_FAR:       'Move closer to the camera.',
  NOT_CENTERED:  'Move to the centre of the frame.',
  NOT_UPRIGHT:   'Stand upright and face the camera directly.',
  ARMS_BLOCKING: 'Rest your arms by your sides.',
  POOR_LIGHTING: 'Improve the lighting in the room.',
  LOW_CONFIDENCE:'Stand still for a moment.',
};

function dist(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  return Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
}

export function validatePosition(
  rawLandmarks: RawLandmark[] | null,
  videoW: number,
  videoH: number,
  containerW: number,
  containerH: number
): PositionStatus {
  const noBody: PositionStatus = {
    isReady: false,
    issues: ['NO_BODY'],
    guidance: GUIDANCE.NO_BODY,
    bodyFraction: 0,
    centerOffset: 0,
    postureTiltDeg: 0,
    confidence: 0,
  };

  if (!rawLandmarks || rawLandmarks.length < 29) return noBody;

  const get = (idx: number) =>
    projectLandmarkToContainer(
      rawLandmarks[idx].x, rawLandmarks[idx].y,
      videoW, videoH, containerW, containerH
    );

  const vis = (idx: number) => rawLandmarks[idx]?.visibility ?? 0;

  // Key landmark visibility
  const shoulderVis = (vis(IDX.LEFT_SHOULDER) + vis(IDX.RIGHT_SHOULDER)) / 2;
  const hipVis = (vis(IDX.LEFT_HIP) + vis(IDX.RIGHT_HIP)) / 2;
  const ankleVis = (vis(IDX.LEFT_ANKLE) + vis(IDX.RIGHT_ANKLE)) / 2;
  const noseVis = vis(IDX.NOSE);

  const overallConfidence = (shoulderVis + hipVis + noseVis) / 3;

  // ── Body extent in pixel space ────────────────────────────────────────────
  const nose = get(IDX.NOSE);
  const lShoulder = get(IDX.LEFT_SHOULDER);
  const rShoulder = get(IDX.RIGHT_SHOULDER);
  const lHip = get(IDX.LEFT_HIP);
  const rHip = get(IDX.RIGHT_HIP);
  const lAnkle = get(IDX.LEFT_ANKLE);
  const rAnkle = get(IDX.RIGHT_ANKLE);

  const shoulderMid = { x: (lShoulder.x + rShoulder.x) / 2, y: (lShoulder.y + rShoulder.y) / 2 };
  const hipMid = { x: (lHip.x + rHip.x) / 2, y: (lHip.y + rHip.y) / 2 };
  const ankleMid = { x: (lAnkle.x + rAnkle.x) / 2, y: (lAnkle.y + rAnkle.y) / 2 };

  // Body height in pixels: nose to ankle midpoint
  const bodyHeightPx = dist(nose, ankleMid);
  const bodyFraction = bodyHeightPx / containerH;

  // Horizontal centre offset (−1 = far left, +1 = far right)
  const bodyCentreX = (shoulderMid.x + hipMid.x) / 2;
  const centerOffset = (bodyCentreX / containerW - 0.5) * 2;

  // Shoulder tilt angle
  const postureTiltDeg = Math.abs(
    Math.atan2(rShoulder.y - lShoulder.y, rShoulder.x - lShoulder.x) * (180 / Math.PI)
  );

  // ── Issue Detection ────────────────────────────────────────────────────────
  const issues: PositionIssue[] = [];

  if (shoulderVis < THRESHOLDS.MIN_SHOULDER_VIS) {
    issues.push('PARTIAL_BODY');
  }

  if (ankleVis < THRESHOLDS.MIN_ANKLE_VIS && hipVis > 0.3) {
    issues.push('PARTIAL_BODY'); // Legs cut off
  }

  if (bodyFraction > THRESHOLDS.MAX_BODY_FRACTION) {
    issues.push('TOO_CLOSE');
  } else if (bodyFraction < THRESHOLDS.MIN_BODY_FRACTION && shoulderVis > 0.4) {
    issues.push('TOO_FAR');
  }

  if (Math.abs(centerOffset) > THRESHOLDS.MAX_CENTER_OFFSET) {
    issues.push('NOT_CENTERED');
  }

  if (postureTiltDeg > THRESHOLDS.MAX_TILT_DEG) {
    issues.push('NOT_UPRIGHT');
  }

  if (overallConfidence < THRESHOLDS.MIN_OVERALL_CONFIDENCE) {
    issues.push('LOW_CONFIDENCE');
  }

  // Detect arms blocking torso: wrists inside the body bounding box
  const lWrist = get(IDX.LEFT_WRIST);
  const rWrist = get(IDX.RIGHT_WRIST);
  const bodyLeft = Math.min(lShoulder.x, lHip.x);
  const bodyRight = Math.max(rShoulder.x, rHip.x);
  const armsCrossed =
    (lWrist.x > bodyLeft && lWrist.x < bodyRight && lWrist.y > shoulderMid.y && lWrist.y < hipMid.y) ||
    (rWrist.x > bodyLeft && rWrist.x < bodyRight && rWrist.y > shoulderMid.y && rWrist.y < hipMid.y);
  if (armsCrossed) issues.push('ARMS_BLOCKING');

  // ── Priority Guidance ──────────────────────────────────────────────────────
  // Report the most important issue first
  const priority: PositionIssue[] = [
    'NO_BODY', 'PARTIAL_BODY', 'TOO_CLOSE', 'TOO_FAR',
    'NOT_CENTERED', 'NOT_UPRIGHT', 'ARMS_BLOCKING', 'LOW_CONFIDENCE', 'POOR_LIGHTING',
  ];
  const topIssue = priority.find((i) => issues.includes(i));
  const guidance = topIssue ? GUIDANCE[topIssue] : 'Hold still…';

  const isReady = issues.length === 0 && overallConfidence >= THRESHOLDS.MIN_OVERALL_CONFIDENCE;

  return { isReady, issues, guidance, bodyFraction, centerOffset, postureTiltDeg, confidence: overallConfidence };
}
