# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this project is

A mobile-first PWA that uses the phone's rear camera + TensorFlow.js monocular depth estimation (ARPortraitDepth / MiDaS) to measure tire tread groove depth. The user opens the app, selects tire type, sweeps their phone across the tread, and receives a depth reading in 32nds of an inch and mm with a color-coded safety rating.

## Commands

```bash
npm install          # requires .npmrc legacy-peer-deps=true (already set)
npm run dev          # HTTPS dev server — camera API requires HTTPS even on localhost
npm run build        # production build to dist/
npm run preview      # preview the production build
npm run lint         # ESLint on src/
```

`npm run dev` uses `@vitejs/plugin-basic-ssl` to serve over HTTPS — required for `getUserMedia` on mobile browsers. The self-signed cert will trigger a browser warning; accept it to test camera access.

## Architecture

**State machine** (`src/App.jsx`) — four screens, no router:
```
home → setup → scanning → results
```
Transitions are plain `useReducer` dispatches. All inter-screen data (tireType, scanResult) lives in App state and flows down as props.

**Depth pipeline** (scanner screen):
1. `useCamera` — opens rear camera via `getUserMedia`, manages iOS/Android quirks
2. `useDepthModel` — loads TF.js ARPortraitDepth model, runs inference at ~10fps
3. `useWebXR` — optional WebXR Depth Sensing (Android ARCore only); provides metric scale factor if available; silently no-ops on iOS
4. `useScanAnalysis` — receives depth frames, extracts center-40%-width ROI, downsamples to 32×32, applies bimodal histogram analysis to separate groove/surface depth peaks, accumulates readings until stable

**Depth → measurement conversion** (`src/utils/depthToTread.js`):
- ARPortraitDepth outputs normalized depth where higher = farther (0 = near, 1 = far)
- Tire surface (rubber peaks) = lower values; groove bottoms = higher values
- Bimodal histogram peaks split on groove vs. surface
- Scale calibrated from known tread width + estimated focal length (853px default)
- `DEPTH_SCALE_TUNE` constant (currently 0.5) needs empirical tuning against a known tire

**Scan completion gate** (`src/hooks/useScanAnalysis.js`): fires `onComplete` when simultaneously: ≥30 stable frames, CV < 0.15, bimodal histogram in ≥80% of frames, 2 consecutive stable seconds, no `move_slower` alert.

## Key platform constraints

- `getUserMedia` must be called inside a click handler on iOS (not in `useEffect`)
- `<video>` needs `autoPlay muted playsInline` JSX attributes — all three required on iOS
- WebXR depth sensing is not available on iOS Safari (ARKit not exposed to web); app falls back to MiDaS-only calibration
- TF.js tensors: always call `depthMap.dispose()` after reading — silent tab crash on iOS otherwise
- `@mediapipe/selfie_segmentation` and related packages are marked external in `vite.config.js` — they are optional lazy imports inside `@tensorflow-models/body-segmentation` that are never actually needed for ARPortraitDepth

## Calibration tuning

The depth-to-mm conversion has one tuneable constant: `DEPTH_SCALE_TUNE` in `src/utils/depthToTread.js`. To calibrate:
1. Scan a tire whose actual depth is known (e.g., a new tire reads ~8mm / 10/32")
2. Note what the app reports
3. Adjust `DEPTH_SCALE_TUNE = current_value * (actual_mm / reported_mm)` and rebuild

When WebXR depth sensing is available (Android ARCore), scale is derived from `useWebXR`'s `metricsScaleFactor` and `DEPTH_SCALE_TUNE` still applies as a fine-tune multiplier.

## Safety thresholds (from `src/utils/depthToTread.js`)

| Depth | Rating |
|---|---|
| ≥ 6/32" (4.76 mm) | Good |
| 4–6/32" (3.18–4.76 mm) | Fair |
| 2–4/32" (1.59–3.18 mm) | Poor |
| < 2/32" (< 1.59 mm) | Danger / illegal |
