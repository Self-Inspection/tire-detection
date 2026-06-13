export default function ProgressRing({ progress }) {
  const r = 36;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.min(1, Math.max(0, progress)));
  const isDone = progress >= 1;

  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="#ffffff20" strokeWidth="6" />
        <circle
          cx="48" cy="48" r={r}
          fill="none"
          stroke={isDone ? '#22c55e' : '#3b82f6'}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.3s ease, stroke 0.5s ease' }}
        />
      </svg>
      <span className="text-white text-lg font-bold tabular-nums">
        {Math.round(Math.min(100, progress * 100))}%
      </span>
    </div>
  );
}
