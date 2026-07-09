const COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-amber-500', 'bg-sky-500', 'bg-violet-500',
];

function colorFor(username) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function PresenceList({ users }) {
  if (!users.length) {
    return <p className="text-gray-500 text-xs px-4 py-2">No one else here yet</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        Online — {users.length}
      </p>
      {users.map((u) => (
        <div key={u.userId} className="flex items-center gap-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${colorFor(u.username)}`}
          >
            {u.username[0].toUpperCase()}
          </span>
          <span className="text-sm text-gray-300 truncate">{u.username}</span>
          <span className="ml-auto w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
        </div>
      ))}
    </div>
  );
}
