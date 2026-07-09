import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, listRooms, joinByCode } from '../api/rooms';

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
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800">
        <span className="text-indigo-400 font-bold text-lg">DevCollab</span>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-400">
            <span className="text-white font-medium">{user?.username}</span>
          </span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-10">
        <h1 className="text-2xl font-semibold text-white mb-8">Your Rooms</h1>

        {/* Create + Join row */}
        <div className="flex gap-4 mb-8 flex-col sm:flex-row">
          {/* Create room */}
          <form onSubmit={handleCreate} className="flex gap-2 flex-1">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="New room name…"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
            />
            <button
              type="submit"
              disabled={creating || !newRoomName.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {creating ? 'Creating…' : 'Create Room'}
            </button>
          </form>

          {/* Divider */}
          <div className="hidden sm:flex items-center text-gray-700 font-medium text-sm">or</div>

          {/* Join by code */}
          <form onSubmit={handleJoin} className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Join code…"
              maxLength={6}
              className="w-36 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono tracking-widest uppercase"
            />
            <button
              type="submit"
              disabled={joining || joinCode.trim().length < 6}
              className="bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap"
            >
              {joining ? 'Joining…' : 'Join Room'}
            </button>
          </form>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
        {joinError && <p className="text-red-400 text-sm mb-3">{joinError}</p>}

        {/* Rooms list */}
        {loading ? (
          <p className="text-gray-500">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-lg">No rooms yet</p>
            <p className="text-sm mt-1">Create one or enter a join code above</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rooms.map((room) => (
              <li
                key={room._id}
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 flex items-center justify-between hover:border-gray-700 transition-colors"
              >
                <div>
                  <p className="font-medium text-white">{room.name}</p>
                  <div className="flex items-center gap-3 mt-1">
                    {/* Join code badge */}
                    <button
                      onClick={() => copyCode(room)}
                      title="Click to copy code"
                      className="font-mono text-xs tracking-widest bg-gray-800 hover:bg-gray-700 border border-gray-700 text-indigo-300 px-2 py-0.5 rounded transition-colors"
                    >
                      {copiedId === room._id ? 'Copied!' : room.joinCode}
                    </button>
                    <span className="text-xs text-gray-500">
                      {room.members?.length ?? 1} member{room.members?.length !== 1 ? 's' : ''} ·{' '}
                      {new Date(room.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate(`/room/${room._id}`)}
                  className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors"
                >
                  Open
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
