import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket.jsx';
import { acceptJoinRequest, declineJoinRequest } from '../../api/joinRequests';

// Untouched cards clear themselves so an ignored request doesn't pile up on
// screen; the request itself stays in the room's Requests tab either way, so
// dismissing costs nothing. Hovering or acting cancels the timer.
const AUTO_DISMISS_MS = 30000;

// Same hashed palette used for cursors and chat authors, so a given person
// reads as the same colour everywhere in the app.
const AVATAR_COLORS = [
  'bg-indigo-500', 'bg-emerald-500', 'bg-rose-500',
  'bg-amber-500', 'bg-sky-500', 'bg-violet-500',
];

function avatarColor(username) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Account-level join-request cards. Mounted once at the app root (inside
 * SocketProvider) so an owner or admin is prompted no matter which page they
 * are on, and can accept or decline right from the card without navigating
 * into the room first.
 */
export default function JoinRequestToasts() {
  const { socketRef, connected } = useSocket();
  const navigate = useNavigate();
  // { id, roomId, roomName, username, status, error }
  // status: 'pending' | 'accepting' | 'declining' | 'accepted' | 'declined'
  const [cards, setCards] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setCards((prev) => prev.filter((c) => c.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const cancelAutoDismiss = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const update = useCallback((id, patch) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const respond = useCallback(
    async (card, accept) => {
      cancelAutoDismiss(card.id);
      update(card.id, { status: accept ? 'accepting' : 'declining', error: null });
      try {
        if (accept) await acceptJoinRequest(card.roomId, card.id);
        else await declineJoinRequest(card.roomId, card.id);
        // Hold the resolved state briefly so the outcome is actually readable
        // rather than the card just vanishing under the cursor.
        update(card.id, { status: accept ? 'accepted' : 'declined' });
        setTimeout(() => dismiss(card.id), 1600);
      } catch (err) {
        update(card.id, {
          status: 'pending',
          error: err.response?.data?.message || 'Could not reach the server — try again.',
        });
      }
    },
    [cancelAutoDismiss, update, dismiss],
  );

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    const handleCreated = (data) => {
      const id = data.requestId;
      setCards((prev) => {
        if (prev.some((c) => c.id === id)) return prev; // ignore duplicate pushes
        return [
          ...prev,
          {
            id,
            roomId: data.roomId,
            roomName: data.roomName,
            username: data.username,
            status: 'pending',
            error: null,
          },
        ];
      });
      timers.current.set(id, setTimeout(() => dismiss(id), AUTO_DISMISS_MS));
    };

    // Someone else (another admin, or this user via the Requests panel)
    // already dealt with it — drop the card rather than leave a dead prompt.
    const handleHandled = (data) => {
      setCards((prev) => {
        const card = prev.find((c) => c.id === data.requestId);
        // Leave our own in-flight/just-resolved card alone so its outcome
        // stays readable; this is only for requests resolved elsewhere.
        if (!card || card.status !== 'pending') return prev;
        return prev.filter((c) => c.id !== data.requestId);
      });
    };

    socket.on('join-request:created', handleCreated);
    socket.on('join-request:handled', handleHandled);
    return () => {
      socket.off('join-request:created', handleCreated);
      socket.off('join-request:handled', handleHandled);
    };
  }, [socketRef, connected, dismiss]);

  // Clear any outstanding timers on unmount.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  if (cards.length === 0) return null;

  return (
    // top-20 clears both the landing/dashboard navbar and the room header,
    // which top-4 overlapped.
    <div className="fixed top-20 right-4 z-50 flex flex-col gap-3 w-[22rem] max-w-[calc(100vw-2rem)]">
      {cards.map((card) => {
        const busy = card.status === 'accepting' || card.status === 'declining';
        const resolved = card.status === 'accepted' || card.status === 'declined';

        return (
          <div
            key={card.id}
            data-testid="join-request-card"
            onMouseEnter={() => cancelAutoDismiss(card.id)}
            className={`relative overflow-hidden rounded-xl border card-shadow bg-card animate-in fade-in slide-in-from-right-4 duration-300 ${
              card.status === 'accepted'
                ? 'border-primary/60'
                : card.status === 'declined'
                  ? 'border-destructive/50'
                  : 'border-border'
            }`}
          >
            {/* Accent strip — the "incoming invite" cue */}
            <div
              className={`h-1 w-full ${
                card.status === 'accepted'
                  ? 'bg-primary'
                  : card.status === 'declined'
                    ? 'bg-destructive'
                    : 'bg-gradient-to-r from-primary via-primary/60 to-transparent'
              }`}
            />

            <div className="p-4">
              <div className="flex items-start gap-3">
                <span
                  className={`w-11 h-11 rounded-full ${avatarColor(
                    card.username,
                  )} text-white text-base font-semibold flex items-center justify-center shrink-0 ring-2 ring-background`}
                >
                  {card.username.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/80">
                    Join request
                  </p>
                  <p className="text-sm font-semibold text-foreground truncate" title={card.username}>
                    {card.username}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    wants to join{' '}
                    <button
                      onClick={() => {
                        dismiss(card.id);
                        navigate(`/room/${card.roomId}`);
                      }}
                      className="text-foreground/90 hover:text-primary hover:underline font-medium"
                    >
                      {card.roomName ?? 'your room'}
                    </button>
                  </p>
                </div>
                {!resolved && (
                  <button
                    onClick={() => dismiss(card.id)}
                    disabled={busy}
                    aria-label="Dismiss"
                    className="text-muted-foreground hover:text-foreground text-xs shrink-0 disabled:opacity-40"
                  >
                    ✕
                  </button>
                )}
              </div>

              {card.error && <p className="mt-3 text-xs text-destructive">{card.error}</p>}

              {resolved ? (
                <p
                  className={`mt-3 text-sm font-medium ${
                    card.status === 'accepted' ? 'text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {card.status === 'accepted'
                    ? `${card.username} is in.`
                    : `Declined ${card.username}.`}
                </p>
              ) : (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => respond(card, true)}
                    disabled={busy}
                    className="flex-1 text-sm font-medium bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground px-3 py-2 rounded-lg transition-colors"
                  >
                    {card.status === 'accepting' ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    onClick={() => respond(card, false)}
                    disabled={busy}
                    className="flex-1 text-sm font-medium bg-secondary hover:bg-secondary/70 disabled:opacity-50 text-foreground border border-border px-3 py-2 rounded-lg transition-colors"
                  >
                    {card.status === 'declining' ? 'Declining…' : 'Decline'}
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
