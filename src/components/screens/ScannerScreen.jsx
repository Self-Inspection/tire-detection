import { useRef, useEffect, useState } from 'react';
import useCamera from '../../hooks/useCamera.js';
import useDepthModel from '../../hooks/useDepthModel.js';
import useWebXR from '../../hooks/useWebXR.js';
import useScanAnalysis from '../../hooks/useScanAnalysis.js';
import GuidanceOverlay from '../ui/GuidanceOverlay.jsx';
import ProgressRing from '../ui/ProgressRing.jsx';
import DepthHeatmap from '../ui/DepthHeatmap.jsx';

export default function ScannerScreen({ tireType, xrSession, onComplete, onCancel }) {
  const videoRef = useRef(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // In LiDAR mode the XR session provides the camera feed, so getUserMedia is
  // skipped — but we still call useCamera to handle the non-LiDAR fallback path.
  const { error: cameraError, isReady }               = useCamera(xrSession ? null : videoRef);
  const { estimateDepth, isModelLoaded, modelError }  = useDepthModel();
  const { metricsScaleFactor, focalLengthPx, lidarFrameRef } = useWebXR({ existingSession: xrSession });

  const isLidar    = !!xrSession;
  const modelReady = isLidar ? true : isModelLoaded;
  const camReady   = isLidar ? true : isReady;

  const { guidance, progress, isComplete, scanResult, depthMap } = useScanAnalysis({
    videoRef,
    estimateDepth,
    isModelLoaded: modelReady,
    tireType,
    metricsScaleFactor,
    focalLengthPx,
    lidarFrameRef: isLidar ? lidarFrameRef : null
  });

  useEffect(() => {
    if (isComplete && scanResult) onComplete(scanResult);
  }, [isComplete, scanResult]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let lock = null;
    navigator.wakeLock?.request('screen').then(l => { lock = l; }).catch(() => {});
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

  const loading = !camReady ? 'Accessing camera…'
    : (!isLidar && !isModelLoaded) ? 'Loading depth model…'
    : null;

  return (
    <div className="relative w-full h-full bg-black">
      {/* Live camera feed — hidden in LiDAR mode (XR session shows the pass-through) */}
      {!isLidar && (
        <video
          ref={videoRef}
          autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {depthMap && <DepthHeatmap depthMap={depthMap} />}

      {loading && (
        <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center gap-4 z-20">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-white text-sm">{loading}</p>
        </div>
      )}

      {(cameraError || modelError) && (
        <div className="absolute inset-0 bg-black/80 flex items-center justify-center p-6 z-20">
          <div className="bg-dark-card rounded-xl p-6 text-center max-w-xs">
            <p className="text-red-400 mb-4 text-sm">{cameraError || modelError}</p>
            <button onClick={onCancel} className="text-blue-400 text-sm underline">Go Back</button>
          </div>
        </div>
      )}

      <GuidanceOverlay guidance={guidance} />

      {/* LiDAR badge */}
      {isLidar && !loading && (
        <div className="absolute top-0 left-0 safe-top p-4 z-10">
          <span className="bg-purple-600/80 backdrop-blur text-white text-xs px-3 py-1 rounded-full">
            📡 LiDAR
          </span>
        </div>
      )}

      {!loading && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="border-2 border-blue-400/60 rounded-lg"
               style={{ width: '40%', height: '80%', boxShadow: '0 0 0 2000px rgba(0,0,0,0.20)' }} />
        </div>
      )}

      {!loading && (
        <div className="absolute bottom-0 left-0 right-0 safe-bottom flex flex-col items-center pb-8 gap-2 z-10">
          <ProgressRing progress={progress} />
          <p className="text-white/60 text-xs">Scanning tread…</p>
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
