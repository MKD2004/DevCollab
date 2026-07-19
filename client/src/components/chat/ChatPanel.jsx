import { useEffect, useRef, useState } from 'react';

const COLORS = [
  'text-indigo-300', 'text-emerald-300', 'text-rose-300',
  'text-amber-300', 'text-sky-300', 'text-violet-300',
];

function colorFor(username) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function formatTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function ChatPanel({ messages, currentUsername, onSend }) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSend(text);
    setDraft('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-3">
        {messages.length === 0 && (
          <p className="text-muted-foreground text-xs">No messages yet — say hi.</p>
        )}
        {messages.map((m) => {
          const isOwn = m.username === currentUsername;
          return (
            <div key={m._id ?? `${m.username}-${m.createdAt}`} className="text-sm">
              <div className="flex items-baseline gap-2">
                <span className={`font-medium ${isOwn ? 'text-foreground' : colorFor(m.username)}`}>
                  {isOwn ? 'You' : m.username}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{formatTime(m.createdAt)}</span>
              </div>
              <p className="text-foreground/80 break-words whitespace-pre-wrap">{m.text}</p>
            </div>
          );
        })}
      </div>
      <form onSubmit={handleSubmit} className="border-t border-border p-3 flex gap-2 shrink-0">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Message the room…"
          maxLength={2000}
          className="flex-1 min-w-0 bg-secondary border border-border rounded-lg px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          className="text-sm bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:hover:bg-primary text-primary-foreground px-3 py-1.5 rounded-lg transition-colors shrink-0"
        >
          Send
        </button>
      </form>
    </div>
  );
}
