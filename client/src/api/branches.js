import api from './auth';

export const listBranches = (roomId) => api.get(`/api/rooms/${roomId}/branches`);
export const createBranch = (roomId, { name, fromBranchId }) =>
  api.post(`/api/rooms/${roomId}/branches`, { name, fromBranchId });
export const renameBranch = (roomId, branchId, name) =>
  api.patch(`/api/rooms/${roomId}/branches/${branchId}`, { name });
