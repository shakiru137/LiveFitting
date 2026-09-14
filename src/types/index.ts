// ─── Core Product Types ────────────────────────────────────────────────────────

/** All measurements in centimetres */
export interface MeasurementsCm {
  height: number | null;
  headCircumference: number | null;
  neckCircumference: number | null;
  shoulderWidth: number | null;
  chestGirth: number | null;
  waistGirth: number | null;
  hipGirth: number | null;
  torsoLength: number | null;
  sleeveLength: number | null;
  trouserLength: number | null;
  skirtLength: number | null;
}

/** Converted to inches */
export interface MeasurementsIn {
  height: number | null;
  headCircumference: number | null;
  neckCircumference: number | null;
  shoulderWidth: number | null;
  chestGirth: number | null;
  waistGirth: number | null;
  hipGirth: number | null;
  torsoLength: number | null;
  sleeveLength: number | null;
  trouserLength: number | null;
  skirtLength: number | null;
}

export type QualityGrade = 'good' | 'fair' | 'poor';

export interface MeasurementQuality {
  grade: QualityGrade;
  confidence: number; // 0–1
  stabilityScore: number; // 0–1 (lower CV = more stable)
  framesAnalyzed: number;
}

/** The canonical measurement result — structure mirrors the backend API response */
export interface MeasurementResult {
  sessionRef: string;
  clientId: string | null;
  customerId: string | null;
  engineVersion: string;
  timestamp: string;
  measurements: {
    cm: MeasurementsCm;
    inches: MeasurementsIn;
  };
  suggestedSize: string | null;
  quality: MeasurementQuality;
  userHeightCm: number; // The height calibration value used
}

// ─── Measurement Pipeline State Machine ────────────────────────────────────────

export type MeasurementPhase =
  | 'IDLE'
  | 'CAMERA_REQUEST'
  | 'CAMERA_ERROR'
  | 'CAMERA_ACTIVE'
  | 'DETECTING'
  | 'POSITIONING'
  | 'CALIBRATING'
  | 'MEASURING'
  | 'VALIDATING'
  | 'COMPLETE'
  | 'FAILED'
  | 'RETRY';

// ─── Position Validation ────────────────────────────────────────────────────────

export type PositionIssue =
  | 'NO_BODY'
  | 'PARTIAL_BODY'
  | 'TOO_CLOSE'
  | 'TOO_FAR'
  | 'NOT_CENTERED'
  | 'NOT_UPRIGHT'
  | 'ARMS_BLOCKING'
  | 'POOR_LIGHTING'
  | 'LOW_CONFIDENCE';

export interface PositionStatus {
  isReady: boolean;
  issues: PositionIssue[];
  guidance: string;
  bodyFraction: number;   // How much of frame height the body occupies 0–1
  centerOffset: number;   // Horizontal offset from center −1 to +1
  postureTiltDeg: number; // Shoulder tilt in degrees
  confidence: number;     // Overall landmark confidence 0–1
}

// ─── Session (frontend state) ──────────────────────────────────────────────────

export interface MeasurementSession {
  sessionRef: string | null;
  clientId: string | null;
  customerId: string | null;
  phase: MeasurementPhase;
  calibratingFrames: number;
  measuringFrames: number;
  positionStatus: PositionStatus | null;
  result: MeasurementResult | null;
  error: string | null;
}

// ─── Raw Body Landmarks ────────────────────────────────────────────────────────
export type Point2D = { x: number; y: number };
export interface RawLandmark { x: number; y: number; z: number; visibility?: number }
