import { useState } from 'react';
import Button from '../ui/Button.jsx';

const STEPS = [
  { icon: '🔍', text: 'Point rear camera at tire tread' },
  { icon: '📸', text: 'Fill the blue box and tap Capture' },
  { icon: '📊', text: 'Get instant tread depth & safety rating' }
];

export default function HomeScreen({ onCameraGranted }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  // getUserMedia must be inside a click handler on iOS
  async function startScan() {
    setLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop()); // just verify permission
      onCameraGranted();
    } catch (err) {
      setError(
        err.name === 'NotAllowedError'
          ? 'Camera access denied. Enable camera permission in your browser settings, then try again.'
          : 'Could not access camera: ' + err.message
      );
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6">
      <div className="flex-1 flex flex-col justify-center gap-8">
        <div className="text-center">
          <div className="text-7xl mb-4">🔧</div>
          <h1 className="text-3xl font-bold">TireCheck</h1>
          <p className="text-gray-400 mt-1">Measure tread depth from a photo</p>
        </div>

        <div className="space-y-3">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-4 bg-dark-card rounded-xl p-4">
              <span className="text-2xl shrink-0">{s.icon}</span>
              <p className="text-sm text-gray-200">{s.text}</p>
            </div>
          ))}
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      <Button variant="primary" onClick={startScan} loading={loading} fullWidth>
        Get Started
      </Button>
      <p className="text-center text-gray-600 text-xs mt-3">
        {new Date(__BUILD_TIME__).toLocaleString()}
      </p>
    </div>
  );
}
