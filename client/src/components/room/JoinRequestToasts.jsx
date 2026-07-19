import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket.jsx';

const AUTO_DISMISS_MS = 8000;

// Mounted once at the app root (inside SocketProvider) so a room owner or
// admin gets notified of a join request no matter what page they're on —
// the socket connection is account-level now, not scoped to the Room page.
export default function JoinRequestToasts() {
  const { socketRef, connected } = useSocket();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]); // { id, roomId, username }

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    const handleCreated = (data) => {
      const id = data.requestId;
      setToasts((prev) => [...prev, { id, roomId: data.roomId, username: data.username }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };

    socket.on('join-request:created', handleCreated);
    return () => socket.off('join-request:created', handleCreated);
  }, [socketRef, connected, dismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="bg-card border border-border rounded-lg card-shadow p-3 flex items-start justify-between gap-3"
        >
          <p className="text-sm text-foreground">
            <span className="font-medium">{t.username}</span> wants to join your room
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                dismiss(t.id);
                navigate(`/room/${t.roomId}`);
              }}
              className="text-xs text-primary hover:underline"
            >
              View
            </button>
            <button
              onClick={() => dismiss(t.id)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
