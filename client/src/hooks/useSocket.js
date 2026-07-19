import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';

export function useSocket() {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // The JWT is an httpOnly cookie — withCredentials makes the browser
    // send it automatically on the handshake instead of the client reading
    // it. useSocket is only ever mounted under ProtectedRoute, so a
    // connection attempt here always implies the caller is (or was) logged
    // in; the server rejects the handshake if the cookie is missing/stale.
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
  }, []);

  return { socketRef, connected };
}
