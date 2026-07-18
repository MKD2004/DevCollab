import api from './auth';

export const getMessages = (roomId) => api.get(`/api/rooms/${roomId}/messages`);
