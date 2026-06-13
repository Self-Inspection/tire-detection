const MESSAGES = {
  too_far:    { text: 'Move closer to the tire', icon: '↕', color: 'bg-yellow-600' },
  too_close:  { text: 'Move back a little',      icon: '↕', color: 'bg-yellow-600' },
  move_slower:{ text: 'Move slower',             icon: '🐢', color: 'bg-orange-500' },
  tilt_phone: { text: 'Point camera at tread',   icon: '📐', color: 'bg-yellow-600' },
  keep_going: { text: 'Keep scanning...',         icon: '→',  color: 'bg-blue-700' },
  almost_done:{ text: 'Almost done!',             icon: '⭐', color: 'bg-green-600' }
};

export default function GuidanceOverlay({ guidance }) {
  const msg = guidance ? MESSAGES[guidance] : null;
  if (!msg) return null;

  return (
    <div className="absolute top-0 left-0 right-0 safe-top flex justify-center pt-4 px-4 z-10 pointer-events-none">
      <div className={`${msg.color} rounded-full px-5 py-2.5 flex items-center gap-2 shadow-lg`}>
        <span className="text-base">{msg.icon}</span>
        <span className="text-white text-sm font-medium">{msg.text}</span>
      </div>
    </div>
  );
}
