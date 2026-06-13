// Stub for @mediapipe/selfie_segmentation.
// body-segmentation statically requires this package, but when using
// runtime:'tfjs' the MediaPipe code path is never entered. This stub
// satisfies the import without pulling in the real WASM-based package.
export const SelfieSegmentation = class {};
export const VERSION = '0.1';
export default { SelfieSegmentation, VERSION };
