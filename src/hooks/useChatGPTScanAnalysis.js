import { useState, useRef, useEffect } from 'react';
import { captureVideoFrame } from '../utils/captureFrame.js';
import { analyzeTireFrame } from '../utils/analyzeFrame.js';
import { buildUserPrompt, getTargetDistanceCm } from '../utils/tireAnalysisPrompt.js';
import { parseChatGPTAnalysis, isBlockedGuidance } from '../utils/parseChatGPTAnalysis.js';
import { clamp32nds, getSafetyLevelFrom32nds, MM_PER_32ND } from '../utils/depthToTread.js';

// One photo → one API call. Retry only if framing is bad (max 3 attempts).
const CAPTURE_DELAY_MS = 1200;
const RETRY_DELAY_MS = 2000;
const MAX_ATTEMPTS = 3;

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
  const [attempt, setAttempt] = useState(0);

  const running = useRef(false);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  useEffect(() => { tireTypeRef.current = tireType; }, [tireType]);
  useEffect(() => { scanConfigRef.current = scanConfig; }, [scanConfig]);

  useEffect(() => {
    if (!isReady || !scanConfig?.systemPrompt) return;

    running.current = true;
    let timerId = null;
    let attempts = 0;

    async function analyzeOnce() {
      if (!running.current) return;

      const video = videoRef.current;
      const config = scanConfigRef.current;
      if (!video || !config?.systemPrompt) return;

      const imageBase64 = captureVideoFrame(video);
      if (!imageBase64) {
        timerId = setTimeout(analyzeOnce, 500);
        return;
      }

      attempts += 1;
      setAttempt(attempts);
      setIsAnalyzing(true);
      setAnalysisError(null);
      setProgress(0.3);

      try {
        const analysis = await analyzeTireFrame({
          imageBase64,
          systemPrompt: config.systemPrompt,
          userPrompt: buildUserPrompt({
            tireType: tireTypeRef.current,
            targetDistanceCm: getTargetDistanceCm(tireTypeRef.current)
          }),
          apiKey: config.apiKey || undefined
        });

        if (!running.current) return;

        setProgress(0.85);
        const parsed = parseChatGPTAnalysis(analysis);
        setGuidance(parsed.guidance);
        setLastNotes(parsed.notes);

        const blocked = isBlockedGuidance(parsed.guidance) || parsed.guidance === 'tilt_phone';

        // Framing bad — retry up to MAX_ATTEMPTS
        if (blocked && attempts < MAX_ATTEMPTS) {
          setProgress(0.1);
          setIsAnalyzing(false);
          timerId = setTimeout(analyzeOnce, RETRY_DELAY_MS);
          return;
        }

        if (blocked) {
          setAnalysisError(parsed.notes || 'Could not read tread. Adjust angle and try again.');
          setIsAnalyzing(false);
          return;
        }

        // Accept measurement from this single frame
        let depth32nds = parsed.depth32nds;
        let depthMm = parsed.depthMm;

        if (depth32nds == null && depthMm != null) {
          depth32nds = clamp32nds(Math.round(depthMm / MM_PER_32ND));
        }
        if (depth32nds == null) {
          if (attempts < MAX_ATTEMPTS) {
            setIsAnalyzing(false);
            timerId = setTimeout(analyzeOnce, RETRY_DELAY_MS);
            return;
          }
          setAnalysisError('Could not measure tread depth. Try better lighting or move closer.');
          setIsAnalyzing(false);
          return;
        }

        depth32nds = clamp32nds(depth32nds);
        depthMm = depthMm ?? parseFloat((depth32nds * MM_PER_32ND).toFixed(1));

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
      } catch (err) {
        if (!running.current) return;
        if (attempts < MAX_ATTEMPTS) {
          setIsAnalyzing(false);
          timerId = setTimeout(analyzeOnce, RETRY_DELAY_MS);
          return;
        }
        setAnalysisError(err.message || 'Analysis failed');
        setGuidance('tilt_phone');
      } finally {
        setIsAnalyzing(false);
      }
    }

    setGuidance('keep_going');
    setLastNotes('Point camera at tread in the bracket…');
    timerId = setTimeout(analyzeOnce, CAPTURE_DELAY_MS);

    return () => {
      running.current = false;
      if (timerId) clearTimeout(timerId);
    };
  }, [isReady, scanConfig?.systemPrompt, scanConfig?.apiKey, videoRef]);

  return {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    lastNotes,
    attempt,
    maxAttempts: MAX_ATTEMPTS
  };
}
