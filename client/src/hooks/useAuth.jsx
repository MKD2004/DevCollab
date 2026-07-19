import { useState, useEffect, createContext, useContext } from 'react';
import { getMe, logout as logoutApi } from '../api/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // The auth token is an httpOnly cookie, invisible to JS, so there's no
  // client-readable flag to check before asking the server — /me either
  // succeeds (cookie was valid) or 401s (no/expired cookie).
  useEffect(() => {
    getMe()
      .then((res) => setUser(res.data.user))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = (userData) => {
    setUser(userData);
  };

  const logout = () => {
    logoutApi()
      .catch(() => {})
      .finally(() => setUser(null));
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
