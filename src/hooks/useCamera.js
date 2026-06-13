import { useEffect, useState, useRef } from 'react';

export default function useCamera(videoRef) {
  const [stream, setStream]   = useState(null);
  const [error, setError]     = useState(null);
  const [isReady, setIsReady] = useState(false);
  const streamRef = useRef(null);

  useEffect(() => {
    let active = true;

    async function start() {
      try {
        // No `exact` on facingMode — throws OverconstrainedError on iOS
        let s;
        try {
          s = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
          });
        } catch {
          s = await navigator.mediaDevices.getUserMedia({ video: true });
        }

        if (!active) { s.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = s;
        setStream(s);

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
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { stream, error, isReady };
}
