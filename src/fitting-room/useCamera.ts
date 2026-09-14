import { useRef, useCallback } from 'react';

/**
 * Waits until HTMLVideoElement reaches HAVE_ENOUGH_DATA (readyState === 4)
 */
export function waitForVideoReady(videoEl: HTMLVideoElement, timeoutMs = 10000): Promise<boolean> {
  return new Promise((resolve) => {
    if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve(true);
      return;
    }

    const timer = setTimeout(() => {
      videoEl.removeEventListener('loadeddata', check);
      videoEl.removeEventListener('canplay', check);
      videoEl.removeEventListener('playing', check);
      resolve(videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
    }, timeoutMs);

    function check() {
      if (videoEl.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
        clearTimeout(timer);
        videoEl.removeEventListener('loadeddata', check);
        videoEl.removeEventListener('canplay', check);
        videoEl.removeEventListener('playing', check);
        resolve(true);
      }
    }

    videoEl.addEventListener('loadeddata', check);
    videoEl.addEventListener('canplay', check);
    videoEl.addEventListener('playing', check);
  });
}

/**
 * Persistent camera hook.
 * Attaches user webcam stream to the provided DOM video element.
 */
export function useCamera() {
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async (videoEl: HTMLVideoElement | null): Promise<boolean> => {
    if (!videoEl) return false;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Webcam API not supported in this browser');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      videoEl.srcObject = stream;
      await videoEl.play();
      
      const isReady = await waitForVideoReady(videoEl);
      return isReady;
    } catch (err) {
      console.warn('[useCamera] Camera access failed or denied:', err);
      return false;
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  return { startCamera, stopCamera };
}
