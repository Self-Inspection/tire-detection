import { useState, useRef, useCallback } from 'react';
import { captureVideoFrame } from '../utils/captureFrame.js';
import { analyzeTireFrame } from '../utils/analyzeFrame.js';
import { buildUserPrompt, getTargetDistanceCm } from '../utils/tireAnalysisPrompt.js';
import { parseChatGPTAnalysis, isBlockedGuidance } from '../utils/parseChatGPTAnalysis.js';
import { clamp32nds, getSafetyLevelFrom32nds, MM_PER_32ND } from '../utils/depthToTread.js';
import { isSharpEnough, measureBlurScore, MIN_BLUR_SCORE } from '../utils/imageQuality.js';

const MAX_ATTEMPTS = 3;

export default function useChatGPTScanAnalysis({
  videoRef,
  isReady,
  tireType,
  scanConfig
}) {
  const [guidance, setGuidance] = useState('keep_going');
  const [progress, setProgress] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [analysisError, setAnalysisError] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [lastNotes, setLastNotes] = useState('Align tread in the blue box, then tap Capture.');
  const [attempt, setAttempt] = useState(0);

  const apiAttempts = useRef(0);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  tireTypeRef.current = tireType;
  scanConfigRef.current = scanConfig;

  const triggerCapture = useCallback(async () => {
    if (!isReady || isAnalyzing || isComplete) return;

    const video = videoRef.current;
    const config = scanConfigRef.current;
    if (!video || !config?.systemPrompt) return;

    const blurScore = measureBlurScore(video);
    if (!isSharpEnough(video)) {
      setGuidance('move_slower');
      setLastNotes(`Photo too blurry (score ${Math.round(blurScore)}/${MIN_BLUR_SCORE}). Hold steadier and tap Capture again.`);
      return;
    }

    const imageBase64 = captureVideoFrame(video);
    if (!imageBase64) {
      setLastNotes('Camera not ready — wait a moment and try again.');
      return;
    }

    apiAttempts.current += 1;
    setAttempt(apiAttempts.current);
    setIsAnalyzing(true);
    setAnalysisError(null);
    setProgress(0.4);
    setLastNotes('Analyzing tread grooves…');

    try {
      const analysis = await analyzeTireFrame({
        imageBase64,
        systemPrompt: config.systemPrompt,
        userPrompt: buildUserPrompt({
          tireType: tireTypeRef.current,
          targetDistanceCm: getTargetDistanceCm()
        })
      });

      setProgress(0.85);
      const parsed = parseChatGPTAnalysis(analysis);
      setGuidance(parsed.guidance);
      setLastNotes(parsed.notes);

      const blocked = isBlockedGuidance(parsed.guidance);

      if (blocked && apiAttempts.current < MAX_ATTEMPTS) {
        setProgress(0);
        setIsAnalyzing(false);
        setLastNotes(`${parsed.notes || 'Adjust framing.'} Tap Capture to retry (${apiAttempts.current}/${MAX_ATTEMPTS}).`);
        return;
      }

      if (blocked) {
        setAnalysisError(parsed.notes || 'Could not read tread. Adjust angle and try again.');
        setIsAnalyzing(false);
        return;
      }

      if (parsed.grooves.length === 0 || parsed.confidence < 0.6) {
        if (apiAttempts.current < MAX_ATTEMPTS) {
          setProgress(0);
          setIsAnalyzing(false);
          setLastNotes(
            parsed.grooves.length === 0
              ? `No grooves detected. Fill the blue box with tread and tap Capture (${apiAttempts.current}/${MAX_ATTEMPTS}).`
              : `Low confidence (${Math.round(parsed.confidence * 100)}%). Improve lighting and tap Capture again.`
          );
          return;
        }
        setAnalysisError('Could not detect tread grooves. Try better lighting, closer angle, or clearer groove view.');
        setIsAnalyzing(false);
        return;
      }

      const depth32nds = parsed.depth32nds;
      const depthMm = parsed.depthMm ?? parseFloat((depth32nds * MM_PER_32ND).toFixed(1));

      setScanResult({
        depthMm,
        depth32nds,
        rating: getSafetyLevelFrom32nds(depth32nds),
        grooves: parsed.grooves,
        source: 'chatgpt',
        confidence: parsed.confidence,
        notes: parsed.notes
      });
      setProgress(1);
      setIsComplete(true);
    } catch (err) {
      if (apiAttempts.current < MAX_ATTEMPTS) {
        setLastNotes(`${err.message}. Tap Capture to retry.`);
      } else {
        setAnalysisError(err.message || 'Analysis failed');
        setGuidance('tilt_phone');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [isReady, isAnalyzing, isComplete, videoRef]);

  const canCapture = isReady && !isAnalyzing && !isComplete && attempt < MAX_ATTEMPTS;

  return {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    lastNotes,
    attempt,
    maxAttempts: MAX_ATTEMPTS,
    triggerCapture,
    canCapture
  };
}
