import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';

const RECOMMENDATIONS = {
  good:   'Your tires are in good condition (8/32″ or more). Check again in 6 months.',
  fair:   'Tread is okay (4–7/32″) but monitor closely. Plan replacement within 6–12 months.',
  poor:   'Tread is bad (3/32″). Replace soon — wet-weather grip is significantly reduced.',
  danger: 'REPLACE IMMEDIATELY. At the legal minimum of 2/32″. Unsafe in rain.'
};

const REFERENCE = [
  { label: 'Good',             value: '8–10/32″',  cls: 'text-tire-good' },
  { label: 'Okay',             value: '4–7/32″',   cls: 'text-tire-fair' },
  { label: 'Bad',              value: '3/32″',     cls: 'text-tire-poor' },
  { label: 'Legal limit',      value: '2/32″',     cls: 'text-tire-danger' }
];

export default function ResultsScreen({ result, onScanAgain, onDone }) {
  if (!result) return null;
  const { depthMm, depth32nds, rating } = result;

  const alertBorder = {
    good:   'bg-green-900/20 border-green-500/30',
    fair:   'bg-yellow-900/20 border-yellow-500/30',
    poor:   'bg-orange-900/20 border-orange-500/30',
    danger: 'bg-red-900/20 border-red-500/30'
  }[rating];

  return (
    <div className="flex flex-col h-full safe-top safe-bottom px-6 py-6 overflow-y-auto">
      <h2 className="text-2xl font-bold mb-5">Scan Results</h2>

      <div className="bg-dark-card rounded-2xl p-8 text-center mb-4">
        <p className="text-gray-400 text-sm mb-2">Tread Depth</p>
        <div className="flex items-end justify-center gap-1 mb-1">
          <span className="text-7xl font-bold tabular-nums leading-none">{depth32nds}</span>
          <span className="text-2xl text-gray-400 mb-2">/32″</span>
        </div>
        <p className="text-gray-400 text-lg">{depthMm.toFixed(1)} mm</p>
      </div>

      <Badge rating={rating} />

      {result.source === 'chatgpt' && result.confidence != null && (
        <p className="text-xs text-gray-500 text-center mt-2">
          AI confidence: {Math.round(result.confidence * 100)}%
        </p>
      )}

      <div className={`rounded-xl p-4 border mt-4 ${alertBorder}`}>
        <p className="text-sm leading-relaxed">{RECOMMENDATIONS[rating]}</p>
      </div>

      <div className="bg-dark-card rounded-xl p-4 mt-4">
        <p className="text-xs font-semibold text-gray-400 mb-3">Tread depth chart</p>
        <div className="space-y-2">
          {REFERENCE.map(r => (
            <div key={r.label} className="flex justify-between text-xs">
              <span className="text-gray-400">{r.label}</span>
              <span className={r.cls}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <Button variant="secondary" onClick={onDone} className="flex-1">Done</Button>
        <Button variant="primary"   onClick={onScanAgain} className="flex-1">Scan Again</Button>
      </div>
    </div>
  );
}
