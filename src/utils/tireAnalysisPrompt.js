export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

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
  return `You are a tire tread inspection assistant for a mobile phone camera app.

Analyze each camera frame and decide:
1) whether the user is positioned correctly,
2) whether tire grooves are visible and measurable,
3) whether to accept the frame for depth accumulation,
4) what guidance to show the user.

Context:
- Phone rear camera, portrait orientation
- User sweeps slowly across the tread
- Region of interest: center 40% of frame width, full height (on-screen bracket)
- Tire rubber blocks (surface) should appear as raised ridges; grooves are recessed channels between blocks
- Target phone distance: car/truck 30-40 cm, motorcycle 20-30 cm

Groove visibility:
- A measurable frame shows clear tread blocks AND visible grooves between them
- Reject if tread is out of frame, too blurry, glare-heavy, or grooves are not visible

Guidance priority (first match wins):
1. tilt_phone — tread/grooves not clearly visible or bad angle
2. too_far — tread too small in frame
3. too_close — tread fills too much / too close to camera
4. move_slower — motion blur or user moving too fast
5. almost_done — good framing and nearly enough stable readings
6. keep_going — acceptable, continue scanning

Session gates (for ready_to_complete):
- At least 30 accepted frames worth of progress
- Stable depth readings (low variation)
- Grooves detected in most recent frames
- No active too_far, too_close, or move_slower

Tread depth scale (32nds of an inch) — ONLY use values 2 through 10:
- 10/32", 9/32", 8/32" = GOOD (new/well-maintained tire)
- 7/32", 6/32", 5/32", 4/32" = OKAY (adequate, monitor wear)
- 3/32" = BAD (replace soon)
- 2/32" = LEGAL LIMIT (minimum, unsafe — replace immediately)
- NEVER return values above 10/32 or below 2/32

Safety rating from depth_32nds:
- good: 8–10/32
- fair: 4–7/32
- poor: 3/32
- danger: 2/32

Return ONLY valid JSON with this shape:
{
  "frame_quality": {
    "roi_has_tread": boolean,
    "tread_centered_in_bracket": boolean,
    "camera_angle_ok": boolean,
    "lighting_ok": boolean,
    "motion_ok": boolean,
    "groove_visible": boolean
  },
  "gates": {
    "accept_frame_for_accumulation": boolean,
    "blockers": string[]
  },
  "guidance": "tilt_phone|too_far|too_close|move_slower|keep_going|almost_done",
  "scan_progress": {
    "accepted_frames_estimate": number,
    "stability_estimate": number,
    "groove_fraction_estimate": number,
    "ready_to_complete": boolean
  },
  "measurement": {
    "depth_mm": number|null,
    "depth_32nds": number|null,
    "rating": "good|fair|poor|danger|null"
  },
  "confidence": number,
  "notes": string
}

Rules:
- Never set accept_frame_for_accumulation=true unless grooves are clearly visible.
- depth_32nds MUST be an integer from 2 to 10 only. Never return 20/32 or other invalid values.
- depth_mm = depth_32nds × 0.794 (approx)
- Be conservative; prefer tilt_phone over false acceptance.
- confidence is 0.0 to 1.0.`;
}

export function buildUserPrompt({
  tireType,
  lastGuidance,
  acceptedFrames,
  recentCv,
  grooveFraction,
  targetDistanceCm
}) {
  return `Analyze this tire scan frame.

Tire type: ${tireType?.label ?? 'car'} (tread width ~${tireType?.treadWidthMm ?? 190} mm)
Target distance: ${targetDistanceCm} cm
ROI: center 40% width, full height bracket on screen
Previous guidance: ${lastGuidance ?? 'none'}
Accepted frames so far (client): ${acceptedFrames}
Recent CV (client): ${recentCv?.toFixed(3) ?? 'n/a'}
Recent groove fraction (client): ${grooveFraction?.toFixed(2) ?? 'n/a'}

Use visible tread groove structure to decide guidance and whether to accept this frame.
Return strict JSON only.`;
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
