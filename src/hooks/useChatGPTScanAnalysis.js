import { useState, useRef, useCallback, useEffect } from 'react';
import {
  captureVideoFrame,
  SWEEP_FRAME_COUNT,
  SWEEP_FRAME_INTERVAL_MS,
  MAX_SWEEP_FRAMES_TO_SEND
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
/** Preview texture threshold — lower than capture bar; just "is tread detail visible". */
const MIN_PREVIEW_TEXTURE = 45;

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
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [lastNotes, setLastNotes] = useState('Line up the tread, then tap Record and sweep across the tire.');
  const [attempt, setAttempt] = useState(0);
  // Live framing checks while the user lines up the shot (pre-record)
  const [framing, setFraming] = useState({ lightOk: null, treadOk: null });

  const apiAttempts = useRef(0);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  tireTypeRef.current = tireType;
  scanConfigRef.current = scanConfig;

  // Lightweight on-device preview checks (~1 fps): lighting + tread texture.
  useEffect(() => {
    if (!isReady || isRecording || isAnalyzing || isComplete) return;
    const id = setInterval(() => {
      const video = videoRef.current;
      if (!video) return;
      const { brightness, glareFraction } = measureLighting(video);
      const texture = measureBlurScore(video);
      setFraming({
        lightOk: brightness >= MIN_BRIGHTNESS && glareFraction <= MAX_GLARE_FRACTION,
        treadOk: texture >= MIN_PREVIEW_TEXTURE
      });
    }, 900);
    return () => clearInterval(id);
  }, [isReady, isRecording, isAnalyzing, isComplete, videoRef]);

  const triggerRecord = useCallback(async () => {
    if (!isReady || isAnalyzing || isRecording || isComplete) return;

    const video = videoRef.current;
    const config = scanConfigRef.current;
    if (!video || !config?.systemPrompt) return;

    // Pre-flight: don't burn a recording on a shot that's too dark to read.
    const preLighting = measureLighting(video);
    if (preLighting.brightness < MIN_BRIGHTNESS) {
      setGuidance('poor_lighting');
      setLastNotes('Too dark to read the tread. Turn on the flashlight or move to better light, then tap Record.');
      vibrate(60);
      return;
    }

    setIsRecording(true);
    setAnalysisError(null);
    setRecordProgress(0);
    setLastNotes('Recording — sweep slowly from one shoulder to the other…');
    vibrate(60); // start cue

    const scoredFrames = [];
    for (let i = 0; i < SWEEP_FRAME_COUNT; i++) {
      scoredFrames.push({
        index: i,
        frame: captureVideoFrame(video),
        score: measureBlurScore(video),
        lighting: measureLighting(video)
      });
      setRecordProgress((i + 1) / SWEEP_FRAME_COUNT);
      if (i < SWEEP_FRAME_COUNT - 1) await delay(SWEEP_FRAME_INTERVAL_MS);
    }

    setIsRecording(false);
    setRecordProgress(0);
    // Haptic: recording done — like the reference app's end-of-scan buzz.
    vibrate([120, 80, 120]);

    const sharpFrames = selectSharpBurstFrames(scoredFrames, { maxCount: MAX_SWEEP_FRAMES_TO_SEND });

    if (sharpFrames.length === 0) {
      setGuidance('move_slower');
      const best = Math.round(bestBurstScore(scoredFrames));
      setLastNotes(`Frames too blurry (best ${best}/${MIN_BLUR_SCORE}). Sweep slower and keep ~20 cm distance, then tap Record again.`);
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
          ? 'Glare is washing out the tread — angle away from direct light/flash reflection and record again.'
          : `Too dark (brightness ${darkest}/${MIN_BRIGHTNESS}) — add more light and record again.`
      );
      return;
    }

    // Keep sweep order so the model can map first→left shoulder, last→right shoulder
    const orderedFrames = [...wellLitFrames].sort((a, b) => a.index - b.index);
    const imagesBase64 = orderedFrames.map(f => f.frame);

    apiAttempts.current += 1;
    setAttempt(apiAttempts.current);
    setIsAnalyzing(true);
    setProgress(0.4);
    setLastNotes(`Analyzing ${imagesBase64.length} frames from your sweep…`);

    try {
      const analyses = await analyzeTireFrame({
        imagesBase64,
        systemPrompt: config.systemPrompt,
        userPrompt: buildUserPrompt({
          tireType: tireTypeRef.current,
          tirePosition: config.tirePosition,
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
        setLastNotes(`${parsed.notes || 'Adjust framing.'} Tap Record to retry (${apiAttempts.current}/${MAX_ATTEMPTS}).`);
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
              ? `No grooves detected. Keep the tread inside the blue box during the sweep and tap Record (${apiAttempts.current}/${MAX_ATTEMPTS}).`
              : parsed.agreement32nds >= 2
                ? `Analysis runs disagreed by ${parsed.agreement32nds}/32″ — adjust light/angle and record again.`
                : `Low confidence (${Math.round(parsed.confidence * 100)}%). Improve lighting and record again.`
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
        zones: parsed.zones,
        wearPattern: parsed.wearPattern,
        alignmentConcern: parsed.alignmentConcern,
        tirePosition: config.tirePosition ?? null,
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
        setLastNotes(`${err.message}. Tap Record to retry.`);
      } else {
        setAnalysisError(err.message || 'Analysis failed');
        setGuidance('tilt_phone');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [isReady, isAnalyzing, isRecording, isComplete, videoRef]);

  const canRecord = isReady && !isAnalyzing && !isRecording && !isComplete && attempt < MAX_ATTEMPTS;

  return {
    guidance,
    progress,
    isComplete,
    scanResult,
    analysisError,
    isAnalyzing,
    isRecording,
    recordProgress,
    framing,
    lastNotes,
    attempt,
    maxAttempts: MAX_ATTEMPTS,
    triggerRecord,
    canRecord
  };
}
