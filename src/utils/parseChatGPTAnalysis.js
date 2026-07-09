import {
  getSafetyLevelFrom32nds,
  clamp32nds,
  MM_PER_32ND,
  MAX_GROOVES,
  GROOVE_POSITION_LABELS,
  groovePositionsForCount
} from './depthToTread.js';
import { GUIDANCE_VALUES } from './tireAnalysisPrompt.js';

const BLOCKED_GUIDANCE = new Set(['move_slower', 'too_far', 'too_close', 'tilt_phone', 'poor_lighting']);

function formatGroove(g, index, position) {
  const depth32nds = clamp32nds(g.depth_32nds);
  return {
    id: index + 1,
    position,
    positionLabel: GROOVE_POSITION_LABELS[position] ?? position,
    depth32nds,
    depthMm: typeof g.depth_mm === 'number'
      ? parseFloat(g.depth_mm.toFixed(1))
      : parseFloat((depth32nds * MM_PER_32ND).toFixed(1)),
    rating: getSafetyLevelFrom32nds(depth32nds),
    confidence: typeof g.confidence === 'number' ? g.confidence : null
  };
}

function parseGrooves(raw) {
  if (!Array.isArray(raw.grooves)) return [];

  const sorted = raw.grooves
    .filter(g => g && typeof g.depth_32nds === 'number')
    .sort((a, b) => (a.id ?? 0) - (b.id ?? 0))
    .slice(0, MAX_GROOVES);

  const positions = groovePositionsForCount(sorted.length);
  return sorted.map((g, index) => formatGroove(g, index, positions[index]));
}

function summaryFromGrooves(grooves) {
  if (grooves.length === 0) return null;
  const shallowest = grooves.reduce((min, g) =>
    g.depth32nds < min.depth32nds ? g : min
  );
  const avgConfidence = grooves.reduce((s, g) => s + (g.confidence ?? 0.7), 0) / grooves.length;
  return {
    depth32nds: shallowest.depth32nds,
    depthMm: shallowest.depthMm,
    rating: shallowest.rating,
    confidence: avgConfidence
  };
}

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
      depth32nds: null,
      grooves: [],
      readyToComplete: false,
      confidence: 0,
      notes: 'Invalid analysis response',
      grooveVisible: false,
      treadPattern: 'unknown'
    };
  }

  const guidance = normalizeGuidance(raw.guidance);
  const grooveVisible = raw.frame_quality?.groove_visible !== false;
  const treadPattern = raw.frame_quality?.tread_pattern ?? 'unknown';
  const grooves = parseGrooves(raw);

  let depth32nds = typeof raw.measurement?.depth_32nds === 'number'
    ? clamp32nds(raw.measurement.depth_32nds)
    : null;
  let depthMm = typeof raw.measurement?.depth_mm === 'number'
    ? raw.measurement.depth_mm
    : null;

  const grooveSummary = summaryFromGrooves(grooves);
  if (grooveSummary) {
    depth32nds = grooveSummary.depth32nds;
    depthMm = grooveSummary.depthMm;
  }

  const rating = raw.measurement?.rating && raw.measurement.rating !== 'null'
    ? raw.measurement.rating
    : (depth32nds != null ? getSafetyLevelFrom32nds(depth32nds) : null);

  const confidence = typeof raw.confidence === 'number'
    ? raw.confidence
    : (grooveSummary?.confidence ?? 0);

  return {
    guidance,
    acceptFrame: grooveVisible && grooves.length > 0,
    depthMm,
    depth32nds,
    grooves,
    rating,
    readyToComplete: grooves.length > 0,
    confidence,
    notes: raw.notes || '',
    grooveVisible,
    grooveCount: grooves.length,
    treadPattern
  };
}

export function isBlockedGuidance(guidance) {
  return BLOCKED_GUIDANCE.has(guidance);
}
