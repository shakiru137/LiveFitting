import { useState, useCallback, useEffect } from 'react';
import { LandingScreen }     from './components/LandingScreen';
import { MeasurementScreen } from './components/MeasurementScreen';
import { ResultsScreen }     from './components/ResultsScreen';
import { useMeasurementSession } from './hooks/useMeasurementSession';
import type { MeasurementResult } from './types';

type AppScreen = 'landing' | 'measuring' | 'results';

function getUrlParams() {
  const p = new URLSearchParams(window.location.search);
  return {
    clientId:   p.get('clientId'),
    customerId: p.get('customerId'),
  };
}

export function App() {
  const [screen, setScreen]         = useState<AppScreen>('landing');
  const [result, setResult]         = useState<MeasurementResult | null>(null);
  const [userHeightCm, setUserHeightCm] = useState(168);
  const { clientId, customerId }    = getUrlParams();

  const { sessionRef, createSession, updateStatus, submitMeasurements, recordCopyEvent } = useMeasurementSession();

  // If embedded via iframe, notify parent on close
  const handleClose = useCallback(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'LFR_CLOSE' }, '*');
    }
    setScreen('landing');
  }, []);

  // Start measurement flow: create session then open camera
  const handleStart = useCallback(async () => {
    setScreen('measuring');
    await createSession(clientId ?? 'digitcan', customerId ?? undefined);
    await updateStatus('ACTIVE');
  }, [clientId, customerId, createSession, updateStatus]);

  // Called by MeasurementScreen when measurements are ready locally
  const handleComplete = useCallback((r: MeasurementResult) => {
    setResult(r);
    setScreen('results');
  }, []);

  // Measure again — restart flow
  const handleMeasureAgain = useCallback(async () => {
    setResult(null);
    setScreen('measuring');
    await createSession(clientId ?? 'digitcan', customerId ?? undefined);
    await updateStatus('ACTIVE');
  }, [clientId, customerId, createSession, updateStatus]);

  // Listen for postMessage from SDK parent (e.g. height calibration override)
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'LFR_SET_HEIGHT' && typeof e.data.heightCm === 'number') {
        setUserHeightCm(e.data.heightCm);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  return (
    <div className="lfr-app">
      {screen === 'landing' && (
        <LandingScreen onStart={handleStart} />
      )}

      {screen === 'measuring' && (
        <MeasurementScreen
          clientId={clientId}
          customerId={customerId}
          sessionRef={sessionRef}
          userHeightCm={userHeightCm}
          onHeightChange={setUserHeightCm}
          onComplete={handleComplete}
          onClose={handleClose}
        />
      )}

      {screen === 'results' && result && (
        <ResultsScreen
          result={result}
          onMeasureAgain={handleMeasureAgain}
          onSaveDetails={submitMeasurements}
          onRecordCopy={recordCopyEvent}
          onClose={handleClose}
        />
      )}
    </div>
  );
}

export default App;
