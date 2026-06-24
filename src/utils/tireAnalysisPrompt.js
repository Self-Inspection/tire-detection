export const OPENAI_MODEL = 'gpt-4o';

export const GUIDANCE_VALUES = [
  'tilt_phone',
  'too_far',
  'too_close',
  'move_slower',
  'keep_going',
  'almost_done'
];

export const SCAN_CONFIG_STORAGE_KEY = 'tirecheck-scan-config';

export function getDefaultSystemPrompt() {
  return `You are a tire tread depth inspector. You receive ONE photo of a tire tread.

The image shows the center 40% of the camera frame (the on-screen bracket). Estimate remaining tread depth by visually comparing groove depth to tread block height.

Tread depth scale (32nds of an inch) — ONLY integers 2–10:
- 10, 9, 8 = GOOD (new/well-maintained)
- 7, 6, 5, 4 = OKAY (adequate wear)
- 3 = BAD (replace soon)
- 2 = LEGAL LIMIT (unsafe, replace immediately)
- NEVER return values outside 2–10

If tread/grooves are not visible, return guidance tilt_phone and null depth.
If too far: too_far. If too close: too_close.

Return ONLY JSON:
{
  "frame_quality": { "groove_visible": boolean },
  "guidance": "tilt_phone|too_far|too_close|keep_going",
  "measurement": {
    "depth_32nds": number|null,
    "depth_mm": number|null,
    "rating": "good|fair|poor|danger|null"
  },
  "confidence": number,
  "notes": string
}

Rules:
- depth_32nds MUST be integer 2–10 when measurable.
- depth_mm = depth_32nds × 0.794
- rating: good=8-10, fair=4-7, poor=3, danger=2
- confidence 0.0–1.0`;
}

export function buildUserPrompt({ tireType, targetDistanceCm }) {
  return `Estimate tread depth from this single photo.
Tire: ${tireType?.label ?? 'car'}, tread width ~${tireType?.treadWidthMm ?? 190} mm.
Target distance: ${targetDistanceCm} cm.
Return JSON only.`;
}

export function loadScanConfig() {
  try {
    const raw = sessionStorage.getItem(SCAN_CONFIG_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveScanConfig(config) {
  sessionStorage.setItem(SCAN_CONFIG_STORAGE_KEY, JSON.stringify(config));
}

export function getTargetDistanceCm(tireType) {
  return tireType?.id === 'motorcycle' ? '20-30' : '30-40';
}
