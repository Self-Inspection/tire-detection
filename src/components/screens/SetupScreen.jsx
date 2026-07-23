import { useState } from 'react';
import { DEFAULT_TIRE_TYPE, TIRE_POSITIONS } from '../../utils/depthToTread.js';
import {
  getDefaultSystemPrompt,
  loadScanConfig,
  saveScanConfig
} from '../../utils/tireAnalysisPrompt.js';
import Button from '../ui/Button.jsx';

/** Landscape phone sweeping across a tire, seen from the side. */
function SetupIllustration() {
  return (
    <svg viewBox="0 0 220 120" className="h-36 w-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Tire (front view of tread band) */}
      <rect x="15" y="18" width="60" height="90" rx="14" fill="#2a2a2a" stroke="#444" strokeWidth="2" />
      {Array.from({ length: 4 }, (_, i) => (
        <rect key={i} x={24 + i * 12} y="24" width="5" height="78" rx="2" fill="#141414" />
      ))}

      {/* Sweep arc */}
      <path
        d="M 110 30 A 55 55 0 0 1 110 96"
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeDasharray="5,4"
        markerEnd="url(#arrow)"
      />
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L8,4 L0,8 z" fill="#3b82f6" />
        </marker>
      </defs>

      {/* Phone — landscape */}
      <rect x="125" y="47" width="80" height="38" rx="7" fill="#1a1a2e" stroke="#555" strokeWidth="2" />
      <rect x="131" y="51" width="68" height="30" rx="2" fill="#111" />
      <circle cx="129" cy="66" r="2" fill="#333" />

      <text x="110" y="16" fill="#3b82f6" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
        Sweep shoulder → shoulder
      </text>
      <text x="165" y="100" fill="#9ca3af" fontSize="8" textAnchor="middle" fontFamily="sans-serif">
        Landscape · ~20 cm · parallel
      </text>
    </svg>
  );
}

export default function SetupScreen({ onBeginScan }) {
  const saved = loadScanConfig();
  const [systemPrompt, setSystemPrompt] = useState(saved?.systemPrompt ?? getDefaultSystemPrompt());
  const [showPrompt, setShowPrompt] = useState(false);
  const [tirePosition, setTirePosition] = useState(null);

  function handleBeginScan() {
    if (!tirePosition) return;
    const config = {
      scanMode: 'chatgpt',
      tirePosition,
      systemPrompt: systemPrompt.trim() || getDefaultSystemPrompt()
    };
    saveScanConfig(config);
    onBeginScan(DEFAULT_TIRE_TYPE, config);
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-1">Which tire?</h2>
      <p className="text-gray-400 text-sm mb-5">Select the tire you want to scan</p>

      {/* Tire position selector — car outline with 4 wheels */}
      <div className="grid grid-cols-2 gap-3">
        {TIRE_POSITIONS.map(pos => {
          const selected = tirePosition?.id === pos.id;
          return (
            <button
              key={pos.id}
              type="button"
              onClick={() => setTirePosition(pos)}
              className={`rounded-xl p-4 border-2 text-left transition-colors
                ${selected
                  ? 'border-blue-500 bg-blue-600/15'
                  : 'border-gray-700 bg-dark-card active:border-gray-500'}`}
            >
              <span className={`text-lg font-bold ${selected ? 'text-blue-400' : 'text-gray-200'}`}>
                {pos.short}
              </span>
              <p className="text-xs text-gray-400 mt-0.5">{pos.label}</p>
            </button>
          );
        })}
      </div>

      <div className="mt-5 bg-dark-card rounded-xl p-4">
        <p className="text-sm font-semibold mb-2">How the scan works</p>
        <div className="relative bg-gray-800 rounded-lg overflow-hidden flex justify-center py-3">
          <SetupIllustration />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Hold your phone <span className="text-white">sideways (landscape)</span>, about
          <span className="text-white"> 20 cm</span> from the tread and parallel to the tire.
          Tap <span className="text-white">Record</span>, then sweep slowly in an arc from one
          shoulder of the tire to the other for about <span className="text-white">7 seconds</span>.
          The flashlight turns on automatically and the phone vibrates when the recording is done.
          You'll get depth for each groove plus wear across the tread — and you can adjust the
          numbers afterwards if needed.
        </p>
      </div>

      <div className="mt-4 bg-dark-card rounded-xl p-4">
        <button
          type="button"
          onClick={() => setShowPrompt(v => !v)}
          className="text-sm text-blue-400 underline"
        >
          {showPrompt ? 'Hide custom prompt' : 'Edit system prompt'}
        </button>
        {showPrompt && (
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            rows={10}
            className="mt-2 w-full bg-dark-surface border border-gray-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
          />
        )}
      </div>

      <div className="flex-1 min-h-4" />

      <Button variant="primary" onClick={handleBeginScan} fullWidth disabled={!tirePosition}>
        {tirePosition ? `Scan ${tirePosition.label} Tire` : 'Select a tire to continue'}
      </Button>
    </div>
  );
}
