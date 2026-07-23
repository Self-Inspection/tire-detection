import { useRef, useEffect, useState } from 'react';
import useCamera from '../../hooks/useCamera.js';
import useChatGPTScanAnalysis from '../../hooks/useChatGPTScanAnalysis.js';
import GuidanceOverlay from '../ui/GuidanceOverlay.jsx';
import ProgressRing from '../ui/ProgressRing.jsx';
import { SCAN_ROI_STYLE } from '../../utils/scanRoi.js';

const SETUP_STEPS = [
  { icon: '📱', text: 'Hold the phone upright, 30–40 cm from the tire' },
  { icon: '🔦', text: 'Flashlight turns on automatically for even lighting' },
  { icon: '📏', text: 'Line up the tread so grooves run top-to-bottom in the blue box' },
  { icon: '📸', text: 'Tap Capture — 3 quick photos, phone buzzes when done' }
];

export default function ScannerScreen({ tireType, scanConfig, onComplete, onCancel }) {
  const videoRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSetup, setShowSetup] = useState(true);

  const { error: cameraError, isReady, hasTorch, torchOn, toggleTorch } = useCamera(videoRef);

  const {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    isCapturing,
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
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
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

      {/* Environment setup — align camera before first capture */}
      {showSetup && !loading && !activeError && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-40">
          <div className="bg-dark-card rounded-2xl p-6 w-full max-w-sm">
            <p className="text-lg font-bold mb-4 text-center">Set up your shot</p>
            <div className="space-y-3 mb-6">
              {SETUP_STEPS.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-xl shrink-0">{s.icon}</span>
                  <p className="text-sm text-gray-200 leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
            {!hasTorch && (
              <p className="text-[11px] text-gray-500 mb-4 text-center">
                Flashlight isn't available in this browser — make sure the tread is well lit.
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowSetup(false)}
              style={{ touchAction: 'manipulation' }}
              className="w-full min-h-[52px] py-4 rounded-xl bg-blue-600 text-white font-semibold text-base
                active:bg-blue-700 active:scale-[0.98]"
            >
              I'm lined up
            </button>
          </div>
        </div>
      )}

      {!showSetup && <GuidanceOverlay guidance={guidance} />}

      {isAnalyzing && !loading && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-purple-700/90 rounded-full px-4 py-1.5 text-xs text-white">
            Analyzing photos…
          </div>
        </div>
      )}

      {isCapturing && !loading && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-blue-700/90 rounded-full px-4 py-1.5 text-xs text-white">
            Hold steady…
          </div>
        </div>
      )}

      {/* ROI bracket — must not intercept touches */}
      {!loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[1]">
          <div
            className="border-2 border-blue-400/60 rounded-lg pointer-events-none"
            style={{ ...SCAN_ROI_STYLE, boxShadow: '0 0 0 2000px rgba(0,0,0,0.20)' }}
          />
        </div>
      )}

      {/* Flashlight toggle — top left */}
      {!loading && hasTorch && (
        <div className="absolute top-0 left-0 safe-top p-4 z-50">
          <button
            type="button"
            onClick={toggleTorch}
            style={{ touchAction: 'manipulation' }}
            className={`backdrop-blur text-sm px-4 py-2 rounded-lg
              ${torchOn ? 'bg-yellow-500/90 text-black font-semibold' : 'bg-black/50 text-white'}`}
          >
            🔦 {torchOn ? 'On' : 'Off'}
          </button>
        </div>
      )}

      {/* Cancel — top layer */}
      {!loading && (
        <div className="absolute top-0 right-0 safe-top p-4 z-50">
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            style={{ touchAction: 'manipulation' }}
            className="bg-black/50 backdrop-blur text-white text-sm px-4 py-2 rounded-lg"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Bottom controls — above all overlays, safe-area aware */}
      {!loading && !showSetup && (
        <div
          className="absolute bottom-0 left-0 right-0 z-50 pointer-events-auto
            bg-gradient-to-t from-black via-black/90 to-transparent
            pt-10 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex flex-col items-center gap-3 max-w-xs mx-auto">
            {isAnalyzing && <ProgressRing progress={progress} />}
            <p className="text-white/60 text-xs text-center pointer-events-none">
              {isAnalyzing
                ? 'Sending photos for groove analysis…'
                : '30–40 cm away · grooves vertical in the blue box'}
            </p>
            {lastNotes && (
              <p className="text-white/40 text-[10px] text-center line-clamp-3 pointer-events-none">
                {lastNotes}{attempt > 0 && !isAnalyzing ? ` (${attempt}/${maxAttempts})` : ''}
              </p>
            )}
            {!isAnalyzing && !isCapturing && (
              <button
                type="button"
                onClick={triggerCapture}
                disabled={!canCapture}
                style={{ touchAction: 'manipulation' }}
                className="w-full min-h-[52px] py-4 rounded-xl bg-blue-600 text-white font-semibold text-base
                  shadow-lg shadow-blue-900/40
                  disabled:opacity-40 disabled:cursor-not-allowed active:bg-blue-700 active:scale-[0.98]"
              >
                Capture
              </button>
            )}
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6 z-[60]">
          <div className="bg-dark-card rounded-xl p-6 w-full max-w-xs text-center">
            <p className="font-semibold mb-1">Leave without results?</p>
            <p className="text-gray-400 text-sm mb-6">Your photo will be discarded.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-lg bg-dark-surface text-sm"
              >
                Keep Capturing
              </button>
              <button
                type="button"
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
