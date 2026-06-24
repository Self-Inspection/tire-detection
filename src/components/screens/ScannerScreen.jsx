import { useRef, useEffect, useState } from 'react';
import useCamera from '../../hooks/useCamera.js';
import useChatGPTScanAnalysis from '../../hooks/useChatGPTScanAnalysis.js';
import GuidanceOverlay from '../ui/GuidanceOverlay.jsx';
import ProgressRing from '../ui/ProgressRing.jsx';

export default function ScannerScreen({ tireType, scanConfig, onComplete, onCancel }) {
  const videoRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const { error: cameraError, isReady } = useCamera(videoRef);

  const {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    lastNotes,
    attempt,
    maxAttempts,
    triggerCapture,
    canCapture
  } = useChatGPTScanAnalysis({
    videoRef,
    isReady,
    tireType,
    scanConfig
  });

  const activeError = cameraError || analysisError;

  useEffect(() => {
    if (isComplete && scanResult) onComplete(scanResult);
  }, [isComplete, scanResult]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let lock = null;
    navigator.wakeLock?.request('screen')
      .then(l => { lock = l; })
      .catch(() => {});
    return () => { lock?.release(); };
  }, []);

  useEffect(() => {
    history.pushState(null, '', window.location.href);
    const onPop = () => {
      history.pushState(null, '', window.location.href);
      setShowConfirm(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const loading = !isReady ? 'Accessing camera…' : null;

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      />

      {loading && (
        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4 z-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">{loading}</p>
        </div>
      )}

      {activeError && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-20">
          <div className="bg-dark-card rounded-xl p-6 text-center max-w-xs">
            <p className="text-red-400 mb-4 text-sm">{activeError}</p>
            <button onClick={onCancel} className="text-blue-400 text-sm underline">Go Back</button>
          </div>
        </div>
      )}

      <GuidanceOverlay guidance={guidance} />

      {isAnalyzing && !loading && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-10 pointer-events-none">
          <div className="bg-purple-700/90 rounded-full px-4 py-1.5 text-xs text-white">
            Analyzing photo…
          </div>
        </div>
      )}

      {!loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-blue-400/60 rounded-lg"
               style={{ width: '40%', height: '80%', boxShadow: '0 0 0 2000px rgba(0,0,0,0.20)' }} />
        </div>
      )}

      {!loading && (
        <div className="absolute bottom-0 left-0 right-0 safe-bottom flex flex-col items-center pb-8 gap-3 z-10 px-6">
          {isAnalyzing && <ProgressRing progress={progress} />}
          <p className="text-white/60 text-xs text-center">
            {isAnalyzing
              ? 'Sending photo for groove analysis…'
              : 'Grooves should run left-to-right in bracket. Tap Capture'}
          </p>
          {lastNotes && (
            <p className="text-white/40 text-[10px] text-center line-clamp-3">
              {lastNotes}{attempt > 0 && !isAnalyzing ? ` (${attempt}/${maxAttempts})` : ''}
            </p>
          )}
          {!isAnalyzing && (
            <button
              onClick={triggerCapture}
              disabled={!canCapture}
              style={{ touchAction: 'manipulation' }}
              className="w-full max-w-xs py-4 rounded-xl bg-blue-600 text-white font-semibold text-base
                disabled:opacity-40 disabled:cursor-not-allowed active:bg-blue-700"
            >
              Capture
            </button>
          )}
        </div>
      )}

      {!loading && (
        <div className="absolute top-0 right-0 safe-top p-4 z-10">
          <button
            onClick={() => setShowConfirm(true)}
            style={{ touchAction: 'manipulation' }}
            className="bg-black/50 backdrop-blur text-white text-sm px-4 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

      {showConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6 z-30">
          <div className="bg-dark-card rounded-xl p-6 w-full max-w-xs text-center">
            <p className="font-semibold mb-1">Cancel scan?</p>
            <p className="text-gray-400 text-sm mb-6">Your progress will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-lg bg-dark-surface text-sm"
              >
                Keep Scanning
              </button>
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-lg bg-red-600 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
