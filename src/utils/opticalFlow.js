// Returns mean absolute depth-change between consecutive frames as a proxy for motion speed.
// A true WebGL Lucas-Kanade implementation can replace this for Phase 6.
export function computeMotionMagnitude(prevFrame, currFrame) {
  if (!prevFrame || !currFrame || prevFrame.length !== currFrame.length) return 0;
  let sum = 0;
  const n = prevFrame.length;
  for (let i = 0; i < n; i++) sum += Math.abs(currFrame[i] - prevFrame[i]);
  return sum / n;
}
