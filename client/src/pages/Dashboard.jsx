import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { createRoom, listRooms } from '../api/rooms';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [rooms, setRooms] = useState([]);
  const [newRoomName, setNewRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  const copyLink = (roomId) => {
    navigator.clipboard.writeText(`${window.location.origin}/room/${roomId}`);
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

        {/* Create room form */}
        <form onSubmit={handleCreate} className="flex gap-3 mb-8">
          <input
            type="text"
            value={newRoomName}
            onChange={(e) => setNewRoomName(e.target.value)}
            placeholder="New room name…"
            className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={creating || !newRoomName.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
          >
            {creating ? 'Creating…' : 'Create Room'}
          </button>
        </form>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        {/* Rooms list */}
        {loading ? (
          <p className="text-gray-500">Loading rooms…</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-16 text-gray-600">
            <p className="text-lg">No rooms yet</p>
            <p className="text-sm mt-1">Create one above to get started</p>
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
                  <p className="text-xs text-gray-500 mt-0.5">
                    {room.members?.length ?? 1} member{room.members?.length !== 1 ? 's' : ''} ·{' '}
                    {new Date(room.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => copyLink(room._id)}
                    className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Copy link
                  </button>
                  <button
                    onClick={() => navigate(`/room/${room._id}`)}
                    className="text-xs bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Open
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
