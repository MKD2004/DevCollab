import { useEffect, useRef, useState, useMemo, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './useAuth.jsx';

const SocketContext = createContext(null);

// One socket connection per logged-in session, alive for as long as `user`
// is set — not scoped to the Room page. This is what lets account-level
// events (e.g. join-request:created, pushed to a personal `user:<id>`
// socket room) reach the owner no matter which page they're currently on,
// instead of only while they happen to have a specific room open.
export function SocketProvider({ children }) {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      setConnected(false);
      return;
    }

    // The JWT is an httpOnly cookie; withCredentials makes the browser send
    // it automatically on the handshake instead of the client reading it.
    const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000', {
      withCredentials: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
    });

    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user]);

  const value = useMemo(() => ({ socketRef, connected }), [connected]);

  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

export function useSocket() {
  const ctx = useContext(SocketContext);
  if (!ctx) throw new Error('useSocket must be used within a SocketProvider');
  return ctx;
}
