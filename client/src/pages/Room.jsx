import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useSocket } from '../hooks/useSocket.js';
import { getRoom } from '../api/rooms';
import MonacoEditor from '../components/editor/MonacoEditor';
import PresenceList from '../components/presence/PresenceList';

export default function Room() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { socketRef, connected } = useSocket();

  const [room, setRoom] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [presenceUsers, setPresenceUsers] = useState([]);

  // Fetch room metadata (auto-joins if not a member)
  useEffect(() => {
    getRoom(roomId)
      .then((res) => setRoom(res.data.room))
      .catch((err) => {
        const status = err.response?.status;
        setLoadError(status === 404 ? 'Room not found.' : 'Failed to load room.');
      });
  }, [roomId]);

  // Join socket room and listen for presence updates
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !connected) return;

    socket.emit('room:join', roomId);

    socket.on('presence:update', (data) => {
      if (data.roomId === roomId) setPresenceUsers(data.users);
    });

    return () => {
      socket.off('presence:update');
    };
  }, [socketRef, connected, roomId]);

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        <div className="text-center">
          <p className="text-gray-400 mb-4">{loadError}</p>
          <button onClick={() => navigate('/')} className="text-indigo-400 hover:underline">
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-white">
      {/* Navbar */}
      <header className="flex items-center justify-between px-6 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ← Rooms
          </button>
          <span className="text-gray-600">/</span>
          <span className="text-white font-medium">{room?.name ?? '…'}</span>
        </div>
        <div className="flex items-center gap-4">
          <span
            className={`flex items-center gap-1.5 text-xs ${connected ? 'text-emerald-400' : 'text-gray-500'}`}
          >
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-600'}`} />
            {connected ? 'Connected' : 'Connecting…'}
          </span>
          <span className="text-sm text-gray-400 font-medium">{user?.username}</span>
          <button
            onClick={logout}
            className="text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <MonacoEditor />
        </div>

        {/* Sidebar — presence */}
        <aside className="w-52 shrink-0 bg-gray-900 border-l border-gray-800 flex flex-col">
          <div className="px-4 py-3 border-b border-gray-800">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              In this room
            </h2>
          </div>
          <PresenceList users={presenceUsers} />
        </aside>
      </div>
    </div>
  );
}
