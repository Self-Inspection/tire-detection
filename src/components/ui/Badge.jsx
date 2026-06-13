const CONFIG = {
  good:   { label: 'Good Condition',  icon: '✅', bg: 'bg-green-900/40',  border: 'border-tire-good',   text: 'text-tire-good' },
  fair:   { label: 'Fair Condition',  icon: '⚠️', bg: 'bg-yellow-900/40', border: 'border-tire-fair',   text: 'text-tire-fair' },
  poor:   { label: 'Replace Soon',    icon: '⚡', bg: 'bg-orange-900/40', border: 'border-tire-poor',   text: 'text-tire-poor' },
  danger: { label: 'Replace Now',     icon: '🚨', bg: 'bg-red-900/40',    border: 'border-tire-danger', text: 'text-tire-danger' }
};

export default function Badge({ rating }) {
  const c = CONFIG[rating] ?? CONFIG.fair;
  return (
    <div className={`rounded-xl p-4 border-2 ${c.bg} ${c.border} flex items-center gap-3`}>
      <span className="text-3xl">{c.icon}</span>
      <div>
        <p className="text-xs text-gray-400">Safety Rating</p>
        <p className={`text-xl font-bold ${c.text}`}>{c.label}</p>
      </div>
    </div>
  );
}
