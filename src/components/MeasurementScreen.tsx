import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useCamera } from '../fitting-room/useCamera';
import { useBodyTracking } from '../fitting-room/useBodyTracking';
import { validatePosition } from '../fitting-room/positionValidator';
import {
  computeFrameMeasurement,
  appendFrame,
  isStable,
  stabilityProgress,
  buildLocalMeasurementResult,
  createFrameBuffer,
  clearFrameBuffer,
} from '../fitting-room/measurementEngine';
import { drawComputerVisionOverlay } from '../fitting-room/measurementCanvasOverlay';
import type { MeasurementResult, MeasurementPhase, PositionStatus } from '../types';

interface MeasurementScreenProps {
  clientId: string | null;
  customerId: string | null;
  sessionRef: string | null;
  userHeightCm: number;
  onHeightChange: (h: number) => void;
  onComplete: (result: MeasurementResult) => void;
  onClose: () => void;
}

const PHASE_LABEL: Record<MeasurementPhase, string> = {
  IDLE:           'Starting…',
  CAMERA_REQUEST: 'Requesting camera access…',
  CAMERA_ERROR:   'Camera unavailable',
  CAMERA_ACTIVE:  'Camera active',
  DETECTING:      'Detecting body landmarks…',
  POSITIONING:    'Adjust positioning',
  CALIBRATING:    'Position confirmed — hold still',
  MEASURING:      'Analyzing body dimensions…',
  VALIDATING:     'Best measurement captured — displaying results…',
  COMPLETE:       'Measurement complete',
  FAILED:         'Measurement failed',
  RETRY:          'Please try again',
};

const CALIBRATING_FRAMES_NEEDED = 30; // 1s at 30fps
const CM_PER_IN = 0.393701;

export const MeasurementScreen: React.FC<MeasurementScreenProps> = ({
  clientId, customerId, sessionRef, userHeightCm, onHeightChange, onComplete, onClose,
}) => {
  const webcamRef   = useRef<HTMLVideoElement | null>(null);
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const rafRef      = useRef<number>(0);
  const frameBuffer = useRef(createFrameBuffer());
  const goodFrames  = useRef(0);
  const finishedRef = useRef(false);

  const [phase, setPhase]               = useState<MeasurementPhase>('CAMERA_REQUEST');
  const [posStatus, setPosStatus]       = useState<PositionStatus | null>(null);
  const [progress, setProgress]         = useState(0);
  const [showHeightInput, setShowHeightInput] = useState(false);

  const { startCamera, stopCamera }                          = useCamera();
  const { initTracking, detectPose, readyRef, rawLandmarksRef, initError } = useBodyTracking();

  // ── Init camera + tracking ─────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    setPhase('CAMERA_REQUEST');
    finishedRef.current = false;

    (async () => {
      const ok = await startCamera(webcamRef.current);
      if (!mounted) return;
      if (!ok) { setPhase('CAMERA_ERROR'); return; }
      setPhase('CAMERA_ACTIVE');
      const okTrack = await initTracking();
      if (!mounted) return;
      if (!okTrack) {
        setPhase('RETRY');
        return;
      }
      setPhase('DETECTING');
    })();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      stopCamera();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Main RAF loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'CAMERA_ERROR' || phase === 'COMPLETE' || finishedRef.current) return;

    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);

      const vid = webcamRef.current;
      const cvs = canvasRef.current;
      if (!vid || !cvs || vid.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

      const W = cvs.parentElement?.clientWidth ?? cvs.width;
      const H = cvs.parentElement?.clientHeight ?? cvs.height;
      if (cvs.width !== W) cvs.width = W;
      if (cvs.height !== H) cvs.height = H;

      const ctx = cvs.getContext('2d');
      if (!ctx) return;

      // 1. Clear & draw mirrored video frame
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(vid, -W, 0, W, H);
      ctx.restore();

      if (!readyRef.current) return;

      // 2. Detect pose landmarks
      detectPose(vid, timestamp, W, H);
      const rawLm = rawLandmarksRef.current;

      // 3. Frame position validation
      const posResult = validatePosition(rawLm, vid.videoWidth, vid.videoHeight, W, H);
      setPosStatus(posResult);

      // Compute frame measurement if available
      let currentFrameVals: Partial<Record<string, number>> | null = null;

      if (rawLm && vid.videoWidth > 0) {
        const frameData = computeFrameMeasurement(
          rawLm, vid.videoWidth, vid.videoHeight, W, H, userHeightCm
        );
        if (frameData) {
          currentFrameVals = frameData.values;
          if (posResult.isReady && (phase === 'CALIBRATING' || phase === 'MEASURING')) {
            appendFrame(frameBuffer.current, frameData);
          }
        }
      }

      // Compute current buffer averages for real-time overlay
      const bufferedMeans: Partial<Record<string, number>> = {};
      frameBuffer.current.forEach((arr, key) => {
        if (arr.length > 0) {
          const sum = arr.reduce((a, b) => a + b, 0);
          bufferedMeans[key] = sum / arr.length;
        }
      });

      const prog = stabilityProgress(frameBuffer.current);
      setProgress(prog);

      // 4. Draw rich real-time Computer Vision overlay on top of video
      drawComputerVisionOverlay({
        ctx,
        rawLandmarks: rawLm,
        videoW: vid.videoWidth,
        videoH: vid.videoHeight,
        canvasW: W,
        canvasH: H,
        posStatus: posResult,
        frameValues: currentFrameVals,
        bufferedMeans,
        progress: prog,
        phase,
      });

      // 5. State machine progression
      if (!posResult.isReady) {
        goodFrames.current = 0;
        if (rawLm) setPhase('POSITIONING');
        else setPhase('DETECTING');
        return;
      }

      goodFrames.current++;

      if (goodFrames.current < CALIBRATING_FRAMES_NEEDED) {
        setPhase('CALIBRATING');
        return;
      }

      setPhase((prev) => {
        if (prev === 'CALIBRATING' || prev === 'POSITIONING' || prev === 'DETECTING') {
          clearFrameBuffer(frameBuffer.current);
          return 'MEASURING';
        }
        return prev;
      });

      // 6. Automatic Best-Measurement Capture -> Immediate Local Navigation to Results Screen
      if (isStable(frameBuffer.current) && !finishedRef.current) {
        finishedRef.current = true;
        cancelAnimationFrame(rafRef.current);
        setPhase('COMPLETE');
        const localResult = buildLocalMeasurementResult(
          frameBuffer.current,
          userHeightCm,
          sessionRef,
          clientId,
          customerId
        );
        onComplete(localResult);
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase, userHeightCm, clientId, customerId, sessionRef, detectPose, readyRef, rawLandmarksRef, onComplete]);

  const handleRetry = useCallback(async () => {
    clearFrameBuffer(frameBuffer.current);
    goodFrames.current = 0;
    finishedRef.current = false;
    setProgress(0);
    setPhase('DETECTING');
    await initTracking();
  }, [initTracking]);

  const isMeasuring = phase === 'MEASURING' || phase === 'VALIDATING';
  const hasGoodPos  = phase === 'CALIBRATING' || isMeasuring;

  return (
    <div className="lfr-measure">
      {/* Camera viewport */}
      <div className="lfr-measure__viewport">
        <video ref={webcamRef} autoPlay playsInline muted className="lfr-measure__video" />
        <canvas ref={canvasRef} className="lfr-measure__canvas" />

        {/* Target alignment frame */}
        <div className={`lfr-measure__guide-frame ${hasGoodPos ? 'lfr-measure__guide-frame--good' : ''}`}>
          <div className="lfr-measure__guide-corner lfr-measure__guide-corner--tl" />
          <div className="lfr-measure__guide-corner lfr-measure__guide-corner--tr" />
          <div className="lfr-measure__guide-corner lfr-measure__guide-corner--bl" />
          <div className="lfr-measure__guide-corner lfr-measure__guide-corner--br" />
        </div>

        {/* Phase status indicator */}
        <div className="lfr-measure__phase-banner">
          <span className={`lfr-measure__phase-dot lfr-measure__phase-dot--${hasGoodPos ? 'green' : 'amber'}`} />
          <span>{PHASE_LABEL[phase]}</span>
        </div>

        {/* Guidance instruction */}
        {posStatus && !hasGoodPos && (
          <div className="lfr-measure__guidance">
            {posStatus.guidance}
          </div>
        )}

        {/* Measuring progress bar */}
        {isMeasuring && (
          <div className="lfr-measure__progress-wrap">
            <div className="lfr-measure__progress-bar" style={{ width: `${Math.round(progress * 100)}%` }} />
            <span className="lfr-measure__progress-label">{Math.round(progress * 100)}%</span>
          </div>
        )}

        {/* Camera error */}
        {phase === 'CAMERA_ERROR' && (
          <div className="lfr-measure__error-overlay">
            <CameraOffIcon />
            <h3>Camera access required</h3>
            <p>Please allow camera access in your browser and reload the page.</p>
            <button className="lfr-btn lfr-btn--primary" onClick={onClose}>Go Back</button>
          </div>
        )}

        {/* Retry overlay */}
        {phase === 'RETRY' && (
          <div className="lfr-measure__error-overlay">
            <AlertIcon />
            <h3>{initError ? 'Body tracking initialization failed' : 'Measurement failed'}</h3>
            <p>{initError || "We couldn't obtain stable body tracking. Please ensure full body visibility and try again."}</p>
            <button className="lfr-btn lfr-btn--primary" onClick={handleRetry}>Try Again</button>
          </div>
        )}
      </div>

      {/* Bottom controls */}
      <div className="lfr-measure__controls">
        {/* Height calibration */}
        <button
          className="lfr-measure__height-btn"
          onClick={() => setShowHeightInput(!showHeightInput)}
        >
          <span>Height calibration: {userHeightCm} cm ({Math.floor(userHeightCm * CM_PER_IN / 12)}'{Math.round(userHeightCm * CM_PER_IN % 12)}")</span>
          <ChevronIcon open={showHeightInput} />
        </button>

        {showHeightInput && (
          <div className="lfr-measure__height-input">
            <label className="lfr-measure__height-label">
              Your height (cm)
              <span className="lfr-measure__height-val">{userHeightCm} cm</span>
            </label>
            <input
              type="range"
              min={140}
              max={210}
              value={userHeightCm}
              onChange={(e) => {
                onHeightChange(Number(e.target.value));
                clearFrameBuffer(frameBuffer.current);
                goodFrames.current = 0;
              }}
              className="lfr-measure__height-slider"
            />
            <div className="lfr-measure__height-range">
              <span>140 cm</span><span>210 cm</span>
            </div>
          </div>
        )}

        {/* Close */}
        <button className="lfr-measure__close-btn" onClick={onClose} aria-label="Close">
          <CloseIcon />
          <span>Close</span>
        </button>
      </div>
    </div>
  );
};

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
      style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#F87171' }}>
      <line x1="1" y1="1" x2="23" y2="23" />
      <path d="M21 21l-3.56-3.56A2 2 0 0 1 16 19H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h1.5l1.6-2.4A2 2 0 0 1 7.7 3H12" />
      <path d="M23 19V8a2 2 0 0 0-2-2h-3l-1.5-2.2" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#FACC15' }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
