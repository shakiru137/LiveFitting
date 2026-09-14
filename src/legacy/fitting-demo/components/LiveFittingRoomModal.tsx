import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Camera, ShoppingBag, RefreshCw, CheckCircle2, Ruler, Copy, Check, Lock, Unlock, ChevronDown, ChevronUp } from 'lucide-react';
import type { Dress, DressColor, CapturedMedia } from '../types';
import { useCamera }                        from '../fitting-room/useCamera';
import { useBodyTracking, projectLandmarkToContainer } from '../fitting-room/useBodyTracking';
import type { RawLandmark }                 from '../fitting-room/useBodyTracking';
import { GarmentAssetRenderer }             from '../fitting-room/GarmentAssetRenderer';
import type { TorsoLandmarks }              from '../fitting-room/GarmentAssetRenderer';
import {
  computeTailorMeasurements,
  drawTailorOverlayLines,
  resetTailorSmoothing,
  type TailorMeasurements,
} from '../fitting-room/tailorMeasurements';

interface Props {
  dress:          Dress;
  allDresses:     Dress[];
  selectedColor:  DressColor;
  onClose:        () => void;
  onSelectDress:  (dress: Dress) => void;
  onSelectColor:  (color: DressColor) => void;
  onAddToCart:    (dress: Dress, color: DressColor) => void;
}

/**
 * Draws ALL 33 MediaPipe landmarks + Tailor Measuring Tape overlay on the debug canvas.
 */
function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  rawLandmarks: RawLandmark[] | null,
  videoW: number,
  videoH: number,
  measurements: TailorMeasurements | null,
  unitMode: 'cm' | 'in' | 'both'
) {
  ctx.clearRect(0, 0, W, H);

  if (!rawLandmarks || rawLandmarks.length === 0) return;

  // 1. Draw Tailor Measuring Tape lines across body parts if measurements exist
  if (measurements && measurements.isPoseValid) {
    drawTailorOverlayLines(ctx, measurements, unitMode);
  }

  // 2. Draw ALL 33 MediaPipe landmarks (Face, Wrist, Elbow, Shoulder, Hip, Knee, Ankle)
  rawLandmarks.forEach((lp, idx) => {
    const { x: px, y: py } = projectLandmarkToContainer(lp.x, lp.y, videoW, videoH, W, H);
    const vis = lp.visibility ?? 1;

    const alpha = Math.max(0.3, vis);
    const isKeyPoint = idx === 11 || idx === 12 || idx === 23 || idx === 24 || idx === 15 || idx === 16;
    const radius  = isKeyPoint ? 7 : 4;
    const color   = isKeyPoint ? '#E5C158' : '#00E5FF';

    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.globalAlpha = Math.max(0.5, alpha);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(idx), px, py);
  });

  ctx.globalAlpha = 1;
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
}

export const LiveFittingRoomModal: React.FC<Props> = ({
  dress, allDresses, selectedColor,
  onClose, onSelectDress, onSelectColor, onAddToCart,
}) => {
  // ── Refs ──────────────────────────────────────────────────────────────────
  const webcamRef      = useRef<HTMLVideoElement | null>(null);
  const glbCanvasRef   = useRef<HTMLCanvasElement | null>(null);
  const debugCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const garmentRef     = useRef<GarmentAssetRenderer | null>(null);
  const rafRef         = useRef<number>(0);

  // ── State ─────────────────────────────────────────────────────────────────
  const [camStatus,         setCamStatus]         = useState<'loading' | 'active' | 'denied'>('loading');
  const [trackingStatus,    setTrackingStatus]    = useState<'loading' | 'active' | 'unavailable'>('loading');
  const [showDressSelector, setShowDressSelector] = useState(false);
  const [capturedMedia,     setCapturedMedia]     = useState<CapturedMedia | null>(null);
  const [addedBag,          setAddedBag]          = useState(false);
  const [flashActive,       setFlashActive]       = useState(false);

  // ── Tailor Measurement State ──────────────────────────────────────────────
  const [userHeightCm,       setUserHeightCm]       = useState(168);
  const [unitMode,           setUnitMode]           = useState<'cm' | 'in' | 'both'>('both');
  const [isLocked,           setIsLocked]           = useState(false);
  const [tailorMeasurements, setTailorMeasurements] = useState<TailorMeasurements | null>(null);
  const [lockedMeasurements, setLockedMeasurements] = useState<TailorMeasurements | null>(null);
  const [copiedSpecs,        setCopiedSpecs]        = useState(false);
  const [isPanelCollapsed,   setIsPanelCollapsed]   = useState(false);

  const isLockedRef       = useRef(isLocked);
  const userHeightCmRef   = useRef(userHeightCm);
  const unitModeRef       = useRef(unitMode);
  useEffect(() => { isLockedRef.current = isLocked; }, [isLocked]);
  useEffect(() => { userHeightCmRef.current = userHeightCm; }, [userHeightCm]);
  useEffect(() => { unitModeRef.current = unitMode; }, [unitMode]);

  const dressRef = useRef(dress);
  const colorRef = useRef(selectedColor);
  useEffect(() => { dressRef.current = dress; }, [dress]);
  useEffect(() => { colorRef.current = selectedColor; }, [selectedColor]);

  const { startCamera, stopCamera }                           = useCamera();
  const { initTracking, detectPose, readyRef, rawLandmarksRef } = useBodyTracking();

  // ── 1. Mount Three.js GLB renderer (once) ────────────────────────────────
  useEffect(() => {
    const canvas = glbCanvasRef.current;
    if (!canvas) return;

    const renderer = new GarmentAssetRenderer(canvas);
    garmentRef.current = renderer;
    renderer.loadGarmentModel('/models/black_evening_gown.glb');

    const onResize = () => {
      const p = canvas.parentElement;
      if (p && p.clientWidth > 0 && p.clientHeight > 0) {
        if (glbCanvasRef.current) {
          glbCanvasRef.current.width = p.clientWidth;
          glbCanvasRef.current.height = p.clientHeight;
        }
        if (debugCanvasRef.current) {
          debugCanvasRef.current.width = p.clientWidth;
          debugCanvasRef.current.height = p.clientHeight;
        }
        renderer.resize(p.clientWidth, p.clientHeight);
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.dispose();
      garmentRef.current = null;
    };
  }, []);

  // ── 2. Start webcam + MediaPipe (once) ───────────────────────────────────
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      // Start webcam
      const vid = webcamRef.current;
      const camOk = await startCamera(vid);
      if (!mounted) return;
      setCamStatus(camOk ? 'active' : 'denied');

      // Initialise MediaPipe Pose Landmarker
      try {
        await initTracking();
        if (!mounted) return;
        setTrackingStatus(readyRef.current ? 'active' : 'unavailable');
      } catch {
        if (mounted) setTrackingStatus('unavailable');
      }
    };

    init();

    return () => {
      mounted = false;
      cancelAnimationFrame(rafRef.current);
      stopCamera();
      resetTailorSmoothing();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 3. MediaPipe → GarmentAssetRenderer + Tailor Measurement loop ─────────
  useEffect(() => {
    if (camStatus !== 'active') return;

    let lastTracked = false;

    const loop = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(loop);

      const vid      = webcamRef.current;
      const renderer = garmentRef.current;
      const debugCvs = debugCanvasRef.current;
      const glbCvs   = glbCanvasRef.current;
      if (!vid || !renderer || !glbCvs || !debugCvs) return;

      const p = glbCvs.parentElement;
      const W = p ? p.clientWidth : (glbCvs.width || 1280);
      const H = p ? p.clientHeight : (glbCvs.height || 720);

      if (glbCvs.width !== W || glbCvs.height !== H) {
        glbCvs.width = W;
        glbCvs.height = H;
        renderer.resize(W, H);
      }
      if (debugCvs.width !== W || debugCvs.height !== H) {
        debugCvs.width = W;
        debugCvs.height = H;
      }

      // Run pose detection only when MediaPipe is ready
      let landmarks: TorsoLandmarks | null = null;
      if (readyRef.current && vid.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        const pose = detectPose(vid, timestamp, W, H);
        if (pose) {
          landmarks = {
            leftShoulder:  pose.leftShoulder,
            rightShoulder: pose.rightShoulder,
            leftHip:       pose.leftHip,
            rightHip:      pose.rightHip,
          };

          if (!lastTracked) {
            setTrackingStatus('active');
            lastTracked = true;
          }
        } else if (lastTracked) {
          setTrackingStatus('unavailable');
          lastTracked = false;
        }
      }

      // Calculate Tailor Measurements from raw 33 landmarks
      const rawLm = rawLandmarksRef.current;
      let activeMeasurements: TailorMeasurements | null = null;
      if (rawLm && vid.videoWidth > 0) {
        const computed = computeTailorMeasurements(
          rawLm,
          vid.videoWidth,
          vid.videoHeight,
          W,
          H,
          userHeightCmRef.current
        );
        if (computed) {
          activeMeasurements = computed;
          if (!isLockedRef.current) {
            setTailorMeasurements(computed);
          }
        }
      }

      const displayMeasurements = isLockedRef.current ? lockedMeasurements : (activeMeasurements || tailorMeasurements);

      // Draw 33 landmarks & Tailor measurement lines
      if (debugCvs) {
        const dCtx = debugCvs.getContext('2d');
        if (dCtx) {
          drawDebugOverlay(
            dCtx,
            W,
            H,
            rawLandmarksRef.current,
            vid.videoWidth,
            vid.videoHeight,
            displayMeasurements,
            unitModeRef.current
          );
        }
      }

      // Pass projected landmarks to renderer for garment attachment
      renderer.attachToTorso(landmarks, W, H);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camStatus, lockedMeasurements, tailorMeasurements]);

  // ── Lock/Freeze Pose Toggle ───────────────────────────────────────────────
  const handleToggleLock = useCallback(() => {
    if (isLocked) {
      setIsLocked(false);
    } else {
      setLockedMeasurements(tailorMeasurements);
      setIsLocked(true);
    }
  }, [isLocked, tailorMeasurements]);

  // ── Copy Spec Sheet for Tailor / Designer ──────────────────────────────────
  const handleCopySpecs = useCallback(() => {
    const m = isLocked ? lockedMeasurements : tailorMeasurements;
    if (!m) return;

    const feet = Math.floor(userHeightCm * 0.393701 / 12);
    const inches = (userHeightCm * 0.393701 % 12).toFixed(1);

    const specSheet = `--- FASHION DESIGNER & TAILOR SPEC SHEET ---
Client Height: ${userHeightCm} cm (${feet}'${inches}")
Estimated Dress Size: ${m.suggestedSize}

BODY METRICS FOR TAILORING:
1. Cross Shoulder Width: ${m.shoulderWidthCm.toFixed(1)} cm (${m.shoulderWidthIn.toFixed(1)} in)
2. Bust Circumference:   ${m.bustGirthCm.toFixed(1)} cm (${m.bustGirthIn.toFixed(1)} in)
3. Underbust Girth:       ${m.underbustGirthCm.toFixed(1)} cm (${m.underbustGirthIn.toFixed(1)} in)
4. Waist Circumference:  ${m.waistGirthCm.toFixed(1)} cm (${m.waistGirthIn.toFixed(1)} in)
5. Hip Circumference:    ${m.hipGirthCm.toFixed(1)} cm (${m.hipGirthIn.toFixed(1)} in)
6. Back / Torso Length:  ${m.torsoLengthCm.toFixed(1)} cm (${m.torsoLengthIn.toFixed(1)} in)
7. Sleeve / Arm Length:  ${m.sleeveLengthCm.toFixed(1)} cm (${m.sleeveLengthIn.toFixed(1)} in)
8. Skirt / Dress Length: ${m.skirtLengthCm.toFixed(1)} cm (${m.skirtLengthIn.toFixed(1)} in)
---------------------------------------------`;

    navigator.clipboard.writeText(specSheet);
    setCopiedSpecs(true);
    setTimeout(() => setCopiedSpecs(false), 2500);
  }, [isLocked, lockedMeasurements, tailorMeasurements, userHeightCm]);

  // ── Photo capture ─────────────────────────────────────────────────────────
  const handleCapture = useCallback(() => {
    setFlashActive(true);
    setTimeout(() => setFlashActive(false), 300);

    const vid      = webcamRef.current;
    const glbCvs   = glbCanvasRef.current;
    const debugCvs = debugCanvasRef.current;
    const snap     = document.createElement('canvas');
    snap.width     = 1280;
    snap.height    = 720;
    const ctx      = snap.getContext('2d');
    if (ctx && vid && vid.readyState >= 2) {
      ctx.drawImage(vid, 0, 0, 1280, 720);
    }
    if (ctx && glbCvs) ctx.drawImage(glbCvs, 0, 0, 1280, 720);
    if (ctx && debugCvs) ctx.drawImage(debugCvs, 0, 0, 1280, 720);

    setCapturedMedia({
      id:        Date.now().toString(),
      type:      'photo',
      url:       snap.toDataURL('image/png'),
      dressName: dressRef.current.title,
      colorName: colorRef.current.name,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
  }, []);

  const handleAddBag = useCallback(() => {
    onAddToCart(dressRef.current, colorRef.current);
    setAddedBag(true);
    setTimeout(() => setAddedBag(false), 3000);
  }, [onAddToCart]);

  const badgeStyle = (bg: string) => ({
    background:     bg,
    color:          '#fff',
    backdropFilter: 'blur(8px)',
  } as React.CSSProperties);

  const activeM = isLocked ? lockedMeasurements : tailorMeasurements;

  return (
    <div className="fitting-room-container select-none">
      {flashActive && <div className="absolute inset-0 z-50 snapshot-flash pointer-events-none" />}

      {/* ── Layer 0: Raw webcam feed ────────────────────────────────────────── */}
      <video
        ref={webcamRef}
        autoPlay playsInline muted
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          zIndex: 0,
        }}
      />

      {/* ── Layer 1: Transparent Three.js GLB overlay ───────────────────────── */}
      <canvas
        ref={glbCanvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      />

      {/* ── Layer 2: 2D MediaPipe Debug Overlay Canvas ─────────────────────── */}
      <canvas
        ref={debugCanvasRef}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* Camera loading overlay */}
      {camStatus === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 12,
          background: 'rgba(10,10,10,0.85)',
        }}>
          <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          <p className="text-xs font-sans tracking-widest uppercase text-neutral-300">
            Initializing camera…
          </p>
        </div>
      )}

      {/* Camera denied */}
      {camStatus === 'denied' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[10px] font-sans font-medium tracking-widest uppercase z-30 text-white"
          style={badgeStyle('rgba(180,75,75,0.88)')}>
          Camera access denied — grant permission &amp; refresh
        </div>
      )}

      {/* ── Tracking + webcam status badge ──────────────────────────────────── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 flex gap-2 items-center">
        {camStatus === 'active' && (
          <div className="px-3 py-1 rounded-full text-[10px] font-sans font-medium tracking-widest uppercase"
            style={badgeStyle('rgba(30,80,60,0.85)')}>
            📷 Webcam Live
          </div>
        )}

        {trackingStatus === 'active' ? (
          <div className="px-3 py-1 rounded-full text-[10px] font-sans font-medium tracking-widest uppercase"
            style={badgeStyle('rgba(79,122,99,0.88)')}>
            🦾 Pose Tracked
          </div>
        ) : trackingStatus === 'unavailable' ? (
          <div className="px-3 py-1 rounded-full text-[10px] font-sans font-medium tracking-widest uppercase"
            style={badgeStyle('rgba(180,75,75,0.85)')}>
            Body tracking unavailable
          </div>
        ) : (
          <div className="px-3 py-1 rounded-full text-[10px] font-sans font-medium tracking-widest uppercase"
            style={badgeStyle('rgba(80,80,80,0.75)')}>
            Loading pose model…
          </div>
        )}
      </div>

      {/* ── Tailor & Fashion Designer Measurement Spec Sheet HUD ───────────── */}
      <div className="absolute top-14 left-4 sm:top-6 sm:left-6 z-30 bg-black/90 backdrop-blur-xl p-4 rounded-3xl border border-[#D8B4A0]/30 text-white font-sans text-xs shadow-2xl w-[320px] sm:w-[350px] max-h-[calc(100vh-140px)] overflow-y-auto scrollbar-none transition-all">

        {/* Panel Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-2.5 mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-[#D8B4A0]/20 border border-[#D8B4A0]/40 flex items-center justify-center text-[#D8B4A0]">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#E5C158]">
                Tailor Spec Sheet
              </h3>
              <p className="text-[9px] text-neutral-400 font-mono">Fashion Designer Body Metrics</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleToggleLock}
              title={isLocked ? "Unlock live tracking" : "Freeze current measurements"}
              className={`px-2 py-1 rounded-lg text-[10px] font-mono font-medium flex items-center gap-1 border transition-all ${
                isLocked
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                  : 'bg-white/10 border-white/20 text-neutral-300 hover:bg-white/20'
              }`}
            >
              {isLocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
              <span>{isLocked ? 'LOCKED' : 'FREEZE'}</span>
            </button>

            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="p-1 rounded-lg bg-white/10 hover:bg-white/20 text-neutral-300"
            >
              {isPanelCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!isPanelCollapsed && (
          <>
            {/* Suggested Size Badge */}
            {activeM && (
              <div className="mb-3 p-2.5 rounded-2xl bg-gradient-to-r from-[#D8B4A0]/15 to-[#E5C158]/15 border border-[#D8B4A0]/30 flex items-center justify-between">
                <span className="text-[10px] font-sans uppercase tracking-widest text-neutral-300 font-medium">Suggested Garment Size</span>
                <span className="text-xs font-bold font-serif text-[#E5C158] bg-black/50 px-2.5 py-0.5 rounded-full border border-[#E5C158]/40">
                  {activeM.suggestedSize}
                </span>
              </div>
            )}

            {/* Body Metrics Grid */}
            <div className="space-y-1.5 mb-3 font-mono text-[11px]">
              {[
                { label: 'Cross Shoulder', cm: activeM?.shoulderWidthCm, in: activeM?.shoulderWidthIn, color: 'border-l-2 border-[#E5C158]' },
                { label: 'Bust Girth', cm: activeM?.bustGirthCm, in: activeM?.bustGirthIn, color: 'border-l-2 border-[#D8B4A0]' },
                { label: 'Underbust Girth', cm: activeM?.underbustGirthCm, in: activeM?.underbustGirthIn, color: 'border-l-2 border-neutral-500' },
                { label: 'Waist Girth', cm: activeM?.waistGirthCm, in: activeM?.waistGirthIn, color: 'border-l-2 border-[#4ADE80]' },
                { label: 'Hip Girth', cm: activeM?.hipGirthCm, in: activeM?.hipGirthIn, color: 'border-l-2 border-[#38BDF8]' },
                { label: 'Torso Length', cm: activeM?.torsoLengthCm, in: activeM?.torsoLengthIn, color: 'border-l-2 border-[#FACC15]' },
                { label: 'Sleeve Length', cm: activeM?.sleeveLengthCm, in: activeM?.sleeveLengthIn, color: 'border-l-2 border-[#F472B6]' },
                { label: 'Skirt / Floor', cm: activeM?.skirtLengthCm, in: activeM?.skirtLengthIn, color: 'border-l-2 border-purple-400' },
              ].map((item, idx) => (
                <div key={idx} className={`flex items-center justify-between p-1.5 rounded-xl bg-white/5 pl-2.5 ${item.color}`}>
                  <span className="text-[10px] font-sans text-neutral-300">{item.label}</span>
                  <div className="text-right">
                    <span className="font-bold text-white">
                      {item.cm !== undefined ? item.cm.toFixed(1) : '--'} cm
                    </span>
                    <span className="text-[9px] text-neutral-400 ml-1.5 font-sans">
                      ({item.in !== undefined ? item.in.toFixed(1) : '--'} in)
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Height Calibration & Unit Settings */}
            <div className="pt-2 border-t border-white/10 space-y-2.5">
              <div className="flex items-center justify-between text-[10px] font-sans text-neutral-300">
                <span>Height Calibration</span>
                <span className="font-mono text-white font-bold">{userHeightCm} cm ({Math.floor(userHeightCm * 0.393701 / 12)}'{(userHeightCm * 0.393701 % 12).toFixed(0)}")</span>
              </div>
              <input
                type="range"
                min="145"
                max="205"
                value={userHeightCm}
                onChange={(e) => setUserHeightCm(Number(e.target.value))}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-[#D8B4A0]"
              />

              {/* Units Selection */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex bg-neutral-900 rounded-xl p-0.5 border border-white/10 text-[9px] font-sans">
                  {(['cm', 'in', 'both'] as const).map((u) => (
                    <button
                      key={u}
                      onClick={() => setUnitMode(u)}
                      className={`px-2.5 py-1 rounded-lg uppercase tracking-wider transition-all ${
                        unitMode === u ? 'bg-[#D8B4A0] text-black font-bold' : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {u}
                    </button>
                  ))}
                </div>

                <button
                  onClick={handleCopySpecs}
                  className="flex-1 py-1.5 px-3 bg-[#E5C158] hover:bg-[#d6b247] text-black rounded-xl font-sans font-bold text-[10px] tracking-wider uppercase flex items-center justify-center gap-1.5 shadow-lg transition-all"
                >
                  {copiedSpecs ? (
                    <><Check className="w-3.5 h-3.5" /><span>Copied!</span></>
                  ) : (
                    <><Copy className="w-3.5 h-3.5" /><span>Copy Spec Sheet</span></>
                  )}
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Close button ─────────────────────────────────────────────────────── */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-40">
        <button onClick={onClose}
          className="w-10 h-10 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-md text-white border border-white/20 flex items-center justify-center transition-all"
          aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Outfit drawer ────────────────────────────────────────────────────── */}
      {showDressSelector && (
        <div className="absolute bottom-28 inset-x-4 sm:inset-x-6 z-40 max-w-lg mx-auto bg-white/95 backdrop-blur-md rounded-3xl p-4 border border-[#ECE8E3] shadow-2xl pointer-events-auto">
          <div className="flex items-center justify-between mb-3 px-2">
            <span className="text-[11px] font-sans uppercase tracking-widest text-[#1D1D1D] font-medium">Change Dress</span>
            <button onClick={() => setShowDressSelector(false)} className="text-[#666] hover:text-[#1D1D1D] text-xs font-sans">Done</button>
          </div>
          <div className="flex items-center gap-3 overflow-x-auto pb-2 scrollbar-none">
            {allDresses.map((d) => (
              <button key={d.id}
                onClick={() => { onSelectDress(d); onSelectColor(d.colors[0]); }}
                className={`flex-shrink-0 w-28 bg-[#FAF9F7] p-2 rounded-2xl border transition-all text-left ${
                  d.id === dress.id ? 'border-[#D8B4A0] ring-2 ring-[#D8B4A0]/20' : 'border-[#ECE8E3] hover:border-[#D8B4A0]'
                }`}>
                <div className="w-full h-20 rounded-xl overflow-hidden mb-1.5 bg-white">
                  <img src={d.photos[0]} alt={d.title} className="w-full h-full object-cover" />
                </div>
                <div className="text-[11px] font-serif text-[#1D1D1D] truncate">{d.title}</div>
                <div className="text-[10px] text-[#D8B4A0] font-sans font-medium">£{d.price}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Captured photo preview ───────────────────────────────────────────── */}
      {capturedMedia && (
        <div className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 pointer-events-auto">
          <div className="max-w-sm w-full bg-white rounded-3xl p-4 border border-[#ECE8E3] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-sans uppercase tracking-widest text-[#1D1D1D] font-medium">Your Photo &amp; Fit</span>
              <button onClick={() => setCapturedMedia(null)} className="text-[#666] hover:text-black">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative rounded-2xl overflow-hidden bg-black aspect-[3/4]">
              <img src={capturedMedia.url} alt="Captured" className="w-full h-full object-cover" />
            </div>
            <div className="flex items-center justify-between text-xs text-[#666] font-sans px-1">
              <span>{capturedMedia.dressName}</span>
              <span>{capturedMedia.timestamp}</span>
            </div>
            <a href={capturedMedia.url} download={`fitting-room-${capturedMedia.id}.png`}
              className="w-full py-3 bg-[#1D1D1D] text-white rounded-xl text-xs font-sans font-medium uppercase tracking-widest text-center hover:bg-black transition-all">
              Save Image
            </a>
          </div>
        </div>
      )}

      {/* ── HUD Bottom Bar ───────────────────────────────────────────────────── */}
      <div className="absolute bottom-6 inset-x-4 sm:inset-x-6 z-40 max-w-xl mx-auto flex items-center justify-between gap-3 pointer-events-auto">
        <button onClick={() => setShowDressSelector(!showDressSelector)}
          className="flex-1 py-3.5 px-4 bg-white/90 hover:bg-white backdrop-blur-md border border-[#ECE8E3] rounded-2xl text-xs font-sans font-medium text-[#1D1D1D] flex items-center justify-center gap-2 shadow-lg transition-all">
          <RefreshCw className="w-4 h-4 text-[#D8B4A0]" />
          <span className="truncate">{dress.title}</span>
        </button>

        <button onClick={handleCapture}
          className="w-14 h-14 rounded-full bg-white text-[#1D1D1D] border-2 border-[#D8B4A0] flex items-center justify-center shadow-xl hover:scale-105 active:scale-95 transition-all flex-shrink-0"
          aria-label="Take Photo">
          <Camera className="w-6 h-6" />
        </button>

        <button onClick={handleAddBag}
          className="flex-1 py-3.5 px-4 bg-[#1D1D1D] hover:bg-black text-white rounded-2xl text-xs font-sans font-medium uppercase tracking-wider flex items-center justify-center gap-2 shadow-xl transition-all">
          {addedBag
            ? <><CheckCircle2 className="w-4 h-4 text-emerald-400" /><span>Added</span></>
            : <><ShoppingBag className="w-4 h-4 text-[#D8B4A0]" /><span>Add to Bag</span></>}
        </button>
      </div>
    </div>
  );
};

