import { getSafetyLevelFrom32nds, clamp32nds } from './depthToTread.js';
import { GUIDANCE_VALUES } from './tireAnalysisPrompt.js';

const BLOCKED_GUIDANCE = new Set(['move_slower', 'too_far', 'too_close']);

export function normalizeGuidance(value) {
  if (GUIDANCE_VALUES.includes(value)) return value;
  return 'tilt_phone';
}

export function parseChatGPTAnalysis(raw) {
  if (!raw || typeof raw !== 'object') {
    return {
      guidance: 'tilt_phone',
      acceptFrame: false,
      depthMm: null,
      readyToComplete: false,
      confidence: 0,
      notes: 'Invalid analysis response'
    };
  }

  const guidance = normalizeGuidance(raw.guidance);
  const acceptFrame = Boolean(
    raw.gates?.accept_frame_for_accumulation &&
    raw.frame_quality?.groove_visible !== false
  );

  const depthMm = typeof raw.measurement?.depth_mm === 'number'
    ? raw.measurement.depth_mm
    : null;

  const depth32nds = typeof raw.measurement?.depth_32nds === 'number'
    ? clamp32nds(raw.measurement.depth_32nds)
    : null;

  const rating = raw.measurement?.rating && raw.measurement.rating !== 'null'
    ? raw.measurement.rating
    : (depth32nds != null ? getSafetyLevelFrom32nds(depth32nds) : null);

  return {
    guidance,
    acceptFrame,
    depthMm,
    depth32nds,
    rating,
    readyToComplete: Boolean(raw.scan_progress?.ready_to_complete),
    confidence: typeof raw.confidence === 'number' ? raw.confidence : 0,
    notes: raw.notes || '',
    grooveVisible: raw.frame_quality?.groove_visible !== false
  };
}

export function isBlockedGuidance(guidance) {
  return BLOCKED_GUIDANCE.has(guidance);
}
