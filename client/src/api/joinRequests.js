import api from './auth';

export const requestToJoin = (roomId) => api.post(`/api/rooms/${roomId}/join-requests`);
export const listJoinRequests = (roomId) => api.get(`/api/rooms/${roomId}/join-requests`);
export const acceptJoinRequest = (roomId, requestId) =>
  api.post(`/api/rooms/${roomId}/join-requests/${requestId}/accept`);
export const declineJoinRequest = (roomId, requestId) =>
  api.post(`/api/rooms/${roomId}/join-requests/${requestId}/decline`);
