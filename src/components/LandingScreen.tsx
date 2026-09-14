import React from 'react';

interface LandingScreenProps {
  onStart: () => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({ onStart }) => {
  return (
    <div className="lfr-landing">
      {/* Background gradient */}
      <div className="lfr-landing__bg" aria-hidden="true" />

      <div className="lfr-landing__content">
        {/* Logo / Brand */}
        <div className="lfr-landing__brand">
          <span className="lfr-landing__brand-name">LiveFittingRoom</span>
        </div>

        {/* Body outline illustration with measurement callouts */}
        <div className="lfr-landing__figure-wrap" aria-hidden="true">
          <BodyOutlineSVG />
        </div>

        {/* Headline */}
        <h1 className="lfr-landing__headline">
          Your body.<br />Your measurements.<br />In seconds.
        </h1>
        <p className="lfr-landing__sub">
          Stand in front of your camera. We'll measure you automatically — no tape measure needed.
        </p>

        {/* CTA */}
        <button className="lfr-btn lfr-btn--primary lfr-btn--lg" onClick={onStart} id="start-measurement-btn">
          Start Measurement
          <ArrowIcon />
        </button>

        {/* Trust signals */}
        <div className="lfr-landing__trust">
          <span className="lfr-landing__trust-item">
            <CameraIcon />
            Camera only — nothing is recorded
          </span>
          <span className="lfr-landing__trust-item">
            <ClockIcon />
            60-second process
          </span>
          <span className="lfr-landing__trust-item">
            <ShieldIcon />
            Private by design
          </span>
        </div>

        {/* Powered by */}
        <div className="lfr-landing__powered">
          Powered by <strong>Digitcan</strong>
        </div>
      </div>
    </div>
  );
};

// ─── Body Outline SVG with measurement lines ──────────────────────────────────
function BodyOutlineSVG() {
  return (
    <svg
      viewBox="0 0 200 380"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="lfr-body-svg"
      aria-label="Body outline with measurement lines"
    >
      {/* Body silhouette */}
      <ellipse cx="100" cy="32" rx="18" ry="22" stroke="currentColor" strokeWidth="2" />
      {/* Neck */}
      <rect x="93" y="52" width="14" height="16" rx="4" stroke="currentColor" strokeWidth="1.5" />
      {/* Torso */}
      <path d="M68 68 Q60 90 58 130 Q56 160 62 190 L138 190 Q144 160 142 130 Q140 90 132 68 Z"
        stroke="currentColor" strokeWidth="2" fill="none" />
      {/* Left arm */}
      <path d="M68 72 Q50 100 46 140 Q44 160 46 175" stroke="currentColor" strokeWidth="1.5" />
      {/* Right arm */}
      <path d="M132 72 Q150 100 154 140 Q156 160 154 175" stroke="currentColor" strokeWidth="1.5" />
      {/* Left leg */}
      <path d="M78 190 Q72 240 70 290 Q68 330 70 360" stroke="currentColor" strokeWidth="2" />
      {/* Right leg */}
      <path d="M122 190 Q128 240 130 290 Q132 330 130 360" stroke="currentColor" strokeWidth="2" />

      {/* ── Measurement lines ── */}
      <MeasureLine x1={60} y1={75} x2={140} y2={75} label="Shoulder" labelX={100} labelY={69} />
      <MeasureLine x1={58} y1={100} x2={142} y2={100} label="Chest" labelX={148} labelY={100} />
      <MeasureLine x1={60} y1={140} x2={140} y2={140} label="Waist" labelX={148} labelY={140} />
      <MeasureLine x1={62} y1={180} x2={138} y2={180} label="Hip" labelX={148} labelY={180} />

      {/* Height vertical */}
      <line x1={20} y1={10} x2={20} y2={360} stroke="#E5C158" strokeWidth="1" strokeDasharray="3,3" opacity="0.6" />
      <line x1={16} y1={10} x2={24} y2={10} stroke="#E5C158" strokeWidth="1.5" opacity="0.8" />
      <line x1={16} y1={360} x2={24} y2={360} stroke="#E5C158" strokeWidth="1.5" opacity="0.8" />
      <text x={10} y={188} fill="#E5C158" fontSize="7" fontFamily="monospace" textAnchor="middle"
        transform="rotate(-90 10 188)" opacity="0.9">Height</text>
    </svg>
  );
}

interface MeasureLineProps {
  x1: number; y1: number; x2: number; y2: number;
  label: string; labelX?: number; labelY?: number;
}
function MeasureLine({ x1, y1, x2, y2, label, labelX, labelY }: MeasureLineProps) {
  const mx = labelX ?? (x1 + x2) / 2;
  const my = labelY ?? y1 - 6;
  return (
    <g opacity="0.75">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#D8B4A0" strokeWidth="1" strokeDasharray="4,3" />
      <line x1={x1} y1={y1 - 4} x2={x1} y2={y1 + 4} stroke="#D8B4A0" strokeWidth="1.5" />
      <line x1={x2} y1={y2 - 4} x2={x2} y2={y2 + 4} stroke="#D8B4A0" strokeWidth="1.5" />
      <text x={mx} y={my} fill="#D8B4A0" fontSize="7" fontFamily="monospace" textAnchor="middle">{label}</text>
    </g>
  );
}

function ArrowIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
