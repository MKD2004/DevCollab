import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  // The JWT lives in an httpOnly cookie set by the server — this makes the
  // browser send it automatically instead of the app reading/attaching it.
  withCredentials: true,
});

// csrfToken is a deliberately non-httpOnly cookie (see server/src/config/
// authCookies.js) — readable here so it can be echoed back as a header,
// proving the request came from this app and not a cross-site forgery.
function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

api.interceptors.request.use((config) => {
  const csrfToken = readCookie('csrfToken');
  if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  return config;
});

export const register = (data) => api.post('/api/auth/register', data);
export const login = (data) => api.post('/api/auth/login', data);
export const logout = () => api.post('/api/auth/logout');
export const getMe = () => api.get('/api/auth/me');

export default api;
