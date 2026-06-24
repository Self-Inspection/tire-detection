import { useState, useRef, useEffect } from 'react';
import { captureVideoFrame } from '../utils/captureFrame.js';
import { analyzeTireFrame } from '../utils/analyzeFrame.js';
import {
  buildUserPrompt,
  getTargetDistanceCm
} from '../utils/tireAnalysisPrompt.js';
import {
  parseChatGPTAnalysis,
  isBlockedGuidance
} from '../utils/parseChatGPTAnalysis.js';
import { computeCV, estimateProgress } from '../utils/scanQuality.js';
import { formatDepthResult, clamp32nds, getSafetyLevelFrom32nds, MM_PER_32ND } from '../utils/depthToTread.js';

const MIN_FRAMES = 30;
const TARGET_CV = 0.15;
const STABLE_MS = 2000;
const ANALYSIS_INTERVAL_MS = 2500;

function medianOf(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function useChatGPTScanAnalysis({
  videoRef,
  isReady,
  tireType,
  scanConfig
}) {
  const [guidance, setGuidance] = useState(null);
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastNotes, setLastNotes] = useState('');

  const depthBuf = useRef([]);
  const grooveBuf = useRef([]);
  const acceptedBuf = useRef([]);
  const stableStart = useRef(null);
  const running = useRef(false);
  const inFlight = useRef(false);
  const lastGuidanceRef = useRef(null);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  useEffect(() => { tireTypeRef.current = tireType; }, [tireType]);
  useEffect(() => { scanConfigRef.current = scanConfig; }, [scanConfig]);

  useEffect(() => {
    if (!isReady || !scanConfig?.systemPrompt) return;

    running.current = true;
    let timerId = null;

    async function runAnalysis() {
      if (!running.current || inFlight.current) return;

      const video = videoRef.current;
      const config = scanConfigRef.current;
      if (!video || !config?.systemPrompt) return;

      const imageBase64 = captureVideoFrame(video);
      if (!imageBase64) return;

      const frames = acceptedBuf.current.filter(Boolean).length;
      const recentDepths = depthBuf.current.slice(-30);
      const cv = recentDepths.length >= 5 ? computeCV(recentDepths) : 1;
      const grooveFraction = grooveBuf.current.slice(-30).reduce((a, b) => a + b, 0) /
        Math.max(1, Math.min(30, grooveBuf.current.length));

      inFlight.current = true;
      setIsAnalyzing(true);
      setAnalysisError(null);

      try {
        const analysis = await analyzeTireFrame({
          imageBase64,
          systemPrompt: config.systemPrompt,
          userPrompt: buildUserPrompt({
            tireType: tireTypeRef.current,
            lastGuidance: lastGuidanceRef.current,
            acceptedFrames: frames,
            recentCv: cv,
            grooveFraction,
            targetDistanceCm: getTargetDistanceCm(tireTypeRef.current)
          }),
          model: config.model,
          apiKey: config.apiKey || undefined
        });

        if (!running.current) return;

        const parsed = parseChatGPTAnalysis(analysis);
        lastGuidanceRef.current = parsed.guidance;
        setGuidance(parsed.guidance);
        setLastNotes(parsed.notes);

        grooveBuf.current.push(parsed.grooveVisible ? 1 : 0);
        if (grooveBuf.current.length > 90) grooveBuf.current.shift();

        if (parsed.acceptFrame && !isBlockedGuidance(parsed.guidance)) {
          acceptedBuf.current.push(1);
          if (acceptedBuf.current.length > 90) acceptedBuf.current.shift();
          if (parsed.depthMm != null) {
            depthBuf.current.push(parsed.depthMm);
            if (depthBuf.current.length > 90) depthBuf.current.shift();
          }
        } else {
          acceptedBuf.current.push(0);
          if (acceptedBuf.current.length > 90) acceptedBuf.current.shift();
        }

        const updatedFrames = acceptedBuf.current.filter(Boolean).length;
        const updatedRecentDepths = depthBuf.current.slice(-30);
        const updatedCv = updatedRecentDepths.length >= 5
          ? computeCV(updatedRecentDepths)
          : (updatedFrames >= MIN_FRAMES ? 0.1 : 1);
        const updatedGrooveFraction = grooveBuf.current.slice(-30).reduce((a, b) => a + b, 0) /
          Math.max(1, Math.min(30, grooveBuf.current.length));

        setProgress(
          estimateProgress(updatedFrames, updatedCv, updatedGrooveFraction, MIN_FRAMES)
        );

        const stable = updatedFrames >= MIN_FRAMES
          && updatedCv < TARGET_CV
          && updatedGrooveFraction >= 0.8
          && !isBlockedGuidance(parsed.guidance);

        const modelReady = parsed.readyToComplete && stable;

        if (modelReady) {
          if (!stableStart.current) stableStart.current = performance.now();
          else if (performance.now() - stableStart.current >= STABLE_MS) {
            const medianDepth = updatedRecentDepths.length > 0
              ? medianOf(updatedRecentDepths)
              : parsed.depthMm;

            if (medianDepth == null) {
              stableStart.current = null;
              return;
            }

            let depth32nds;
            let depthMm;

            if (parsed.depth32nds != null) {
              depth32nds = clamp32nds(parsed.depth32nds);
              depthMm = parseFloat((depth32nds * MM_PER_32ND).toFixed(1));
            } else {
              const formatted = formatDepthResult(medianDepth);
              depth32nds = formatted.depth32nds;
              depthMm = formatted.depthMm;
            }

            setScanResult({
              depthMm,
              depth32nds,
              rating: getSafetyLevelFrom32nds(depth32nds),
              source: 'chatgpt',
              confidence: parsed.confidence,
              notes: parsed.notes
            });
            setProgress(1);
            setIsComplete(true);
            running.current = false;
            return;
          }
        } else {
          stableStart.current = null;
        }
      } catch (err) {
        if (running.current) {
          setAnalysisError(err.message || 'ChatGPT analysis failed');
          setGuidance('tilt_phone');
        }
      } finally {
        inFlight.current = false;
        setIsAnalyzing(false);
        if (running.current) {
          timerId = setTimeout(runAnalysis, ANALYSIS_INTERVAL_MS);
        }
      }
    }

    timerId = setTimeout(runAnalysis, 500);

    return () => {
      running.current = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isReady, scanConfig?.systemPrompt, scanConfig?.apiKey, scanConfig?.model, videoRef]);

  return {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    lastNotes
  };
}
