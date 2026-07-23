import { useState, useEffect } from 'react';
import Button from '../ui/Button.jsx';
import { TIRE_POSITIONS, WEAR_PATTERN_LABELS } from '../../utils/depthToTread.js';

const RATING_CLS = {
  good:   'text-tire-good',
  fair:   'text-tire-fair',
  poor:   'text-tire-poor',
  danger: 'text-tire-danger'
};

const POSITION_LABELS = Object.fromEntries(TIRE_POSITIONS.map(p => [p.id, p.label]));

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'completed', label: 'Completed' },
  { id: 'rejected', label: 'Rejected' }
];

function formatWhen(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ScanRow({ scan }) {
  const [expanded, setExpanded] = useState(false);
  const position = POSITION_LABELS[scan.tire_position] ?? scan.tire_position ?? 'Unknown tire';
  const adjusted = scan.adjusted_depth_32nds != null;
  const depth = adjusted ? scan.adjusted_depth_32nds : scan.depth_32nds;

  if (scan.status === 'rejected') {
    return (
      <div className="bg-dark-card rounded-xl p-4 border border-red-900/40">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-300">{position}</span>
          <span className="text-[11px] text-red-400 font-semibold uppercase">Rejected</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">{formatWhen(scan.created_at)}</p>
        <p className="text-xs text-gray-400 mt-2 leading-snug">{scan.reject_reason}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setExpanded(v => !v)}
      className="w-full text-left bg-dark-card rounded-xl p-4 border border-gray-800 active:border-gray-600"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-200">{position}</span>
        <span className={`text-lg font-bold tabular-nums ${RATING_CLS[scan.rating] ?? ''}`}>
          {depth}/32″
          {adjusted && <span className="text-[10px] text-gray-500 font-normal ml-1">edited</span>}
        </span>
      </div>
      <div className="flex items-center justify-between mt-1">
        <p className="text-xs text-gray-500">{formatWhen(scan.created_at)}</p>
        <p className={`text-xs capitalize ${RATING_CLS[scan.rating] ?? 'text-gray-400'}`}>{scan.rating}</p>
      </div>
      {scan.wear_pattern && scan.wear_pattern !== 'unknown' && scan.wear_pattern !== 'even' && (
        <p className="text-[11px] text-orange-400/90 mt-1.5">
          {WEAR_PATTERN_LABELS[scan.wear_pattern] ?? scan.wear_pattern}
        </p>
      )}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-800 space-y-1.5">
          {Array.isArray(scan.grooves) && scan.grooves.map(g => (
            <div key={g.id ?? g.position} className="flex justify-between text-xs">
              <span className="text-gray-400 capitalize">{g.positionLabel ?? g.position}</span>
              <span className={`tabular-nums ${RATING_CLS[g.rating] ?? 'text-gray-300'}`}>
                {g.depth32nds}/32″ ({g.depthMm} mm)
              </span>
            </div>
          ))}
          {Array.isArray(scan.zones) && scan.zones.length > 0 && (
            <div className="flex justify-between text-xs pt-1">
              <span className="text-gray-500">Zones (O/C/I)</span>
              <span className="text-gray-300 tabular-nums">
                {scan.zones.map(z => `${z.depth32nds}`).join(' / ')}/32″
              </span>
            </div>
          )}
          {adjusted && Array.isArray(scan.adjusted_grooves) && (
            <div className="flex justify-between text-xs pt-1">
              <span className="text-gray-500">Manual correction</span>
              <span className="text-gray-300 tabular-nums">
                {scan.adjusted_grooves.map(g => g.depth32nds).join(' / ')}/32″
              </span>
            </div>
          )}
          <div className="flex justify-between text-xs pt-1">
            <span className="text-gray-500">AI confidence</span>
            <span className="text-gray-300">
              {scan.confidence != null ? `${Math.round(scan.confidence * 100)}%` : '—'}
              {scan.photo_count ? ` · ${scan.photo_count} frames` : ''}
              {scan.sample_count > 1 ? ` · ${scan.sample_count}× runs` : ''}
            </span>
          </div>
          {scan.notes && (
            <p className="text-[11px] text-gray-500 leading-snug pt-1">{scan.notes}</p>
          )}
        </div>
      )}
    </button>
  );
}

export default function HistoryScreen({ onBack }) {
  const [scans, setScans] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    let active = true;
    fetch('/api/scans?limit=200')
      .then(r => r.json())
      .then(data => {
        if (!active) return;
        if (!data.recording) setError('Scan recording is not enabled on the server.');
        setScans(data.scans ?? []);
      })
      .catch(() => active && setError('Could not load scan history.'));
    return () => { active = false; };
  }, []);

  const visible = (scans ?? []).filter(s => filter === 'all' || s.status === filter);
  const completedCount = (scans ?? []).filter(s => s.status === 'completed').length;
  const rejectedCount = (scans ?? []).length - completedCount;

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-2xl font-bold">Scan History</h2>
        <button type="button" onClick={onBack} className="text-blue-400 text-sm underline">Back</button>
      </div>
      {scans != null && (
        <p className="text-gray-400 text-sm mb-4">
          {completedCount} completed · {rejectedCount} rejected
        </p>
      )}

      <div className="flex gap-2 mb-4">
        {FILTERS.map(f => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold
              ${filter === f.id ? 'bg-blue-600 text-white' : 'bg-dark-card text-gray-400'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 mb-4">
          {error}
        </div>
      )}

      {scans == null && !error && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {scans != null && visible.length === 0 && (
        <p className="text-gray-500 text-sm text-center py-10">No scans recorded yet.</p>
      )}

      <div className="space-y-3">
        {visible.map(s => <ScanRow key={s.id} scan={s} />)}
      </div>

      <div className="flex-1 min-h-6" />
      <Button variant="primary" onClick={onBack} fullWidth>Done</Button>
    </div>
  );
}
