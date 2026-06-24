import { useEffect, useState } from 'react';
import { TIRE_TYPES } from '../../utils/depthToTread.js';
import {
  DEFAULT_OPENAI_MODEL,
  getDefaultSystemPrompt,
  loadScanConfig,
  saveScanConfig
} from '../../utils/tireAnalysisPrompt.js';
import Button from '../ui/Button.jsx';

const MODEL_OPTIONS = [
  { id: 'gpt-4o-mini', label: 'GPT-4o mini (faster, cheaper)' },
  { id: 'gpt-4o', label: 'GPT-4o (more accurate)' }
];

export default function SetupScreen({ onBeginScan }) {
  const saved = loadScanConfig();
  const [selectedId, setSelectedId] = useState('car');
  const [apiKey, setApiKey] = useState(saved?.apiKey ?? '');
  const [model, setModel] = useState(saved?.model ?? DEFAULT_OPENAI_MODEL);
  const [systemPrompt, setSystemPrompt] = useState(saved?.systemPrompt ?? getDefaultSystemPrompt());
  const [showPrompt, setShowPrompt] = useState(false);
  const [serverHasKey, setServerHasKey] = useState(null);

  const selected = TIRE_TYPES.find(t => t.id === selectedId);

  useEffect(() => {
    fetch('/api/health')
      .then(r => r.ok ? r.json() : null)
      .then(data => setServerHasKey(Boolean(data?.hasServerKey)))
      .catch(() => setServerHasKey(false));
  }, []);

  function handleBeginScan() {
    const config = {
      scanMode: 'chatgpt',
      apiKey: apiKey.trim(),
      model,
      systemPrompt: systemPrompt.trim() || getDefaultSystemPrompt()
    };
    saveScanConfig(config);
    onBeginScan(selected, config);
  }

  const needsApiKey = serverHasKey === false && !apiKey.trim();

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

      <div className="mt-4 bg-dark-card rounded-xl p-4 space-y-3">
        <div>
          <p className="text-sm font-semibold mb-1">OpenAI API key</p>
          <p className="text-xs text-gray-400 mb-2">
            {serverHasKey
              ? 'Server key detected — optional override below.'
              : 'Required unless OPENAI_API_KEY is set on the server (Railway).'}
          </p>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            autoComplete="off"
            className="w-full bg-dark-surface border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white placeholder:text-gray-500"
          />
        </div>

        <div>
          <label className="text-sm font-semibold mb-1 block">Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full bg-dark-surface border border-gray-700 rounded-lg px-3 py-2.5 text-sm text-white"
          >
            {MODEL_OPTIONS.map(m => (
              <option key={m.id} value={m.id}>{m.label}</option>
            ))}
          </select>
        </div>

        <div>
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

      <Button
        variant="primary"
        onClick={handleBeginScan}
        fullWidth
        disabled={needsApiKey}
      >
        Begin Scan
      </Button>
      {needsApiKey && (
        <p className="text-xs text-red-400 text-center mt-2">Enter an OpenAI API key to start scanning.</p>
      )}
    </div>
  );
}
