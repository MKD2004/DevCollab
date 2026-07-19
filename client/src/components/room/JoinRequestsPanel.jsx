export default function JoinRequestsPanel({ requests, onAccept, onDecline }) {
  if (!requests.length) {
    return <p className="text-muted-foreground text-xs px-4 py-3">No pending join requests</p>;
  }

  return (
    <div className="flex flex-col gap-3 px-4 py-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
        Pending — {requests.length}
      </p>
      {requests.map((r) => (
        <div key={r._id} className="bg-secondary border border-border rounded-lg px-3 py-2.5">
          <p className="text-sm text-foreground font-medium truncate">{r.username}</p>
          <p className="text-[11px] text-muted-foreground mb-2">wants to join this room</p>
          <div className="flex gap-2">
            <button
              onClick={() => onAccept(r._id)}
              className="flex-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground px-2 py-1.5 rounded-md transition-colors"
            >
              Accept
            </button>
            <button
              onClick={() => onDecline(r._id)}
              className="flex-1 text-xs bg-secondary hover:bg-secondary/70 border border-border text-foreground/80 px-2 py-1.5 rounded-md transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
