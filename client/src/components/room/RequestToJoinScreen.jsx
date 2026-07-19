export default function RequestToJoinScreen({ roomName, status, onRequest, onBack }) {
  const canRequest = status === 'idle' || status === 'sending';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
      <div className="text-center max-w-sm">
        <p className="text-white text-lg font-medium mb-1">{roomName}</p>
        <p className="text-gray-400 mb-6">
          {status === 'pending' && "Your request to join has been sent — waiting for the owner to respond."}
          {status === 'declined' && 'Your request to join was declined.'}
          {canRequest && "You're not a member of this room yet."}
        </p>
        {canRequest && (
          <button
            onClick={onRequest}
            disabled={status === 'sending'}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors"
          >
            {status === 'sending' ? 'Sending…' : 'Request to Join'}
          </button>
        )}
        <button onClick={onBack} className="block mx-auto mt-5 text-indigo-400 hover:underline">
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
