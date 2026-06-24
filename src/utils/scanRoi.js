/** Shared scan region — bracket on screen and crop sent to the model must match. */
export const SCAN_ROI = {
  x: 0.05,  // center 90% of frame width
  w: 0.90,
  y: 0.22,  // center 56% of frame height (tread band, not full sidewall)
  h: 0.56
};

export const SCAN_ROI_STYLE = {
  width: `${SCAN_ROI.w * 100}%`,
  height: `${SCAN_ROI.h * 100}%`
};
