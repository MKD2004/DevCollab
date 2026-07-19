import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, listRooms, joinByCode } from '../api/rooms';
import { Button } from '../components/ui/button';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [joinError, setJoinError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    listRooms()
      .then((res) => setRooms(res.data.rooms))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    setCreating(true);
    setError('');
    try {
      const res = await createRoom(newRoomName.trim());
      const room = res.data.room;
      setRooms((prev) => [room, ...prev]);
      setNewRoomName('');
      navigate(`/room/${room._id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create room');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const res = await joinByCode(joinCode.trim());
      navigate(`/room/${res.data.room._id}`);
    } catch (err) {
      setJoinError(err.response?.data?.message || 'Invalid code');
    } finally {
      setJoining(false);
    }
  };

  const copyCode = (room) => {
    navigator.clipboard.writeText(room.joinCode);
    setCopiedId(room._id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-card border-b border-border">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="relative w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center overflow-hidden">
            <span className="font-mono text-primary font-bold text-sm">D</span>
          </div>
          <span className="font-bold tracking-tight">DevCollab</span>
        </Link>
        <div className="flex items-center gap-4">
          <span className="text-sm text-muted-foreground">
            <span className="text-foreground font-medium">{user?.username}</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground border border-border hover:border-foreground/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">
        <h1
          className="text-2xl font-semibold mb-8"
          style={{ fontFamily: 'var(--font-geist-pixel-line), monospace' }}
        >
          Your Rooms
        </h1>

        {/* Create + Join row */}
        <div className="flex gap-4 mb-8 flex-col sm:flex-row">
          {/* Create room */}
          <form onSubmit={handleCreate} className="flex gap-2 flex-1">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="New room name…"
              className="flex-1 bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring text-sm"
            />
            <Button
              type="submit"
              disabled={creating || !newRoomName.trim()}
              className="bg-foreground hover:bg-foreground/90 text-background text-sm font-medium h-auto px-4 py-2.5 rounded-lg whitespace-nowrap"
            >
              {creating ? 'Creating…' : 'Create Room'}
            </Button>
          </form>

          {/* Divider */}
          <div className="hidden sm:flex items-center text-muted-foreground/40 font-medium text-sm">or</div>

          {/* Join by code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Join code…"
              maxLength={6}
              className="w-36 bg-secondary/50 border border-border rounded-lg px-4 py-2.5 text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring text-sm font-mono tracking-widest uppercase"
            />
            <Button
              type="submit"
              variant="outline"
              disabled={joining || joinCode.trim().length < 6}
              className="text-sm font-medium h-auto px-4 py-2.5 rounded-lg whitespace-nowrap border-border hover:bg-secondary/50 bg-transparent"
            >
              {joining ? 'Joining…' : 'Join Room'}
            </Button>
          </form>
        </div>

        {error && <p className="text-destructive text-sm mb-3">{error}</p>}
        {joinError && <p className="text-destructive text-sm mb-3">{joinError}</p>}

        {/* Rooms list */}
        {loading ? (
          <p className="text-muted-foreground">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground/60">
            <p className="text-lg">No rooms yet</p>
            <p className="text-sm mt-1">Create one or enter a join code above</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li
                key={room._id}
                className="bg-card border border-border rounded-xl px-5 py-4 flex items-center justify-between hover:border-primary/50 card-shadow transition-colors"
              >
                <div>
                  <p className="font-medium text-foreground">{room.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {/* Join code badge */}
                    <button
                      onClick={() => copyCode(room)}
                      title="Click to copy code"
                      className="font-mono text-xs tracking-widest bg-secondary hover:bg-secondary/70 border border-border text-primary px-2 py-0.5 rounded transition-colors"
                    >
                      {copiedId === room._id ? 'Copied!' : room.joinCode}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {room.members?.length ?? 1} member{room.members?.length !== 1 ? 's' : ''} ·{' '}
                      {new Date(room.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <Button
                  onClick={() => navigate(`/room/${room._id}`)}
                  className="text-xs bg-foreground hover:bg-foreground/90 text-background h-auto px-4 py-2 rounded-lg"
                >
                  Open
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
