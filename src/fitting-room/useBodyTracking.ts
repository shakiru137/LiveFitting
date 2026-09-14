import { useRef, useCallback, useState } from 'react';
import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createPoseFilters } from './OneEuroFilter';

export interface SmoothedPose {
  nose:           { x: number; y: number };
  leftShoulder:   { x: number; y: number };
  rightShoulder:  { x: number; y: number };
  leftElbow:      { x: number; y: number };
  rightElbow:     { x: number; y: number };
  leftWrist:      { x: number; y: number };
  rightWrist:     { x: number; y: number };
  leftHip:        { x: number; y: number };
  rightHip:       { x: number; y: number };
  leftKnee:       { x: number; y: number };
  rightKnee:      { x: number; y: number };
  confidence: number;
}

/** Raw 33-landmark array from the last successful detection. */
export type RawLandmark = { x: number; y: number; z: number; visibility?: number };

const LANDMARK_KEYS = [
  'nose', 'leftShoulder', 'rightShoulder',
  'leftElbow', 'rightElbow', 'leftWrist', 'rightWrist',
  'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
];

const MEDIAPIPE_INDICES: Record<string, number> = {
  nose: 0,
  leftShoulder: 11,  rightShoulder: 12,
  leftElbow: 13,     rightElbow: 14,
  leftWrist: 15,     rightWrist: 16,
  leftHip: 23,       rightHip: 24,
  leftKnee: 25,      rightKnee: 26,
};

/**
 * Projects a normalized MediaPipe coordinate [0..1, 0..1] onto the displayed
 * DOM container rectangle, accounting for CSS `object-fit: cover` scaling & cropping.
 */
export function projectLandmarkToContainer(
  normX: number,
  normY: number,
  videoWidth: number,
  videoHeight: number,
  containerWidth: number,
  containerHeight: number,
  mirrored = true
): { x: number; y: number } {
  if (videoWidth <= 0 || videoHeight <= 0 || containerWidth <= 0 || containerHeight <= 0) {
    const nx = mirrored ? 1 - normX : normX;
    return { x: nx * containerWidth, y: normY * containerHeight };
  }

  const effX = mirrored ? 1 - normX : normX;
  const aspectVideo = videoWidth / videoHeight;
  const aspectContainer = containerWidth / containerHeight;

  if (aspectContainer > aspectVideo) {
    // Container is wider than video -> scale by container width, crop top & bottom
    const scaledH = containerWidth / aspectVideo;
    const offsetY = (containerHeight - scaledH) / 2;
    return {
      x: effX * containerWidth,
      y: offsetY + normY * scaledH,
    };
  } else {
    // Container is taller than video -> scale by container height, crop left & right
    const scaledW = containerHeight * aspectVideo;
    const offsetX = (containerWidth - scaledW) / 2;
    return {
      x: offsetX + effX * scaledW,
      y: normY * containerHeight,
    };
  }
}

// Resilient multi-CDN sources for production asset loading
const WASM_PATHS = [
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm',
  'https://unpkg.com/@mediapipe/tasks-vision@1.0.1/wasm',
  'https://www.gstatic.com/mediapipe/tasks/vision/1.0.1/wasm',
];

const MODEL_PATHS = [
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm/pose_landmarker_lite.task',
];

export function useBodyTracking() {
  const landmarkerRef    = useRef<PoseLandmarker | null>(null);
  const filtersRef       = useRef(createPoseFilters(LANDMARK_KEYS));
  const lastPoseRef      = useRef<SmoothedPose | null>(null);
  const readyRef         = useRef(false);
  const isInitializing   = useRef(false);
  const frameCountRef    = useRef(0);
  const lastTimestampRef = useRef<number>(0);
  const rawLandmarksRef  = useRef<RawLandmark[] | null>(null);
  const [initError, setInitError] = useState<string | null>(null);

  const initTracking = useCallback(async (): Promise<boolean> => {
    if (readyRef.current) return true;
    if (isInitializing.current) return false;
    isInitializing.current = true;
    setInitError(null);

    console.log('[PoseLandmarker] Initializing MediaPipe Vision Tasks...');

    let vision = null;
    for (const wasmPath of WASM_PATHS) {
      try {
        console.log(`[PoseLandmarker] Fetching WASM from: ${wasmPath}`);
        vision = await FilesetResolver.forVisionTasks(wasmPath);
        if (vision) break;
      } catch (err) {
        console.warn(`[PoseLandmarker] Failed WASM path ${wasmPath}:`, err);
      }
    }

    if (!vision) {
      const msg = 'Failed to load MediaPipe WASM binaries';
      console.error(`❌ [PoseLandmarker] ${msg}`);
      setInitError(msg);
      isInitializing.current = false;
      return false;
    }

    let landmarker: PoseLandmarker | null = null;

    // Try GPU delegate first, fallback to CPU delegate
    for (const modelPath of MODEL_PATHS) {
      for (const delegate of ['GPU', 'CPU'] as const) {
        try {
          console.log(`[PoseLandmarker] Creating landmarker: ${modelPath} (delegate: ${delegate})`);
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.5,
            minPosePresenceConfidence: 0.5,
            minTrackingConfidence: 0.5,
          });
          if (landmarker) {
            console.log(`✅ [PoseLandmarker] Loaded successfully with ${delegate} delegate.`);
            break;
          }
        } catch (err) {
          console.warn(`[PoseLandmarker] Delegate ${delegate} failed for ${modelPath}:`, err);
        }
      }
      if (landmarker) break;
    }

    if (!landmarker) {
      const msg = 'Failed to initialize MediaPipe PoseLandmarker model';
      console.error(`❌ [PoseLandmarker] ${msg}`);
      setInitError(msg);
      isInitializing.current = false;
      return false;
    }

    landmarkerRef.current = landmarker;
    readyRef.current = true;
    isInitializing.current = false;
    return true;
  }, []);

  const detectPose = useCallback(
    (video: HTMLVideoElement, timestamp: number, canvasW: number, canvasH: number): SmoothedPose | null => {
      frameCountRef.current++;
      const frame = frameCountRef.current;

      if (!landmarkerRef.current || !readyRef.current) {
        if (frame % 60 === 0)
          console.warn('[PoseLandmarker] detectForVideo skipped — model not ready.');
        return lastPoseRef.current;
      }
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        if (frame % 60 === 0)
          console.warn(`[PoseLandmarker] detectForVideo skipped — video.readyState=${video.readyState}`);
        return lastPoseRef.current;
      }

      // Monotonically increasing integer timestamp required by MediaPipe VIDEO mode
      let ts = Math.round(timestamp);
      if (ts <= lastTimestampRef.current) ts = lastTimestampRef.current + 1;
      lastTimestampRef.current = ts;

      try {
        const result = landmarkerRef.current.detectForVideo(video, ts);

        if (!result?.landmarks || result.landmarks.length === 0) {
          rawLandmarksRef.current = null;
          return lastPoseRef.current;
        }

        const lm = result.landmarks[0] as RawLandmark[];

        // Store raw 33-landmark array for the visual overlay
        rawLandmarksRef.current = lm;

        // ── Smoothed pose with DOM layout object-fit projection ─────────────
        const t       = ts / 1000;
        const filters = filtersRef.current;

        const resolve = (key: string) => {
          const idx = MEDIAPIPE_INDICES[key];
          const lp  = lm[idx];
          if (!lp) return { x: 0, y: 0 };
          const { x: px, y: py } = projectLandmarkToContainer(
            lp.x, lp.y,
            video.videoWidth, video.videoHeight,
            canvasW, canvasH
          );
          return filters[key].filter(px, py, t);
        };

        const pose: SmoothedPose = {
          nose:          resolve('nose'),
          leftShoulder:  resolve('leftShoulder'),
          rightShoulder: resolve('rightShoulder'),
          leftElbow:     resolve('leftElbow'),
          rightElbow:    resolve('rightElbow'),
          leftWrist:     resolve('leftWrist'),
          rightWrist:    resolve('rightWrist'),
          leftHip:       resolve('leftHip'),
          rightHip:      resolve('rightHip'),
          leftKnee:      resolve('leftKnee'),
          rightKnee:     resolve('rightKnee'),
          confidence: (result.worldLandmarks && result.worldLandmarks.length > 0) ? 1 : 0,
        };

        lastPoseRef.current = pose;
        return pose;
      } catch (err) {
        console.error('❌ [PoseLandmarker] detectForVideo threw:', err);
        return lastPoseRef.current;
      }
    },
    []
  );

  const resetFilters = useCallback(() => {
    Object.values(filtersRef.current).forEach((f) => f.reset());
    lastPoseRef.current   = null;
    rawLandmarksRef.current = null;
  }, []);

  return { initTracking, detectPose, resetFilters, readyRef, rawLandmarksRef, initError };
}
