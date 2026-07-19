import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000',
  // The JWT lives in an httpOnly cookie set by the server — this makes the
  // browser send it automatically instead of the app reading/attaching it.
  withCredentials: true,
});

// The CSRF cookie itself is unreadable from here once frontend and API are
// on different domains — document.cookie only ever exposes cookies for the
// current page's own origin, never a cross-domain API's (this "worked" in
// local dev only because localhost:5173 and localhost:5000 share a
// hostname). The server hands the value back in the response body instead
// (register/login/me — see auth.routes.js), which this module holds onto
// and echoes as a header on every mutating request, proving the request
// came from this app and not a cross-site forgery.
let csrfToken = null;

api.interceptors.request.use((config) => {
  if (csrfToken) config.headers['X-CSRF-Token'] = csrfToken;
  return config;
});

api.interceptors.response.use((res) => {
  if (res.data?.csrfToken) csrfToken = res.data.csrfToken;
  return res;
});

export const register = (data) => api.post('/api/auth/register', data);
export const login = (data) => api.post('/api/auth/login', data);
export const logout = () => api.post('/api/auth/logout');
export const getMe = () => api.get('/api/auth/me');

export default api;
