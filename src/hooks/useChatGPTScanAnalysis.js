import { useState, useRef, useCallback, useEffect } from 'react';
import {
  captureVideoFrame,
  SWEEP_FRAME_COUNT,
  SWEEP_FRAME_INTERVAL_MS,
  MAX_SWEEP_FRAMES_TO_SEND,
  FRAMES_PER_SWEEP_THIRD
} from '../utils/captureFrame.js';
import { analyzeTireFrame } from '../utils/analyzeFrame.js';
import { buildUserPrompt, getTargetDistanceCm } from '../utils/tireAnalysisPrompt.js';
import {
  parseChatGPTAnalysis,
  aggregateParsedAnalyses,
  isBlockedGuidance
} from '../utils/parseChatGPTAnalysis.js';
import { getSafetyLevelFrom32nds, MM_PER_32ND, ZONE_LABELS } from '../utils/depthToTread.js';
import { logScan, newScanLogId } from '../utils/scanLog.js';
import {
  measureBlurScore,
  MIN_BLUR_SCORE,
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
  const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const [isRecording, setIsRecording] = useState(false);
  const [recordProgress, setRecordProgress] = useState(0);
  const [lastNotes, setLastNotes] = useState('Line up at the outer edge of the tread, then tap Record and sweep toward the inner edge.');
  const [attempt, setAttempt] = useState(0);
  // True when the last sweep ended without a result — drives a prominent retry card
  const [attemptFailed, setAttemptFailed] = useState(false);
  // Live framing checks while the user lines up the shot (pre-record)
  const [framing, setFraming] = useState({ lightOk: null, treadOk: null });

  const apiAttempts = useRef(0);
  const tireTypeRef = useRef(tireType);
  const scanConfigRef = useRef(scanConfig);

  tireTypeRef.current = tireType;
  scanConfigRef.current = scanConfig;

  // Elapsed timer + creeping progress while the AI works (30–120 s is normal),
  // so the analysis phase never looks frozen.
  useEffect(() => {
    if (!isAnalyzing) return;
    setAnalysisSeconds(0);
    const id = setInterval(() => {
      setAnalysisSeconds(s => s + 1);
      setProgress(p => (p > 0 && p < 0.8 ? Math.min(0.8, p + 0.004) : p));
    }, 1000);
    return () => clearInterval(id);
  }, [isAnalyzing]);

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

  const logRejection = useCallback((reason) => {
    logScan({
      clientId: newScanLogId(),
      status: 'rejected',
      tirePosition: scanConfigRef.current?.tirePosition?.id ?? null,
      rejectReason: reason
    });
  }, []);

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
    setAttemptFailed(false);
    setRecordProgress(0);
    setLastNotes('Recording — sweep slowly from the outer edge toward the inner edge…');
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

    // A frame is usable when it's sharp AND well lit
    const usable = scoredFrames.filter(f =>
      f.frame &&
      f.score >= MIN_BLUR_SCORE &&
      f.lighting.brightness >= MIN_BRIGHTNESS &&
      f.lighting.glareFraction <= MAX_GLARE_FRACTION
    );

    if (usable.length === 0) {
      const allDark = scoredFrames.every(f => f.lighting.brightness < MIN_BRIGHTNESS);
      const allGlare = scoredFrames.every(f => f.lighting.glareFraction > MAX_GLARE_FRACTION);
      let msg;
      if (allDark || allGlare) {
        setGuidance('poor_lighting');
        msg = allGlare
          ? 'Glare is washing out the tread — angle away from direct light/flash reflection and record again.'
          : 'Too dark to read the tread — add more light and record again.';
      } else {
        setGuidance('move_slower');
        const best = Math.round(bestBurstScore(scoredFrames));
        msg = `Frames too blurry (best ${best}/${MIN_BLUR_SCORE}). Sweep slower and keep ~20 cm distance, then tap Record again.`;
      }
      setLastNotes(msg);
      logRejection(msg);
      setAttemptFailed(true);
      return;
    }

    // Coverage: the sweep thirds map to outer / center / inner tread zones —
    // each third must contribute at least one usable frame or the scan is incomplete.
    const zoneOfIndex = i =>
      i < SWEEP_FRAME_COUNT / 3 ? 'outer' : i < (2 * SWEEP_FRAME_COUNT) / 3 ? 'center' : 'inner';

    const thirds = ['outer', 'center', 'inner'].map(zone =>
      usable
        .filter(f => zoneOfIndex(f.index) === zone)
        .sort((a, b) => b.score - a.score)
        .slice(0, FRAMES_PER_SWEEP_THIRD)
    );

    const missingZones = ['outer', 'center', 'inner'].filter((_, t) => thirds[t].length === 0);
    if (missingZones.length > 0) {
      setGuidance('move_slower');
      const missing = missingZones.map(z => ZONE_LABELS[z].toLowerCase()).join(' and ');
      const msg = `Scan incomplete — the ${missing} part of the sweep wasn't usable. Sweep steadily across the full tread and record again.`;
      setLastNotes(msg);
      logRejection(msg);
      setAttemptFailed(true);
      return;
    }

    // Keep sweep order so the model maps first frames → outer shoulder, last → inner
    const orderedFrames = thirds
      .flat()
      .sort((a, b) => a.index - b.index)
      .slice(0, MAX_SWEEP_FRAMES_TO_SEND);
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
        logRejection(`AI rejected framing (${parsed.guidance}): ${parsed.notes || 'no notes'}`);
        setAttemptFailed(true);
        return;
      }

      if (blocked) {
        setAnalysisError(parsed.notes || 'Could not read tread. Adjust angle and try again.');
        logRejection(`AI rejected framing, attempts exhausted (${parsed.guidance}): ${parsed.notes || 'no notes'}`);
        setIsAnalyzing(false);
        return;
      }

      if (parsed.grooves.length === 0 || parsed.confidence < 0.6) {
        const reason = parsed.grooves.length === 0
          ? `No grooves detected. Keep the tread inside the blue box during the sweep and tap Record (${apiAttempts.current}/${MAX_ATTEMPTS}).`
          : parsed.agreement32nds >= 2
            ? `Analysis runs disagreed by ${parsed.agreement32nds}/32″ — adjust light/angle and record again.`
            : `Low confidence (${Math.round(parsed.confidence * 100)}%). Improve lighting and record again.`;
        logRejection(reason);
        if (apiAttempts.current < MAX_ATTEMPTS) {
          setProgress(0);
          setIsAnalyzing(false);
          setLastNotes(reason);
          setAttemptFailed(true);
          return;
        }
        setAnalysisError('Could not detect tread grooves. Try better lighting, closer angle, or clearer groove view.');
        setIsAnalyzing(false);
        return;
      }

      const depth32nds = parsed.depth32nds;
      const depthMm = parsed.depthMm ?? parseFloat((depth32nds * MM_PER_32ND).toFixed(1));
      const scanLogId = newScanLogId();

      logScan({
        clientId: scanLogId,
        status: 'completed',
        tirePosition: config.tirePosition?.id ?? null,
        depth32nds,
        depthMm,
        rating: getSafetyLevelFrom32nds(depth32nds),
        confidence: parsed.confidence,
        grooves: parsed.grooves,
        zones: parsed.zones,
        wearPattern: parsed.wearPattern,
        alignmentConcern: parsed.alignmentConcern,
        treadPattern: parsed.treadPattern,
        photoCount: imagesBase64.length,
        sampleCount: parsed.sampleCount ?? 1,
        agreement32nds: parsed.agreement32nds ?? null,
        notes: parsed.notes
      });

      setScanResult({
        scanLogId,
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
      logRejection(`Analysis request failed: ${err.message}`);
      if (apiAttempts.current < MAX_ATTEMPTS) {
        setLastNotes(`${err.message}. Tap Record to retry.`);
        setAttemptFailed(true);
      } else {
        setAnalysisError(err.message || 'Analysis failed');
        setGuidance('tilt_phone');
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [isReady, isAnalyzing, isRecording, isComplete, videoRef, logRejection]);

  const canRecord = isReady && !isAnalyzing && !isRecording && !isComplete && attempt < MAX_ATTEMPTS;

  return {
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
    maxAttempts: MAX_ATTEMPTS,
    triggerRecord,
    canRecord
  };
}
