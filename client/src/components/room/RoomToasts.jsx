import { useEffect } from 'react';

const AUTO_DISMISS_MS = 5000;

/**
 * Lightweight transient notifications for things happening inside a room
 * (someone arriving, for now). Deliberately separate from JoinRequestToasts:
 * those are account-level and actionable, these are room-scoped and purely
 * informational, so they sit lower and fade themselves out.
 */
export default function RoomToasts({ toasts, onDismiss }) {
  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) => setTimeout(() => onDismiss(t.id), AUTO_DISMISS_MS));
    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-testid="room-toast"
          className="flex items-center gap-2.5 bg-card/95 backdrop-blur border border-border rounded-full card-shadow pl-2.5 pr-4 py-2 animate-in fade-in slide-in-from-bottom-2"
        >
          <span className="w-6 h-6 rounded-full bg-primary/15 text-primary text-[11px] font-semibold flex items-center justify-center shrink-0">
            {t.username.slice(0, 1).toUpperCase()}
          </span>
          <p className="text-sm text-foreground whitespace-nowrap">
            <span className="font-medium">{t.username}</span>{' '}
            <span className="text-muted-foreground">joined the room</span>
          </p>
          <button
            onClick={() => onDismiss(t.id)}
            className="text-muted-foreground hover:text-foreground text-xs shrink-0"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
