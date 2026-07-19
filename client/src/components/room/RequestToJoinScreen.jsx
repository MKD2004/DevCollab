export default function RequestToJoinScreen({ roomName, status, onRequest, onBack }) {
  const canRequest = status === 'idle' || status === 'sending';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
      <div className="text-center max-w-sm">
        <p className="text-foreground text-lg font-medium mb-1">{roomName}</p>
        <p className="text-muted-foreground mb-6">
          {status === 'pending' && "Your request to join has been sent — waiting for the owner to respond."}
          {status === 'declined' && 'Your request to join was declined.'}
          {canRequest && "You're not a member of this room yet."}
        </p>
        {canRequest && (
          <button
            onClick={onRequest}
            disabled={status === 'sending'}
            className="bg-foreground hover:bg-foreground/90 disabled:opacity-50 text-background text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {status === 'sending' ? 'Sending…' : 'Request to Join'}
          </button>
        )}
        <button onClick={onBack} className="block mx-auto mt-5 text-primary hover:underline">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
