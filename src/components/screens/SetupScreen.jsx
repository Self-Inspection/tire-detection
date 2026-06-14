import { useState, useEffect } from 'react';
import { TIRE_TYPES } from '../../utils/depthToTread.js';
import Button from '../ui/Button.jsx';

export default function SetupScreen({ onBeginScan }) {
  const [selectedId,     setSelectedId]     = useState('car');
  const [lidarAvailable, setLidarAvailable] = useState(false);
  const [useLidar,       setUseLidar]       = useState(false);
  const [starting,       setStarting]       = useState(false);

  const selected = TIRE_TYPES.find(t => t.id === selectedId);

  // Probe WebXR AR + depth-sensing support (no user gesture needed for isSessionSupported)
  useEffect(() => {
    if (!navigator.xr) return;
    navigator.xr.isSessionSupported('immersive-ar').then(ok => {
      if (ok) setLidarAvailable(true);
    }).catch(() => {});
  }, []);

  async function handleBeginScan() {
    setStarting(true);
    let xrSession = null;

    if (useLidar && lidarAvailable) {
      try {
        // Must be called synchronously inside the user-gesture handler (iOS requirement)
        xrSession = await navigator.xr.requestSession('immersive-ar', {
          requiredFeatures: ['depth-sensing'],
          optionalFeatures: ['dom-overlay'],
          domOverlay: { root: document.body },
          depthSensing: {
            usagePreference: ['cpu-optimized'],
            dataFormatPreference: ['luminance-alpha']
          }
        });
      } catch {
        // User denied or device doesn't have LiDAR — fall back silently to TF.js path
      }
    }

    setStarting(false);
    onBeginScan(selected, xrSession);
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6">
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

      {/* Positioning guide */}
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

      {/* LiDAR toggle — only shown on supporting devices (iPhone 12 Pro+, iOS 17+) */}
      {lidarAvailable && (
        <button
          onClick={() => setUseLidar(v => !v)}
          style={{ touchAction: 'manipulation' }}
          className={`mt-4 w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-colors text-left
            ${useLidar ? 'border-purple-500 bg-purple-500/10' : 'border-dark-card bg-dark-card'}`}
        >
          <span className="text-2xl">📡</span>
          <div className="flex-1">
            <p className="font-semibold text-sm">Use LiDAR sensor</p>
            <p className="text-xs text-gray-400">iPhone Pro — true metric depth, no AI estimation</p>
          </div>
          <div className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5
            ${useLidar ? 'bg-purple-500' : 'bg-gray-600'}`}>
            <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform
              ${useLidar ? 'translate-x-5' : 'translate-x-0'}`} />
          </div>
        </button>
      )}

      <div className="flex-1" />

      <Button variant="primary" onClick={handleBeginScan} loading={starting} fullWidth>
        Begin Scan
      </Button>
    </div>
  );
}
