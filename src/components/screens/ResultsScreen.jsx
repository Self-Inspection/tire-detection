import { useState } from 'react';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { logScanAdjustment } from '../../utils/scanLog.js';
import {
  MAX_GROOVES,
  MM_PER_32ND,
  getSafetyLevelFrom32nds,
  WEAR_PATTERN_LABELS
} from '../../utils/depthToTread.js';

const RECOMMENDATIONS = {
  good:   'Your tires are in good condition (8/32″ or more). Check again in 6 months.',
  fair:   'Tread is okay (4–7/32″) but monitor closely. Plan replacement within 6–12 months.',
  poor:   'Tread is bad (3/32″). Replace soon — wet-weather grip is significantly reduced.',
  danger: 'REPLACE IMMEDIATELY. At the legal minimum of 2/32″. Unsafe in rain.'
};

const RATING_CLS = {
  good:   'text-tire-good',
  fair:   'text-tire-fair',
  poor:   'text-tire-poor',
  danger: 'text-tire-danger'
};

const RATING_BAR_CLS = {
  good:   'bg-green-500',
  fair:   'bg-yellow-500',
  poor:   'bg-orange-500',
  danger: 'bg-red-500'
};

const REFERENCE = [
  { label: 'Good',        value: '8–10/32″', cls: 'text-tire-good' },
  { label: 'Okay',        value: '4–7/32″',  cls: 'text-tire-fair' },
  { label: 'Bad',         value: '3/32″',    cls: 'text-tire-poor' },
  { label: 'Legal limit', value: '2/32″',    cls: 'text-tire-danger' }
];

const MIN_DEPTH = 2;
const MAX_DEPTH = 12;

function clampDepth(v) {
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, v));
}

/** Zone bars: visual depth comparison across the tread width. */
function ZoneChart({ zones }) {
  return (
    <div className="flex items-end justify-around gap-3 h-32 px-2">
      {zones.map(z => (
        <div key={z.zone} className="flex flex-col items-center gap-1 flex-1">
          <span className={`text-sm font-semibold tabular-nums ${RATING_CLS[z.rating] ?? ''}`}>
            {z.depthMm} mm
          </span>
          <span className="text-[10px] text-gray-500 tabular-nums">{z.depth32nds}/32″</span>
          <div className="w-full flex justify-center items-end" style={{ height: 56 }}>
            <div
              className={`w-8 rounded-t ${RATING_BAR_CLS[z.rating] ?? 'bg-gray-500'}`}
              style={{ height: `${Math.min(100, (z.depth32nds / 10) * 100)}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400 text-center leading-tight">{z.zoneLabel}</span>
        </div>
      ))}
    </div>
  );
}

export default function ResultsScreen({ result, onScanAgain, onDone }) {
  const [editing, setEditing] = useState(false);
  const [editedDepths, setEditedDepths] = useState(null);

  if (!result) return null;
  const { grooves: rawGrooves = [], zones = [], wearPattern, alignmentConcern, tirePosition } = result;
  const baseGrooves = rawGrooves.slice(0, MAX_GROOVES);

  // Manual correction: user-adjusted depths override the AI reading
  const grooves = baseGrooves.map((g, i) => {
    const depth32nds = editedDepths?.[i] ?? g.depth32nds;
    return {
      ...g,
      depth32nds,
      depthMm: parseFloat((depth32nds * MM_PER_32ND).toFixed(1)),
      rating: getSafetyLevelFrom32nds(depth32nds)
    };
  });

  const wasAdjusted = editedDepths != null &&
    grooves.some((g, i) => g.depth32nds !== baseGrooves[i].depth32nds);

  const shallowest = grooves.length > 0
    ? grooves.reduce((min, g) => (g.depth32nds < min.depth32nds ? g : min))
    : null;
  const depth32nds = shallowest?.depth32nds ?? result.depth32nds;
  const depthMm = shallowest?.depthMm ?? result.depthMm;
  const rating = shallowest?.rating ?? result.rating;

  function handleAccept() {
    // Navigation must never be blocked by the best-effort adjustment logging
    try {
      if (wasAdjusted && result.scanLogId) {
        logScanAdjustment(result.scanLogId, {
          adjustedGrooves: grooves.map(g => ({ position: g.position, depth32nds: g.depth32nds })),
          adjustedDepth32nds: depth32nds
        });
      }
    } finally {
      onDone();
    }
  }

  function adjustDepth(index, delta) {
    setEditedDepths(prev => {
      const next = prev ? [...prev] : baseGrooves.map(g => g.depth32nds);
      next[index] = clampDepth(next[index] + delta);
      return next;
    });
  }

  const alertBorder = {
    good:   'bg-green-900/20 border-green-500/30',
    fair:   'bg-yellow-900/20 border-yellow-500/30',
    poor:   'bg-orange-900/20 border-orange-500/30',
    danger: 'bg-red-900/20 border-red-500/30'
  }[rating];

  const wearMessage = WEAR_PATTERN_LABELS[wearPattern] || '';

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-1">Results</h2>
      {tirePosition && (
        <p className="text-gray-400 text-sm mb-4">{tirePosition.label} tire</p>
      )}

      <div className="bg-dark-card rounded-2xl p-6 text-center mb-4">
        <p className="text-gray-400 text-sm mb-1">Overall (shallowest groove)</p>
        <div className="flex items-end justify-center gap-1 mb-1">
          <span className="text-6xl font-bold tabular-nums leading-none">{depth32nds}</span>
          <span className="text-xl text-gray-400 mb-1">/32″</span>
        </div>
        <p className="text-gray-400">{depthMm?.toFixed(1)} mm</p>
        {grooves.length > 0 && (
          <p className="text-xs text-gray-500 mt-2">
            {grooves.length} grooves measured{wasAdjusted && ' · manually adjusted'}
          </p>
        )}
      </div>

      <Badge rating={rating} />

      {zones.length > 0 && (
        <div className="bg-dark-card rounded-xl p-4 mt-4">
          <p className="text-xs font-semibold text-gray-400 mb-3">Wear across the tread</p>
          <ZoneChart zones={zones} />
          {wearMessage && (
            <p className={`text-xs mt-3 ${alignmentConcern ? 'text-orange-400' : 'text-gray-400'}`}>
              {alignmentConcern && '⚠️ '}{wearMessage}
            </p>
          )}
        </div>
      )}

      {grooves.length > 0 && (
        <div className="bg-dark-card rounded-xl p-4 mt-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-gray-400">Per-groove depth (up to {MAX_GROOVES})</p>
            <button
              type="button"
              onClick={() => setEditing(v => !v)}
              className="text-xs text-blue-400 underline"
            >
              {editing ? 'Done adjusting' : 'Adjust'}
            </button>
          </div>
          <div className="space-y-2">
            {grooves.map((g, i) => (
              <div key={g.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-800 last:border-0">
                <span className="text-gray-300 capitalize">
                  {g.positionLabel}
                </span>
                <span className="flex items-center gap-2">
                  {editing && (
                    <button
                      type="button"
                      onClick={() => adjustDepth(i, -1)}
                      disabled={g.depth32nds <= MIN_DEPTH}
                      className="w-8 h-8 rounded-full bg-dark-surface border border-gray-700 text-white text-lg leading-none disabled:opacity-30"
                    >
                      −
                    </button>
                  )}
                  <span className={`font-semibold tabular-nums ${RATING_CLS[g.rating] ?? ''} ${editing ? 'w-16 text-center' : ''}`}>
                    {g.depth32nds}/32″
                    {!editing && (
                      <span className="text-gray-500 font-normal ml-1.5 text-xs">
                        ({g.depthMm} mm)
                      </span>
                    )}
                  </span>
                  {editing && (
                    <button
                      type="button"
                      onClick={() => adjustDepth(i, 1)}
                      disabled={g.depth32nds >= MAX_DEPTH}
                      className="w-8 h-8 rounded-full bg-dark-surface border border-gray-700 text-white text-lg leading-none disabled:opacity-30"
                    >
                      +
                    </button>
                  )}
                </span>
              </div>
            ))}
          </div>
          {editing && (
            <p className="text-[10px] text-gray-500 mt-2">
              Adjust if the AI reading doesn't match a manual gauge. Overall updates automatically.
            </p>
          )}
        </div>
      )}

      {result.source === 'chatgpt' && result.confidence != null && (
        <p className="text-xs text-gray-500 text-center mt-2">
          AI confidence: {Math.round(result.confidence * 100)}%
          {result.photoCount > 1 && ` · ${result.photoCount} sweep frames analyzed`}
          {result.sampleCount > 1 && ` · ${result.sampleCount}× analysis`}
          {result.agreement32nds != null && result.sampleCount > 1 &&
            ` (runs agreed within ${result.agreement32nds}/32″)`}
          {result.treadPattern === 'directional' && ' · directional/chevron tread detected'}
        </p>
      )}

      <div className={`rounded-xl p-4 border mt-4 ${alertBorder}`}>
        <p className="text-sm leading-relaxed">{RECOMMENDATIONS[rating]}</p>
      </div>

      <div className="bg-dark-card rounded-xl p-4 mt-4">
        <p className="text-xs font-semibold text-gray-400 mb-3">Tread depth chart</p>
        <div className="space-y-2">
          {REFERENCE.map(r => (
            <div key={r.label} className="flex justify-between text-xs">
              <span className="text-gray-400">{r.label}</span>
              <span className={r.cls}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Extra bottom clearance: buttons flush with the screen edge lose their
          first tap to iOS Safari's toolbar-reveal gesture */}
      <div className="flex gap-3 mt-6 mb-8">
        <Button variant="secondary" onClick={onScanAgain} className="flex-1">Rescan</Button>
        <Button variant="primary"   onClick={handleAccept} className="flex-1">Accept</Button>
      </div>
    </div>
  );
}
