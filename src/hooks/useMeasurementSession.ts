import { useState, useCallback, useRef } from 'react';
import type { MeasurementResult } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

export interface CleanPartnerPayload {
  measurements: {
    height: number | null;
    head: number | null;
    neck: number | null;
    shoulder: number | null;
    chest: number | null;
    waist: number | null;
    hip: number | null;
    torso: number | null;
    sleeve: number | null;
    trouser: number | null;
    skirt: number | null;
  };
  unit: string;
  suggestedSize?: string | null;
}

interface UseSessionReturn {
  sessionRef: string | null;
  createSession: (clientId?: string, customerId?: string) => Promise<string | null>;
  updateStatus: (status: string) => Promise<void>;
  submitMeasurements: (result: MeasurementResult) => Promise<boolean>;
  recordCopyEvent: (refOverride?: string) => Promise<void>;
  isSubmitting: boolean;
  error: string | null;
}

/**
 * Returns true for unpersisted client-side temporary session references (LOCAL-*)
 * that must NEVER be sent directly to backend database persistence routes.
 */
function isLocalRef(ref: string | null | undefined): boolean {
  if (!ref || typeof ref !== 'string') return true;
  return ref.startsWith('LOCAL-');
}

export function useMeasurementSession(): UseSessionReturn {
  const [sessionRef, setSessionRef] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Authoritative backend session reference created by POST /api/sessions.
  const backendSessionRefRef = useRef<string | null>(null);

  const createSession = useCallback(async (
    clientId = 'digitcan',
    customerId?: string
  ): Promise<string | null> => {
    try {
      console.log(`[SessionCreate] requesting backend session for clientId: "${clientId}"`);

      const res = await fetch(`${API_BASE}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, customerId }),
      });

      console.log(`[SessionCreate] backend session response status: ${res.status}`);

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[SessionCreate] Session creation failed (${res.status}):`, errorText);
        throw new Error(`Session creation failed (${res.status}): ${errorText}`);
      }

      const data = await res.json();
      console.log('[SessionCreate] response keys:', Object.keys(data));
      console.log('[SessionCreate] session keys:', data?.session ? Object.keys(data.session) : null);
      console.log('[SessionCreate] sessionRef value:', data?.session?.sessionRef);

      const ref: unknown = data?.session?.sessionRef ?? data?.sessionRef ?? data?.ref;

      if (!ref || typeof ref !== 'string' || isLocalRef(ref)) {
        console.error('[SessionCreate] Malformed session response — no valid sessionRef found:', data);
        throw new Error('Backend response did not contain a valid sessionRef');
      }

      console.log(`[SessionCreate] backend sessionRef received: "${ref}"`);

      setSessionRef(ref);
      backendSessionRefRef.current = ref;

      return ref;
    } catch (err) {
      console.error('[SessionCreate] createSession error:', err);
      setError(err instanceof Error ? err.message : 'Session connection failed');
      return null;
    }
  }, []);

  const updateStatus = useCallback(async (status: string): Promise<void> => {
    const ref = backendSessionRefRef.current;
    if (!ref || isLocalRef(ref)) return;
    try {
      await fetch(`${API_BASE}/api/sessions/${ref}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.warn('[useMeasurementSession] updateStatus notice:', err);
    }
  }, []);

  const recordCopyEvent = useCallback(async (refOverride?: string): Promise<void> => {
    const ref = refOverride || backendSessionRefRef.current;
    if (!ref || isLocalRef(ref)) return;
    try {
      await fetch(`${API_BASE}/api/sessions/${ref}/telemetry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'measurements_copied' }),
      });
    } catch (err) {
      console.warn('[useMeasurementSession] recordCopyEvent notice:', err);
    }
  }, []);

  const submitMeasurements = useCallback(async (result: MeasurementResult): Promise<boolean> => {
    // ── Step 1: Determine authoritative backend session reference ──────────────
    let backendRef = backendSessionRefRef.current;

    console.log(`[SessionSave] current ref before create: "${backendRef}"`);

    if (!backendRef || isLocalRef(backendRef)) {
      const targetClientId = result.clientId || 'digitcan';
      const targetCustomerId = result.customerId || undefined;

      console.log(`[SessionSave] requesting backend session: clientId="${targetClientId}", customerId="${targetCustomerId ?? 'none'}"`);

      backendRef = await createSession(targetClientId, targetCustomerId);

      console.log(`[SessionSave] backend sessionRef received: "${backendRef}"`);
    }

    // ── Step 2: Guard — must have a real backend ref by now ───────────────────
    if (!backendRef || isLocalRef(backendRef)) {
      console.error(
        '[SessionSave] Cannot submit measurements: backend sessionRef unresolved after createSession attempt.',
        'Current backendRef:', backendRef
      );
      setError('Unable to reach backend session service. Please try again.');
      return false;
    }

    // ── Step 3: Submit measurements using the confirmed backend ref ───────────
    console.log(`[SessionSave] submitting measurements with ref: "${backendRef}"`);

    setIsSubmitting(true);
    setError(null);
    try {
      const body = {
        heightCm: result.userHeightCm,
        headCircumferenceCm: result.measurements.cm.headCircumference,
        neckCircumferenceCm: result.measurements.cm.neckCircumference,
        shoulderWidthCm: result.measurements.cm.shoulderWidth,
        chestGirthCm: result.measurements.cm.chestGirth,
        waistGirthCm: result.measurements.cm.waistGirth,
        hipGirthCm: result.measurements.cm.hipGirth,
        torsoLengthCm: result.measurements.cm.torsoLength,
        sleeveLengthCm: result.measurements.cm.sleeveLength,
        trouserLengthCm: result.measurements.cm.trouserLength,
        skirtLengthCm: result.measurements.cm.skirtLength,
        suggestedSize: result.suggestedSize,
        overallConfidence: result.quality.confidence,
        stabilityScore: result.quality.stabilityScore,
        framesAnalyzed: result.quality.framesAnalyzed,
        qualityGrade: result.quality.grade,
      };

      const res = await fetch(`${API_BASE}/api/sessions/${backendRef}/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => '');
        console.error(`[SessionSave] Measurement submission failed (${res.status}):`, errorText);
        throw new Error(`Submit failed with status ${res.status}: ${errorText}`);
      }

      const resData = await res.json().catch(() => ({}));
      console.log('[SessionSave] Measurement submission successfully saved:', resData);

      // ── Step 4: Mark session complete ──────────────────────────────────────
      await updateStatus('COMPLETE');

      // ── Step 5: Notify partner SDK via postMessage ─────────────────────────
      const cleanPartnerPayload: CleanPartnerPayload = {
        measurements: {
          height:   result.measurements.cm.height,
          head:     result.measurements.cm.headCircumference,
          neck:     result.measurements.cm.neckCircumference,
          shoulder: result.measurements.cm.shoulderWidth,
          chest:    result.measurements.cm.chestGirth,
          waist:    result.measurements.cm.waistGirth,
          hip:      result.measurements.cm.hipGirth,
          torso:    result.measurements.cm.torsoLength,
          sleeve:   result.measurements.cm.sleeveLength,
          trouser:  result.measurements.cm.trouserLength,
          skirt:    result.measurements.cm.skirtLength,
        },
        unit: 'cm',
        suggestedSize: result.suggestedSize ?? null,
      };

      if (window.parent !== window) {
        window.parent.postMessage({ type: 'LFR_COMPLETE', result: cleanPartnerPayload }, '*');
      }

      return true;
    } catch (err) {
      console.error('[SessionSave] submit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save measurements');
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [createSession, updateStatus]);

  return { sessionRef, createSession, updateStatus, submitMeasurements, recordCopyEvent, isSubmitting, error };
}
