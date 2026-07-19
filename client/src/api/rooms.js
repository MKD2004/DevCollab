import api from './auth';

export const createRoom = (name) => api.post('/api/rooms', { name });
export const listRooms = () => api.get('/api/rooms');
export const getRoom = (id) => api.get(`/api/rooms/${id}`);
export const previewRoom = (id) => api.get(`/api/rooms/${id}/preview`);
export const joinByCode = (code) => api.get(`/api/rooms/join/${code.toUpperCase()}`);
