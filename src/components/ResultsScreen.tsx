import React, { useState } from 'react';
import type { MeasurementResult } from '../types';

interface ResultsScreenProps {
  result: MeasurementResult;
  onMeasureAgain: () => void;
  onSaveDetails: (result: MeasurementResult) => Promise<boolean>;
  onRecordCopy?: (sessionRef: string) => void;
  onClose?: () => void;
}

const CM_PER_IN = 0.393701;
const fmt = (v: number | null | undefined, decimals = 1) =>
  v != null ? v.toFixed(decimals) : '—';

interface MRow {
  label: string;
  key: keyof MeasurementResult['measurements']['cm'];
  color: string;
}

const ROWS: MRow[] = [
  { label: 'Height',            key: 'height',            color: '#E5C158' },
  { label: 'Head Circumference',key: 'headCircumference',  color: '#94A3B8' },
  { label: 'Neck Circumference',key: 'neckCircumference',  color: '#64748B' },
  { label: 'Shoulder Width',    key: 'shoulderWidth',      color: '#D8B4A0' },
  { label: 'Chest',             key: 'chestGirth',         color: '#F472B6' },
  { label: 'Waist',             key: 'waistGirth',         color: '#4ADE80' },
  { label: 'Hips',              key: 'hipGirth',           color: '#38BDF8' },
  { label: 'Torso Length',      key: 'torsoLength',        color: '#FACC15' },
  { label: 'Sleeve Length',     key: 'sleeveLength',       color: '#C084FC' },
  { label: 'Trouser Length',    key: 'trouserLength',      color: '#FB923C' },
  { label: 'Skirt Length',      key: 'skirtLength',        color: '#A78BFA' },
];

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  result,
  onMeasureAgain,
  onSaveDetails,
  onRecordCopy,
  onClose,
}) => {
  const [unit, setUnit]             = useState<'cm' | 'in'>('cm');
  const [copied, setCopied]         = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const cm = result.measurements.cm;

  // ── Save Details & Auto-Close Flow ─────────────────────────────────────────
  const handleSaveDetails = async () => {
    setSaveStatus('saving');
    const ok = await onSaveDetails(result);
    if (ok) {
      setSaveStatus('saved');
      // Auto-close experience after brief confirmation delay to return user to client website
      setTimeout(() => {
        if (onClose) onClose();
      }, 1400);
    } else {
      setSaveStatus('error');
    }
  };

  // ── Controlled Copy Measurements & Telemetry Logging ─────────────────────
  const handleCopy = async () => {
    const lines = [
      `LiveFittingRoom — Body Measurements`,
      ...ROWS.map((r) => {
        const valCm = cm[r.key];
        const valIn = valCm != null ? valCm * CM_PER_IN : null;
        const display = unit === 'cm'
          ? (valCm != null ? `${fmt(valCm)} cm` : '—')
          : (valIn != null ? `${fmt(valIn)} in` : '—');
        return `  ${r.label.padEnd(20)} ${display}`;
      }),
      ``,
      result.suggestedSize ? `Suggested Size: ${result.suggestedSize}` : '',
    ].filter(Boolean).join('\n');

    try {
      await navigator.clipboard.writeText(lines);
      setCopied(true);
      if (onRecordCopy) {
        onRecordCopy(result.sessionRef);
      }
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.warn('Clipboard write failed:', err);
    }
  };

  return (
    <div
      className="lfr-results"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: 'none', WebkitUserSelect: 'none' }}
    >
      {/* Customer Header */}
      <div className="lfr-results__header">
        <div className="lfr-results__check">
          <CheckIcon />
        </div>
        <h2 className="lfr-results__title">Your Measurements</h2>
      </div>

      {/* Optional Sizing Badge */}
      {result.suggestedSize && (
        <div className="lfr-results__quality">
          <div className="lfr-results__size-badge">
            Suggested size: <strong>{result.suggestedSize}</strong>
          </div>
        </div>
      )}

      {/* Unit Toggle */}
      <div className="lfr-results__unit-toggle">
        <button
          className={`lfr-results__unit-btn ${unit === 'cm' ? 'active' : ''}`}
          onClick={() => setUnit('cm')}
        >cm</button>
        <button
          className={`lfr-results__unit-btn ${unit === 'in' ? 'active' : ''}`}
          onClick={() => setUnit('in')}
        >inches</button>
      </div>

      {/* Measurements List */}
      <div className="lfr-results__measurements">
        {ROWS.map((row) => {
          const valCm  = cm[row.key];
          const valIn  = valCm != null ? valCm * CM_PER_IN : null;
          const display = unit === 'cm'
            ? (valCm != null ? `${fmt(valCm)} cm` : '—')
            : (valIn != null ? `${fmt(valIn)} in` : '—');
          const isNull = valCm == null;

          return (
            <div
              key={row.key}
              className={`lfr-results__row ${isNull ? 'lfr-results__row--empty' : ''}`}
              style={{ borderLeftColor: row.color }}
            >
              <span className="lfr-results__row-label">{row.label}</span>
              <span className="lfr-results__row-val">{display}</span>
            </div>
          );
        })}
      </div>

      {/* Save Details Status & Auto-Close Confirmation */}
      <div className="lfr-results__save-area">
        {saveStatus === 'idle' && (
          <button className="lfr-btn lfr-btn--primary lfr-results__save-btn" onClick={handleSaveDetails}>
            <SaveIcon />
            <span>Save Details</span>
          </button>
        )}

        {saveStatus === 'saving' && (
          <div className="lfr-results__save-banner lfr-results__save-banner--saving">
            <SpinnerIcon />
            <span>Saving details...</span>
          </div>
        )}

        {saveStatus === 'saved' && (
          <div className="lfr-results__save-banner lfr-results__save-banner--success">
            <CheckCircleIcon />
            <div>
              <strong className="lfr-results__save-title">Details Saved Successfully</strong>
              <p className="lfr-results__save-desc">Returning to store page...</p>
            </div>
          </div>
        )}

        {saveStatus === 'error' && (
          <div className="lfr-results__save-banner lfr-results__save-banner--error">
            <AlertIcon />
            <div className="lfr-results__save-error-body">
              <strong className="lfr-results__save-title">Unable to save your details.</strong>
              <p className="lfr-results__save-desc">Your measurements are still available on this screen.</p>
              <button className="lfr-btn lfr-btn--primary lfr-btn--sm" onClick={handleSaveDetails}>
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Secondary Actions */}
      <div className="lfr-results__actions">
        <button className="lfr-btn lfr-btn--outline" onClick={onMeasureAgain}>
          <RefreshIcon />
          <span>Measure Again</span>
        </button>
        <button className="lfr-btn lfr-btn--ghost" onClick={handleCopy}>
          <CopyIcon />
          <span>{copied ? 'Copied' : 'Copy Measurements'}</span>
        </button>
      </div>

      {/* Powered by Attribution */}
      <div className="lfr-results__powered">
        Powered by <strong>Digitcan</strong>
      </div>
    </div>
  );
};

function CheckIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <polyline points="17 21 17 13 7 13 7 21" />
      <polyline points="7 3 7 8 15 8" />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="lfr-spin">
      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" strokeOpacity="1" strokeLinecap="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function AlertIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
