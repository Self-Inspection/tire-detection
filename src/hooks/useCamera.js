import { useEffect, useState, useRef } from 'react';

export default function useCamera(videoRef) {
  const [stream, setStream]   = useState(null);
  const [error, setError]     = useState(null);
  const [isReady, setIsReady] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        // No `exact` on facingMode — throws OverconstrainedError on iOS.
        // 1080p ideal: the analysis crop is 90% of frame width, so a 720p
        // source leaves too little detail to tell sipes from grooves.
        let s;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
          });
        } catch {
          s = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (!active) { s.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = s;
        setStream(s);

        const [track] = s.getVideoTracks();
        const caps = track?.getCapabilities?.() ?? {};
        setHasTorch(Boolean(caps.torch));

        // Close-range tread shots need continuous autofocus where the browser
        // exposes it (Android Chrome); unsupported devices throw or ignore.
        if (Array.isArray(caps.focusMode) && caps.focusMode.includes('continuous')) {
          track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
        }

        const video = videoRef.current;
        if (!video) return;

        // playsInline must be set as HTML attribute; also enforce here in case
        video.setAttribute('playsinline', '');
        video.muted = true;
        video.srcObject = s;
        video.onloadedmetadata = () => {
          if (!active) return;
          video.play()
            .then(() => { if (active) setIsReady(true); })
            .catch(() => { if (active) setIsReady(true); }); // some browsers auto-play
        };
      } catch (err) {
        if (!active) return;
        setError(
          err.name === 'NotAllowedError'
            ? 'Camera access was denied. Allow camera permission and try again.'
            : 'Cannot access camera: ' + err.message
        );
      }
    }

    start();

    const onVisibility = () => {
      streamRef.current?.getTracks().forEach(t => { t.enabled = !document.hidden; });
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      active = false;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      setIsReady(false);
      setHasTorch(false);
      setTorchOn(false);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleTorch() {
    const [track] = streamRef.current?.getVideoTracks() ?? [];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch {
      // torch toggle unsupported mid-stream on this device — ignore
    }
  }

  return { stream, error, isReady, hasTorch, torchOn, toggleTorch };
}
