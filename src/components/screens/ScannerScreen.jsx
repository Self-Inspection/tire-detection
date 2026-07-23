import { useRef, useEffect, useState } from 'react';
import useCamera from '../../hooks/useCamera.js';
import useDeviceMotion from '../../hooks/useDeviceMotion.js';
import useChatGPTScanAnalysis from '../../hooks/useChatGPTScanAnalysis.js';
import GuidanceOverlay from '../ui/GuidanceOverlay.jsx';
import ProgressRing from '../ui/ProgressRing.jsx';
import { SCAN_ROI_STYLE } from '../../utils/scanRoi.js';

const SETUP_STEPS = [
  { icon: '📏', text: 'Hold ~20 cm (8 in) from the tread, parallel to the tire' },
  { icon: '➡️', text: 'Start at the OUTER edge of the tread (away from the car)' },
  { icon: '🎥', text: 'Tap Record, then sweep slowly toward the inner edge (~7 s). The phone buzzes when done.' },
  { icon: '💡', text: 'Avoid shadows and reflections — the flashlight turns on automatically' }
];

/** Sweep pace thresholds (deg/s rotation) for live recording feedback. */
const SWEEP_TOO_FAST = 80;
const SWEEP_STOPPED = 3;

function useIsLandscape() {
  const [isLandscape, setIsLandscape] = useState(
    () => window.matchMedia('(orientation: landscape)').matches
  );
  useEffect(() => {
    const mq = window.matchMedia('(orientation: landscape)');
    const onChange = e => setIsLandscape(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isLandscape;
}

function FramingChip({ ok, okText, badText }) {
  if (ok == null) return null;
  return (
    <span className={`text-[11px] px-2.5 py-1 rounded-full backdrop-blur
      ${ok ? 'bg-green-600/80 text-white' : 'bg-red-600/80 text-white'}`}>
      {ok ? `✓ ${okText}` : `✕ ${badText}`}
    </span>
  );
}

export default function ScannerScreen({ tireType, scanConfig, onComplete, onCancel }) {
  const videoRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSetup, setShowSetup] = useState(true);
  const isLandscape = useIsLandscape();

  const { error: cameraError, isReady, hasTorch, torchOn, toggleTorch } = useCamera(videoRef);
  const { requestPermission: requestMotion, parallelOk, steadyOk, sweepSpeed } = useDeviceMotion();

  const {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    analysisSeconds,
    isRecording,
    recordProgress,
    framing,
    lastNotes,
    attemptFailed,
    attempt,
    maxAttempts,
    triggerRecord,
    canRecord
  } = useChatGPTScanAnalysis({
    videoRef,
    isReady,
    tireType,
    scanConfig
  });

  const activeError = cameraError || analysisError;

  // Record is enabled only when every available check passes.
  // Motion checks are null when sensors are unavailable/denied — don't block on those.
  const allChecksPass =
    framing.lightOk === true &&
    framing.treadOk === true &&
    parallelOk !== false &&
    steadyOk !== false;

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
  const positionLabel = scanConfig?.tirePosition?.label;

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

      {/* Orientation gate — sweep scanning is landscape-only */}
      {!isLandscape && !loading && !activeError && (
        <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-4 p-8 z-40">
          <div className="text-6xl animate-pulse">🔄</div>
          <p className="text-white text-lg font-semibold text-center">Rotate your phone sideways</p>
          <p className="text-gray-400 text-sm text-center max-w-xs">
            The tread scan records in landscape. Turn your phone horizontally and hold it
            parallel to the tire, about 20 cm away.
          </p>
        </div>
      )}

      {/* Environment setup — shown once, in landscape, before first recording */}
      {showSetup && isLandscape && !loading && !activeError && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-40 overflow-y-auto">
          <div className="bg-dark-card rounded-2xl p-5 w-full max-w-md">
            <p className="text-lg font-bold mb-3 text-center">
              {positionLabel ? `Scan: ${positionLabel} tire` : 'Set up your scan'}
            </p>
            <div className="space-y-2.5 mb-5">
              {SETUP_STEPS.map((s, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-lg shrink-0">{s.icon}</span>
                  <p className="text-sm text-gray-200 leading-snug">{s.text}</p>
                </div>
              ))}
            </div>
            {!hasTorch && (
              <p className="text-[11px] text-gray-500 mb-3 text-center">
                Flashlight isn't available in this browser — make sure the tread is well lit.
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                // iOS motion sensors need a permission request from a user gesture
                requestMotion();
                setShowSetup(false);
              }}
              style={{ touchAction: 'manipulation' }}
              className="w-full min-h-[48px] py-3 rounded-xl bg-blue-600 text-white font-semibold text-base
                active:bg-blue-700 active:scale-[0.98]"
            >
              Start Scan
            </button>
          </div>
        </div>
      )}

      {!showSetup && isLandscape && <GuidanceOverlay guidance={guidance} />}

      {isAnalyzing && !loading && (
        <div className="absolute top-16 left-0 right-0 flex justify-center z-20 pointer-events-none">
          <div className="bg-purple-700/90 rounded-full px-4 py-1.5 text-xs text-white">
            Analyzing sweep… {analysisSeconds}s
          </div>
        </div>
      )}

      {/* Prominent feedback when a sweep didn't produce a reading */}
      {attemptFailed && !isRecording && !isAnalyzing && !loading && !activeError && isLandscape && !showSetup && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center px-8 z-30 pointer-events-none">
          <div className="bg-amber-600/95 rounded-xl px-5 py-4 max-w-sm shadow-xl">
            <p className="text-white text-sm font-semibold mb-1">No reading from that sweep</p>
            <p className="text-white/90 text-xs leading-snug">{lastNotes}</p>
          </div>
        </div>
      )}

      {isRecording && !loading && (
        <div className="absolute top-16 left-0 right-0 flex flex-col items-center gap-2 z-20 pointer-events-none px-8">
          <div className={`rounded-full px-4 py-1.5 text-xs text-white flex items-center gap-2
            ${sweepSpeed != null && sweepSpeed > SWEEP_TOO_FAST ? 'bg-orange-600/95' : 'bg-red-600/90'}`}>
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            {sweepSpeed == null
              ? 'Recording — sweep slowly toward the inner edge'
              : sweepSpeed > SWEEP_TOO_FAST
                ? 'Move slower'
                : sweepSpeed < SWEEP_STOPPED
                  ? 'Keep moving — sweep toward the inner edge'
                  : 'Good pace — keep sweeping'}
          </div>
          <div className="w-full max-w-sm h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-red-500 transition-all duration-300"
              style={{ width: `${Math.round(recordProgress * 100)}%` }}
            />
          </div>
          <p className="text-white/60 text-[10px]">{Math.round(recordProgress * 100)}% · outer → inner</p>
        </div>
      )}

      {/* ROI bracket — must not intercept touches */}
      {!loading && isLandscape && (
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
      {!loading && !showSetup && isLandscape && (
        <div
          className="absolute bottom-0 left-0 right-0 z-50 pointer-events-auto
            bg-gradient-to-t from-black via-black/90 to-transparent
            pt-8 px-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <div className="flex flex-col items-center gap-2 max-w-md mx-auto">
            {isAnalyzing && <ProgressRing progress={progress} />}

            {/* Live quality checks while lining up — all must pass to enable Record */}
            {!isRecording && !isAnalyzing && (
              <div className="flex flex-wrap justify-center gap-1.5 pointer-events-none">
                <FramingChip ok={framing.treadOk} okText="Tread found" badText="Find the tire tread" />
                <FramingChip ok={framing.lightOk} okText="Lighting" badText="Improve lighting" />
                <FramingChip ok={parallelOk} okText="Parallel" badText="Rotate phone" />
                <FramingChip ok={steadyOk} okText="Steady" badText="Hold steady" />
              </div>
            )}

            <p className="text-white/60 text-xs text-center pointer-events-none">
              {isAnalyzing
                ? `AI is measuring the tread — usually 30–90 s (${analysisSeconds}s)`
                : isRecording
                  ? 'Keep the tread inside the blue box'
                  : allChecksPass
                    ? '✓ Ready to scan'
                    : `${positionLabel ? positionLabel + ' · ' : ''}~20 cm away · parallel to the tire`}
            </p>
            {lastNotes && !isRecording && (
              <p className="text-white/40 text-[10px] text-center line-clamp-2 pointer-events-none">
                {lastNotes}{attempt > 0 && !isAnalyzing ? ` (${attempt}/${maxAttempts})` : ''}
              </p>
            )}
            {!isAnalyzing && !isRecording && (
              <button
                type="button"
                onClick={triggerRecord}
                disabled={!canRecord || !allChecksPass}
                style={{ touchAction: 'manipulation' }}
                className={`flex items-center justify-center gap-2 px-10 min-h-[52px] py-3 rounded-full text-white font-semibold text-base
                  shadow-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]
                  ${allChecksPass
                    ? 'bg-green-600 shadow-green-900/40 active:bg-green-700'
                    : 'bg-red-600 shadow-red-900/40 active:bg-red-700'}`}
              >
                <span className="w-3 h-3 rounded-full bg-white" />
                Record
              </button>
            )}
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-6 z-[60]">
          <div className="bg-dark-card rounded-xl p-6 w-full max-w-xs text-center">
            <p className="font-semibold mb-1">Leave without results?</p>
            <p className="text-gray-400 text-sm mb-6">Your recording will be discarded.</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-lg bg-dark-surface text-sm"
              >
                Keep Scanning
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
