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

The image is a crop of the center 40% of the camera frame (portrait orientation). Tread grooves run horizontally across the image (left to right). Rubber tread blocks (ribs) alternate with recessed grooves.

## Your task
Identify EACH visible groove in the image and estimate its remaining depth individually. Then compute an overall summary using the SHALLOWEST groove (minimum depth) — that is the legally relevant measurement.

## Analysis steps
1. Confirm repeating tread blocks and grooves are visible. If not → guidance: tilt_phone, grooves: [].
2. Check framing: too_far, too_close, or blur → appropriate guidance.
3. Scan left-to-right across the image. For each distinct groove channel you can see:
   - Assign id (1, 2, 3… from left)
   - Assign position: "far-left" | "left" | "center-left" | "center" | "center-right" | "right" | "far-right"
   - Estimate depth_32nds (integer 2–10) by comparing groove bottom to adjacent block height
   - Set per-groove confidence 0.0–1.0
4. Check tread wear indicator bars (TWIs). If flush with surface, affected grooves are ~2/32".
5. Overall measurement = minimum depth_32nds across all grooves.

## Depth scale (32nds) — ONLY integers 2–10
- 10, 9, 8 = GOOD
- 7, 6, 5, 4 = OKAY
- 3 = BAD
- 2 = LEGAL LIMIT

## Rating from depth_32nds
- good: 8–10, fair: 4–7, poor: 3, danger: 2

Return ONLY JSON:
{
  "frame_quality": {
    "groove_visible": boolean,
    "groove_count": number,
    "wear_bars_visible": boolean,
    "wear_bars_flush": boolean,
    "image_sharp": boolean
  },
  "guidance": "tilt_phone|too_far|too_close|keep_going",
  "grooves": [
    {
      "id": number,
      "position": string,
      "depth_32nds": number,
      "depth_mm": number,
      "confidence": number
    }
  ],
  "measurement": {
    "depth_32nds": number|null,
    "depth_mm": number|null,
    "rating": "good|fair|poor|danger|null",
    "summary_method": "minimum_groove_depth"
  },
  "confidence": number,
  "notes": string
}

Rules:
- grooves array must list every groove you can distinguish (typically 3–8 visible in frame).
- depth_mm = depth_32nds × 0.794 for each groove.
- measurement.depth_32nds = min of all groove depth_32nds values.
- If no grooves measurable, return grooves: [] and null measurement.
- Overall confidence = average of per-groove confidences, or 0 if none.
- Reject (tilt_phone, empty grooves) if overall confidence would be below 0.6.
- notes: mention how many grooves were measured and the shallowest reading.`;
}

export function buildUserPrompt({ tireType, targetDistanceCm }) {
  return `Find each visible tread groove left-to-right and measure depth for each one.

Tire type: ${tireType?.label ?? 'car'} (tread width ~${tireType?.treadWidthMm ?? 190} mm)
Camera distance: ${targetDistanceCm} cm, portrait orientation.
Return per-groove depths plus overall minimum in JSON.`;
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
