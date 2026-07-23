import {
  getSafetyLevelFrom32nds,
  clamp32nds,
  MM_PER_32ND,
  MAX_GROOVES,
  GROOVE_POSITION_LABELS,
  groovePositionsForCount,
  ZONE_LABELS,
  WEAR_PATTERN_LABELS
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

const ZONE_ORDER = ['left', 'center', 'right'];
const WEAR_PATTERNS = new Set(Object.keys(WEAR_PATTERN_LABELS));

function parseZones(raw) {
  if (!Array.isArray(raw.zones)) return [];
  return ZONE_ORDER
    .map(zone => {
      const z = raw.zones.find(v => v && v.zone === zone && typeof v.depth_32nds === 'number');
      if (!z) return null;
      const depth32nds = clamp32nds(z.depth_32nds);
      return {
        zone,
        zoneLabel: ZONE_LABELS[zone],
        depth32nds,
        depthMm: parseFloat((depth32nds * MM_PER_32ND).toFixed(1)),
        rating: getSafetyLevelFrom32nds(depth32nds),
        confidence: typeof z.confidence === 'number' ? z.confidence : null
      };
    })
    .filter(Boolean);
}

function parseWearPattern(raw) {
  return WEAR_PATTERNS.has(raw.wear_pattern) ? raw.wear_pattern : 'unknown';
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
      treadPattern: 'unknown',
      zones: [],
      wearPattern: 'unknown',
      alignmentConcern: false
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
    treadPattern,
    zones: parseZones(raw),
    wearPattern: parseWearPattern(raw),
    alignmentConcern: raw.alignment_concern === true
  };
}

export function isBlockedGuidance(guidance) {
  return BLOCKED_GUIDANCE.has(guidance);
}

// Integer median; even-length ties round DOWN (shallower = safer to report).
function median32nds(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.floor((sorted[mid - 1] + sorted[mid]) / 2);
}

function modalValue(values, tieBreak = () => 0) {
  const freq = new Map();
  for (const v of values) freq.set(v, (freq.get(v) ?? 0) + 1);
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || tieBreak(a[0], b[0]))[0][0];
}

/**
 * Combine several independent model runs over the SAME photos into one result.
 * Groove counts are settled by majority vote; depths by per-groove median.
 * Wide disagreement between runs caps confidence so the retry path triggers
 * instead of silently trusting one noisy run.
 */
export function aggregateParsedAnalyses(parsedRuns) {
  const runs = (parsedRuns ?? []).filter(Boolean);
  if (runs.length === 0) return parseChatGPTAnalysis(null);
  if (runs.length === 1) return { ...runs[0], sampleCount: 1, agreement32nds: null };

  const measurable = runs.filter(r => r.grooves.length > 0 && !isBlockedGuidance(r.guidance));

  // Majority of runs rejected the photo → surface the most common rejection
  if (measurable.length < Math.ceil(runs.length / 2)) {
    const rejected = runs.filter(r => !measurable.includes(r));
    const guidance = modalValue(rejected.map(r => r.guidance));
    const base = rejected.find(r => r.guidance === guidance) ?? runs[0];
    return { ...base, guidance, sampleCount: runs.length, agreement32nds: null };
  }

  // Majority groove count; ties prefer FEWER grooves (miscounts usually come
  // from sipes/shadows padded in, not real grooves left out)
  const grooveCount = modalValue(measurable.map(r => r.grooves.length), (a, b) => a - b);
  const agreeing = measurable.filter(r => r.grooves.length === grooveCount);

  const positions = groovePositionsForCount(grooveCount);
  const grooves = positions.map((position, i) => {
    const depths = agreeing.map(r => r.grooves[i].depth32nds);
    const confs = agreeing.map(r => r.grooves[i].confidence).filter(c => typeof c === 'number');
    const depth32nds = median32nds(depths);
    return {
      id: i + 1,
      position,
      positionLabel: GROOVE_POSITION_LABELS[position] ?? position,
      depth32nds,
      depthMm: parseFloat((depth32nds * MM_PER_32ND).toFixed(1)),
      rating: getSafetyLevelFrom32nds(depth32nds),
      confidence: confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : null,
      spread32nds: Math.max(...depths) - Math.min(...depths)
    };
  });

  const summary = summaryFromGrooves(grooves);
  const maxSpread = Math.max(...grooves.map(g => g.spread32nds));

  // ≥2/32″ disagreement between runs → below the 0.6 accept threshold, forcing a retake
  let confidence = summary.confidence;
  if (maxSpread >= 2) confidence = Math.min(confidence, 0.5);
  else if (maxSpread === 1) confidence *= 0.9;

  // Zones: median depth per zone across runs that reported it
  const zones = ZONE_ORDER
    .map(zone => {
      const zoneRuns = agreeing
        .map(r => r.zones?.find(z => z.zone === zone))
        .filter(Boolean);
      if (zoneRuns.length === 0) return null;
      const depth32nds = median32nds(zoneRuns.map(z => z.depth32nds));
      const confs = zoneRuns.map(z => z.confidence).filter(c => typeof c === 'number');
      return {
        zone,
        zoneLabel: ZONE_LABELS[zone],
        depth32nds,
        depthMm: parseFloat((depth32nds * MM_PER_32ND).toFixed(1)),
        rating: getSafetyLevelFrom32nds(depth32nds),
        confidence: confs.length ? confs.reduce((s, c) => s + c, 0) / confs.length : null
      };
    })
    .filter(Boolean);

  const wearPattern = modalValue(agreeing.map(r => r.wearPattern ?? 'unknown'));
  const alignmentConcern =
    agreeing.filter(r => r.alignmentConcern).length > agreeing.length / 2;

  return {
    guidance: 'keep_going',
    acceptFrame: true,
    depthMm: summary.depthMm,
    depth32nds: summary.depth32nds,
    grooves,
    rating: summary.rating,
    readyToComplete: true,
    confidence,
    notes: `${agreeing.length}/${runs.length} analysis runs agreed on ${grooveCount} groove${grooveCount === 1 ? '' : 's'}; depths matched within ${maxSpread}/32″. Shallowest: ${summary.depth32nds}/32″.`,
    grooveVisible: true,
    grooveCount,
    treadPattern: modalValue(agreeing.map(r => r.treadPattern)),
    zones,
    wearPattern,
    alignmentConcern,
    sampleCount: runs.length,
    agreement32nds: maxSpread
  };
}
