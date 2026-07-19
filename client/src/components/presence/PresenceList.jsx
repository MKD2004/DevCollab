const COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-amber-500', 'bg-sky-500', 'bg-violet-500',
];

function colorFor(username) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Shows the room's full member roster (not just who's currently online —
// that's overlaid via `onlineUserIds`, sourced from the live presence
// socket data), each tagged with their role. The owner gets inline
// promote/demote controls on every other row.
export default function PresenceList({
  members,
  ownerId,
  adminIds,
  onlineUserIds,
  isOwner,
  onPromote,
  onDemote,
}) {
  if (!members.length) {
    return <p className="text-gray-500 text-xs px-4 py-2">No members yet</p>;
  }

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        Members — {members.length}
      </p>
      {members.map((m) => {
        const isRoomOwner = m._id === ownerId;
        const isAdmin = adminIds.has(m._id);
        const online = onlineUserIds.has(m._id);

        return (
          <div key={m._id} className="flex items-center gap-2">
            <span
              className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${colorFor(m.username)}`}
            >
              {m.username[0].toUpperCase()}
            </span>
            <span className="text-sm text-gray-300 truncate">{m.username}</span>
            {isRoomOwner && (
              <span className="text-[10px] uppercase tracking-wide text-amber-400 shrink-0">Owner</span>
            )}
            {isAdmin && !isRoomOwner && (
              <span className="text-[10px] uppercase tracking-wide text-indigo-400 shrink-0">Admin</span>
            )}
            {online && <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />}
            {isOwner && !isRoomOwner && (
              <button
                onClick={() => (isAdmin ? onDemote?.(m._id) : onPromote?.(m._id))}
                className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-1.5 py-0.5 transition-colors shrink-0"
              >
                {isAdmin ? 'Remove admin' : 'Make admin'}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
