import { useState } from 'react';
import { TIRE_TYPES } from '../../utils/depthToTread.js';
import {
  getDefaultSystemPrompt,
  loadScanConfig,
  saveScanConfig
} from '../../utils/tireAnalysisPrompt.js';
import Button from '../ui/Button.jsx';

export default function SetupScreen({ onBeginScan }) {
  const saved = loadScanConfig();
  const [selectedId, setSelectedId] = useState('car');
  const [systemPrompt, setSystemPrompt] = useState(saved?.systemPrompt ?? getDefaultSystemPrompt());
  const [showPrompt, setShowPrompt] = useState(false);

  const selected = TIRE_TYPES.find(t => t.id === selectedId);

  function handleBeginScan() {
    const config = {
      scanMode: 'chatgpt',
      systemPrompt: systemPrompt.trim() || getDefaultSystemPrompt()
    };
    saveScanConfig(config);
    onBeginScan(selected, config);
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-1">Select Tire Type</h2>
      <p className="text-gray-400 text-sm mb-5">Used to set reference dimensions for accurate measurement</p>

      <div className="space-y-3">
        {TIRE_TYPES.map(t => (
          <button
            key={t.id}
            onClick={() => setSelectedId(t.id)}
            style={{ touchAction: 'manipulation' }}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors text-left
              ${selectedId === t.id
                ? 'border-blue-500 bg-blue-500/10'
                : 'border-dark-card bg-dark-card'}`}
          >
            <span className="text-3xl shrink-0">{t.icon}</span>
            <div className="flex-1">
              <p className="font-semibold">{t.label}</p>
              <p className="text-xs text-gray-400">Tread width ~{t.treadWidthMm} mm</p>
            </div>
            {selectedId === t.id && <span className="text-blue-400 text-lg">✓</span>}
          </button>
        ))}
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

      <div className="mt-5 bg-dark-card rounded-xl p-4">
        <p className="text-sm font-semibold mb-2">How to position your phone</p>
        <div className="relative bg-gray-800 rounded-lg overflow-hidden" style={{ height: 80 }}>
          <svg viewBox="0 0 320 80" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="15" width="280" height="50" rx="4" fill="#2a2a2a" />
            {[55, 90, 125, 160, 195, 230].map((x, i) => (
              <rect key={i} x={x} y="15" width="16" height="50" rx="2" fill="#444" />
            ))}
            <rect x="64" y="8" width="192" height="64" rx="4" fill="none" stroke="#3b82f6"
                  strokeWidth="2" strokeDasharray="8,4" />
            <text x="160" y="78" fill="#3b82f6" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
              {selected.id === 'motorcycle' ? '20–30 cm' : '30–40 cm'}
            </text>
          </svg>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Hold phone {selected.id === 'motorcycle' ? '20–30' : '30–40'} cm away, tread filling the dashed bracket.
        </p>
      </div>

      <div className="flex-1 min-h-4" />

      <Button variant="primary" onClick={handleBeginScan} fullWidth>
        Begin Scan
      </Button>
    </div>
  );
}
