export default function JoinRequestsPanel({ requests, onAccept, onDecline }) {
  if (!requests.length) {
    return <p className="text-gray-500 text-xs px-4 py-3">No pending join requests</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        Pending — {requests.length}
      </p>
      {requests.map((r) => (
        <div key={r._id} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5">
          <p className="text-sm text-white font-medium truncate">{r.username}</p>
          <p className="text-[11px] text-gray-500 mb-2">wants to join this room</p>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(r._id)}
              className="flex-1 text-xs bg-emerald-700 hover:bg-emerald-600 text-white px-2 py-1.5 rounded-md transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onDecline(r._id)}
              className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 px-2 py-1.5 rounded-md transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
