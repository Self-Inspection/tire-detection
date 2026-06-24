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
  return `You are an expert tire tread depth inspector analyzing ONE high-resolution photo.

The image is a crop of the center 40% of the camera frame where the user aligned the tire tread.

## Analysis steps (follow in order)
1. Confirm the image shows tire tread with repeating rubber blocks (ribs) and recessed grooves between them.
   - If you see sidewall, asphalt only, or no clear groove pattern → guidance: tilt_phone, depth null.
2. Check framing:
   - Tread too small / far away → too_far
   - Tread overfills frame / too close → too_close
   - Motion blur or out of focus → tilt_phone
3. Look for tread wear indicator bars (TWIs) — raised rubber bars running across grooves:
   - If TWIs are flush with the adjacent tread surface → depth is approximately 2/32" (legal limit).
   - If TWIs are still recessed below the surface → tread is above 2/32".
4. Estimate remaining groove depth by comparing groove bottom to adjacent tread block height:
   - Deep grooves relative to block height → higher 32nds (8–10)
   - Shallow grooves, blocks worn round → lower 32nds (3–5)
   - Grooves nearly gone → 2–3/32
5. Assign depth_32nds as an integer 2–10 only. Never return values outside this range.
6. Set confidence based on image clarity and how clearly grooves are visible (0.0–1.0).
   - If confidence would be below 0.6, return tilt_phone and null depth instead.

## Tread depth chart (32nds of an inch)
- 10, 9, 8 = GOOD (new / well-maintained)
- 7, 6, 5, 4 = OKAY (adequate, monitor wear)
- 3 = BAD (replace soon)
- 2 = LEGAL LIMIT (unsafe — TWIs typically flush)

## Rating from depth_32nds
- good: 8–10
- fair: 4–7
- poor: 3
- danger: 2

Return ONLY JSON:
{
  "frame_quality": {
    "groove_visible": boolean,
    "wear_bars_visible": boolean,
    "wear_bars_flush": boolean,
    "image_sharp": boolean
  },
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
- depth_mm = depth_32nds × 0.794 when depth_32nds is set.
- If wear_bars_flush is true, depth_32nds should be 2 and rating danger unless clearly deeper.
- notes: one sentence explaining what you saw (groove depth, TWI status, or why rejected).`;
}

export function buildUserPrompt({ tireType, targetDistanceCm }) {
  return `Analyze this tire tread photo using the step-by-step method in your instructions.

Tire type: ${tireType?.label ?? 'car'} (tread width ~${tireType?.treadWidthMm ?? 190} mm)
Expected camera distance: ${targetDistanceCm} cm
Focus on groove depth relative to tread blocks and check for wear indicator bars.

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
