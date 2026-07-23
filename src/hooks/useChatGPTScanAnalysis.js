import { useState, useRef, useCallback } from 'react';
import {
  captureVideoFrame,
  BURST_COUNT,
  BURST_INTERVAL_MS
} from '../utils/captureFrame.js';
import { analyzeTireFrame } from '../utils/analyzeFrame.js';
import { buildUserPrompt, getTargetDistanceCm } from '../utils/tireAnalysisPrompt.js';
import {
  parseChatGPTAnalysis,
  aggregateParsedAnalyses,
  isBlockedGuidance
} from '../utils/parseChatGPTAnalysis.js';
import { getSafetyLevelFrom32nds, MM_PER_32ND } from '../utils/depthToTread.js';
import {
  measureBlurScore,
  MIN_BLUR_SCORE,
  selectSharpBurstFrames,
  bestBurstScore,
  measureLighting,
  MIN_BRIGHTNESS,
  MAX_GLARE_FRACTION
} from '../utils/imageQuality.js';

const MAX_ATTEMPTS = 3;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Vibration API is Android-only; silently no-ops on iOS Safari.
function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

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
  const [isCapturing, setIsCapturing] = useState(false);
  const [lastNotes, setLastNotes] = useState('Align tread in the blue box, then tap Capture.');
  const [attempt, setAttempt] = useState(0);

  const apiAttempts = useRef(0);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  tireTypeRef.current = tireType;
  scanConfigRef.current = scanConfig;

  const triggerCapture = useCallback(async () => {
    if (!isReady || isAnalyzing || isCapturing || isComplete) return;

    const video = videoRef.current;
    const config = scanConfigRef.current;
    if (!video || !config?.systemPrompt) return;

    // Pre-flight: don't burn a capture on a shot that's too dark to read.
    const preLighting = measureLighting(video);
    if (preLighting.brightness < MIN_BRIGHTNESS) {
      setGuidance('poor_lighting');
      setLastNotes('Too dark to read the tread. Turn on the flashlight or move to better light, then tap Capture.');
      vibrate(60);
      return;
    }

    setIsCapturing(true);
    setAnalysisError(null);
    setLastNotes('Hold steady — capturing photos…');

    const scoredFrames = [];
    for (let i = 0; i < BURST_COUNT; i++) {
      scoredFrames.push({
        frame: captureVideoFrame(video),
        score: measureBlurScore(video),
        lighting: measureLighting(video)
      });
      if (i < BURST_COUNT - 1) await delay(BURST_INTERVAL_MS);
    }

    const sharpFrames = selectSharpBurstFrames(scoredFrames);
    setIsCapturing(false);
    // Haptic: photos are in the can — like a camera shutter confirmation.
    vibrate(100);

    if (sharpFrames.length === 0) {
      setGuidance('move_slower');
      const best = Math.round(bestBurstScore(scoredFrames));
      setLastNotes(`Photos too blurry (best ${best}/${MIN_BLUR_SCORE}). Hold steadier and tap Capture again.`);
      return;
    }

    const wellLitFrames = sharpFrames.filter(
      f => f.lighting.brightness >= MIN_BRIGHTNESS && f.lighting.glareFraction <= MAX_GLARE_FRACTION
    );

    if (wellLitFrames.length === 0) {
      setGuidance('poor_lighting');
      const darkest = Math.round(Math.min(...sharpFrames.map(f => f.lighting.brightness)));
      const glariest = Math.max(...sharpFrames.map(f => f.lighting.glareFraction));
      setLastNotes(
        glariest > MAX_GLARE_FRACTION
          ? 'Glare is washing out the tread — angle away from direct light/flash reflection and tap Capture again.'
          : `Too dark (brightness ${darkest}/${MIN_BRIGHTNESS}) — add more light and tap Capture again.`
      );
      return;
    }

    const imagesBase64 = wellLitFrames.map(f => f.frame);

    apiAttempts.current += 1;
    setAttempt(apiAttempts.current);
    setIsAnalyzing(true);
    setProgress(0.4);
    setLastNotes(`Analyzing ${imagesBase64.length} photo${imagesBase64.length > 1 ? 's' : ''}…`);

    try {
      const analyses = await analyzeTireFrame({
        imagesBase64,
        systemPrompt: config.systemPrompt,
        userPrompt: buildUserPrompt({
          tireType: tireTypeRef.current,
          targetDistanceCm: getTargetDistanceCm(),
          imageCount: imagesBase64.length
        })
      });

      setProgress(0.85);
      const parsed = aggregateParsedAnalyses(analyses.map(parseChatGPTAnalysis));
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
              : parsed.agreement32nds >= 2
                ? `Analysis runs disagreed by ${parsed.agreement32nds}/32″ — adjust light/angle and tap Capture again.`
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
        notes: parsed.notes,
        photoCount: imagesBase64.length,
        treadPattern: parsed.treadPattern,
        sampleCount: parsed.sampleCount ?? 1,
        agreement32nds: parsed.agreement32nds ?? null
      });
      setProgress(1);
      // Success buzz: short-short-long
      vibrate([100, 60, 250]);
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
  }, [isReady, isAnalyzing, isCapturing, isComplete, videoRef]);

  const canCapture = isReady && !isAnalyzing && !isCapturing && !isComplete && attempt < MAX_ATTEMPTS;

  return {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    isCapturing,
    lastNotes,
    attempt,
    maxAttempts: MAX_ATTEMPTS,
    triggerCapture,
    canCapture
  };
}
