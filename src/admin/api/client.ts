import axios from 'axios';

const api = axios.create({
  baseURL: '/api/admin',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('adminToken');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export const adminApi = {
  login: (password: string) =>
    api.post('/login', { password }),

  // API Keys
  getApiKeys: () => api.get('/api-keys'),
  createApiKey: (name: string) => api.post('/api-keys', { name }),
  updateApiKey: (id: number, data: { active: boolean }) =>
    api.patch(`/api-keys/${id}`, data),

  // Tools
  getTools: () => api.get('/tools'),
  createTool: (data: any) => api.post('/tools', data),
  updateTool: (id: number, data: any) => api.patch(`/tools/${id}`, data),

  // API Key Tools
  getApiKeyTools: (apiKeyId: number) => api.get(`/api-keys/${apiKeyId}/tools`),
  assignTool: (apiKeyId: number, toolId: number) =>
    api.post(`/api-keys/${apiKeyId}/tools/${toolId}`),
  removeTool: (apiKeyId: number, toolId: number) =>
    api.delete(`/api-keys/${apiKeyId}/tools/${toolId}`),

  // Conversations
  getConversations: (params?: { apiKeyId?: number; startDate?: string; endDate?: string }) =>
    api.get('/conversations', { params }),
  getConversationDetail: (id: string) => api.get(`/conversations/${id}`),

  // Upstream Servers
  getUpstreamServers: () => api.get('/upstream-servers'),
  createUpstreamServer: (data: any) => api.post('/upstream-servers', data),
  updateUpstreamServer: (id: number, data: any) => api.patch(`/upstream-servers/${id}`, data),
  deleteUpstreamServer: (id: number) => api.delete(`/upstream-servers/${id}`),

  // Upstream Models
  getUpstreamModels: (serverId: number) => api.get(`/upstream-servers/${serverId}/models`),
  syncUpstreamModels: (serverId: number) => api.post(`/upstream-servers/${serverId}/sync-models`),
  updateUpstreamModel: (modelId: number, data: any) => api.patch(`/upstream-models/${modelId}`, data),
  getAvailableModels: () => api.get('/available-models'),

  // MCP Servers
  getMcpServers: () => api.get('/mcp-servers'),
  createMcpServer: (data: { name: string; command: string; description?: string; allowedDirectories?: string[]; environmentVariables?: Record<string, string> }) =>
    api.post('/mcp-servers', data),
  updateMcpServer: (id: number, data: any) => api.patch(`/mcp-servers/${id}`, data),
  deleteMcpServer: (id: number) => api.delete(`/mcp-servers/${id}`),
  discoverMcpTools: (id: number) => api.post(`/mcp-servers/${id}/discover-tools`),
  syncMcpTools: (id: number) => api.post(`/mcp-servers/${id}/sync-tools`),
  checkMcpAuth: (id: number) => api.post(`/mcp-servers/${id}/check-auth`),
  getMcpAuthUrl: (id: number) => api.post(`/mcp-servers/${id}/get-auth-url`),
};