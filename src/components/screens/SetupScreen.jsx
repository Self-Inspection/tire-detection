import { useState } from 'react';
import { DEFAULT_TIRE_TYPE } from '../../utils/depthToTread.js';
import {
  getDefaultSystemPrompt,
  loadScanConfig,
  saveScanConfig
} from '../../utils/tireAnalysisPrompt.js';
import Button from '../ui/Button.jsx';
import { SCAN_ROI } from '../../utils/scanRoi.js';

/** Phone screen rect inside the setup illustration SVG (viewBox 0 0 120 200). */
const PHONE_SCREEN = { x: 34, y: 22, w: 52, h: 140 };

function setupBracketRect() {
  return {
    x: PHONE_SCREEN.x + PHONE_SCREEN.w * SCAN_ROI.x,
    y: PHONE_SCREEN.y + PHONE_SCREEN.h * SCAN_ROI.y,
    w: PHONE_SCREEN.w * SCAN_ROI.w,
    h: PHONE_SCREEN.h * SCAN_ROI.h
  };
}

function SetupIllustration() {
  const bracket = setupBracketRect();
  const treadX = PHONE_SCREEN.x + 4;
  const treadW = PHONE_SCREEN.w - 8;
  const treadY = PHONE_SCREEN.y + 6;
  const treadH = PHONE_SCREEN.h - 12;
  const grooveCount = 7;

  return (
    <svg viewBox="0 0 120 200" className="h-48 w-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Phone body — portrait */}
      <rect x="28" y="8" width="64" height="168" rx="10" fill="#1a1a2e" stroke="#555" strokeWidth="2" />
      <rect x={PHONE_SCREEN.x} y={PHONE_SCREEN.y} width={PHONE_SCREEN.w} height={PHONE_SCREEN.h} rx="2" fill="#111" />
      <circle cx="60" cy="16" r="3" fill="#333" />

      {/* Tread seen through camera — grooves run top-to-bottom in portrait */}
      <rect x={treadX} y={treadY} width={treadW} height={treadH} fill="#2a2a2a" />
      {Array.from({ length: grooveCount }, (_, i) => {
        const colW = treadW / grooveCount;
        const x = treadX + i * colW;
        const isGroove = i % 2 === 0;
        return (
          <rect
            key={i}
            x={x}
            y={treadY}
            width={colW}
            height={treadH}
            fill={isGroove ? '#141414' : '#4a4a4a'}
          />
        );
      })}

      {/* Scan bracket — synced with live scanner ROI */}
      <rect
        x={bracket.x}
        y={bracket.y}
        width={bracket.w}
        height={bracket.h}
        rx="3"
        fill="none"
        stroke="#3b82f6"
        strokeWidth="2"
        strokeDasharray="6,3"
      />

      <text x="60" y="192" fill="#3b82f6" fontSize="8" textAnchor="middle" fontFamily="sans-serif">
        Portrait · 30–40 cm
      </text>
    </svg>
  );
}

export default function SetupScreen({ onBeginScan }) {
  const saved = loadScanConfig();
  const [systemPrompt, setSystemPrompt] = useState(saved?.systemPrompt ?? getDefaultSystemPrompt());
  const [showPrompt, setShowPrompt] = useState(false);

  function handleBeginScan() {
    const config = {
      scanMode: 'chatgpt',
      systemPrompt: systemPrompt.trim() || getDefaultSystemPrompt()
    };
    saveScanConfig(config);
    onBeginScan(DEFAULT_TIRE_TYPE, config);
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-1">Get Ready</h2>
      <p className="text-gray-400 text-sm mb-5">Car tires · tread width ~{DEFAULT_TIRE_TYPE.treadWidthMm} mm</p>

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
        <div className="relative bg-gray-800 rounded-lg overflow-hidden flex justify-center py-4" style={{ minHeight: 200 }}>
          <SetupIllustration />
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Hold phone <span className="text-white">upright in portrait</span> — do not rotate sideways.
          Point at the tread from the side, straight on. Fill the blue box with the tread and let
          <span className="text-white"> at least 2 full pattern repeats</span> show — angled or V-shaped
          (directional/chevron) grooves are fine, just don't crop them off.
          Even, indirect light works best — use the light button if part of the tread is in shadow.
          Tap <span className="text-white">Capture</span> when ready.
        </p>
      </div>

      <div className="flex-1 min-h-4" />

      <Button variant="primary" onClick={handleBeginScan} fullWidth>
        Open Camera
      </Button>
    </div>
  );
}
