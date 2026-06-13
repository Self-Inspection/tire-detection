import { useRef, useEffect } from 'react';

// 256-entry RGBA LUT: blue (far/groove) → cyan → green → yellow → red (near/surface)
const LUT = new Uint8Array(256 * 4);
for (let i = 0; i < 256; i++) {
  const t = i / 255;
  let r, g, b;
  if (t < 0.25)      { const s = t / 0.25;       r = 0;              g = Math.round(255 * s);      b = 255; }
  else if (t < 0.5)  { const s = (t - 0.25) / 0.25; r = 0;          g = 255;                      b = Math.round(255 * (1 - s)); }
  else if (t < 0.75) { const s = (t - 0.5)  / 0.25; r = Math.round(255 * s); g = 255;             b = 0; }
  else               { const s = (t - 0.75) / 0.25; r = 255;         g = Math.round(255 * (1 - s)); b = 0; }
  LUT[i * 4]     = r;
  LUT[i * 4 + 1] = g;
  LUT[i * 4 + 2] = b;
  LUT[i * 4 + 3] = 170;
}

export default function DepthHeatmap({ depthMap, mapWidth = 32, mapHeight = 32 }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !depthMap) return;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(mapWidth, mapHeight);

    for (let i = 0; i < mapWidth * mapHeight; i++) {
      const d = Math.max(0, Math.min(1, depthMap[i]));
      const idx = Math.floor(d * 255);
      img.data[i * 4]     = LUT[idx * 4];
      img.data[i * 4 + 1] = LUT[idx * 4 + 1];
      img.data[i * 4 + 2] = LUT[idx * 4 + 2];
      img.data[i * 4 + 3] = LUT[idx * 4 + 3];
    }

    ctx.putImageData(img, 0, 0);
  }, [depthMap, mapWidth, mapHeight]);

  return (
    <canvas
      ref={canvasRef}
      width={mapWidth}
      height={mapHeight}
      className="absolute inset-0 w-full h-full opacity-50 mix-blend-screen pointer-events-none"
      style={{ imageRendering: 'pixelated' }}
    />
  );
}
