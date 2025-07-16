import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Flex, Text, Button, TextField, TextArea, Switch, Table, Badge } from '@radix-ui/themes';
import { Plus, Server, RotateCw, Edit, Trash2, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

const UpstreamServers: React.FC = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingServer, setEditingServer] = useState<any>(null);
  const [newServer, setNewServer] = useState({
    name: '',
    baseUrl: '',
    apiKey: '',
    description: '',
  });
  const [selectedServer, setSelectedServer] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: servers, isLoading } = useQuery({
    queryKey: ['upstreamServers'],
    queryFn: () => adminApi.getUpstreamServers().then((res) => res.data),
  });

  const { data: models } = useQuery({
    queryKey: ['upstreamModels', selectedServer],
    queryFn: () => adminApi.getUpstreamModels(selectedServer!).then((res) => res.data),
    enabled: !!selectedServer,
  });

  const createMutation = useMutation({
    mutationFn: (server: any) => adminApi.createUpstreamServer(server),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upstreamServers'] });
      toast.success('Upstream server created successfully');
      setNewServer({ name: '', baseUrl: '', apiKey: '', description: '' });
      setShowCreateForm(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create upstream server');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & any) => adminApi.updateUpstreamServer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upstreamServers'] });
      toast.success('Upstream server updated successfully');
      setEditingServer(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update upstream server');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteUpstreamServer(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['upstreamServers'] });
      toast.success('Upstream server deleted successfully');
      if (selectedServer === id) {
        setSelectedServer(null);
      }
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete upstream server');
    },
  });

  const syncModelsMutation = useMutation({
    mutationFn: (serverId: number) => adminApi.syncUpstreamModels(serverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upstreamModels'] });
      toast.success('Models synced successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to sync models');
    },
  });

  const updateModelMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number } & any) => adminApi.updateUpstreamModel(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upstreamModels'] });
      toast.success('Model updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update model');
    },
  });

  if (isLoading) {
    return (
      <Box className="upstream-servers-container">
        <div className="flex-center" style={{ height: '200px' }}>
          <div className="spinner" />
        </div>
      </Box>
    );
  }

  const handleCreateServer = () => {
    if (!newServer.name || !newServer.baseUrl) {
      toast.error('Name and Base URL are required');
      return;
    }
    createMutation.mutate(newServer);
  };

  const handleSyncModels = (serverId: number) => {
    syncModelsMutation.mutate(serverId);
  };

  const handleToggleModel = (modelId: number, enabled: boolean) => {
    updateModelMutation.mutate({ id: modelId, enabled });
  };

  return (
    <Box className="upstream-servers-container">
      <Flex direction="column" gap="6">
        <Flex justify="between" className="servers-header">
          <Flex direction="column" gap="1">
            <Text size="6" weight="bold">
              Upstream Servers
            </Text>
            <Text size="3" style={{ color: '#9ca3af' }}>
              Configure OpenAI-compatible upstream servers and manage available models
            </Text>
          </Flex>
          <Button onClick={() => setShowCreateForm(true)} className="create-button">
            <Plus size={16} />
            <span className="button-text">Add Server</span>
          </Button>
        </Flex>

        {showCreateForm && (
          <Card className="create-form-card">
            <Flex direction="column" gap="4">
              <Text size="4" weight="bold">
                Add New Upstream Server
              </Text>
              
              <div className="form-grid">
                <Box>
                  <Text size="2" weight="medium" mb="2">
                    Server Name *
                  </Text>
                  <TextField.Root>
                    <TextField.Input 
                      placeholder="e.g., OpenAI, Anthropic, Local LLaMA" 
                      value={newServer.name}
                      onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                    />
                  </TextField.Root>
                </Box>
                
                <Box>
                  <Text size="2" weight="medium" mb="2">
                    Base URL *
                  </Text>
                  <TextField.Root>
                    <TextField.Input 
                      placeholder="https://api.openai.com" 
                      value={newServer.baseUrl}
                      onChange={(e) => setNewServer({ ...newServer, baseUrl: e.target.value })}
                    />
                  </TextField.Root>
                </Box>
                
                <Box>
                  <Text size="2" weight="medium" mb="2">
                    API Key (optional)
                  </Text>
                  <TextField.Root>
                    <TextField.Input 
                      placeholder="Bearer token for authentication" 
                      type="password"
                      value={newServer.apiKey}
                      onChange={(e) => setNewServer({ ...newServer, apiKey: e.target.value })}
                    />
                  </TextField.Root>
                </Box>
                
                <Box>
                  <Text size="2" weight="medium" mb="2">
                    Description (optional)
                  </Text>
                  <TextArea
                    placeholder="Notes about this server..."
                    value={newServer.description}
                    onChange={(e) => setNewServer({ ...newServer, description: e.target.value })}
                    className="description-area"
                  />
                </Box>
              </div>
              
              <Flex gap="2" className="form-actions">
                <Button
                  onClick={handleCreateServer}
                  disabled={!newServer.name || !newServer.baseUrl || createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewServer({ name: '', baseUrl: '', apiKey: '', description: '' });
                  }}
                >
                  Cancel
                </Button>
              </Flex>
            </Flex>
          </Card>
        )}

        <div className="servers-grid">
          <Card className="servers-list-card">
            <Flex direction="column" gap="4">
              <Text size="4" weight="bold">
                Configured Servers
              </Text>
              
              {servers?.length === 0 ? (
                <Flex direction="column" align="center" gap="3" py="6">
                  <Server size={48} color="#6b7280" />
                  <Text size="3" color="gray">No upstream servers configured</Text>
                  <Text size="2" color="gray">Add your first server to start proxying requests</Text>
                </Flex>
              ) : (
                <div className="servers-list">
                  {servers?.map((server: any) => (
                    <Card 
                      key={server.id} 
                      className={`server-item ${selectedServer === server.id ? 'selected' : ''}`}
                      onClick={() => setSelectedServer(server.id)}
                    >
                      <Flex direction="column" gap="2">
                        <Flex align="center" justify="between">
                          <Flex align="center" gap="2">
                            <Server size={16} color={server.active ? "#10b981" : "#6b7280"} />
                            <Text weight="medium">{server.name}</Text>
                          </Flex>
                          <Flex gap="1">
                            {server.hasApiKey && <Badge color="blue" size="1">API Key</Badge>}
                            <Badge color={server.active ? "green" : "gray"} size="1">
                              {server.active ? "Active" : "Inactive"}
                            </Badge>
                          </Flex>
                        </Flex>
                        
                        <Text size="2" style={{ color: '#9ca3af' }}>{server.baseUrl}</Text>
                        
                        {server.description && (
                          <Text size="2" style={{ color: '#d1d5db', marginTop: '4px' }}>
                            {server.description}
                          </Text>
                        )}
                        
                        <Flex gap="2" mt="2">
                          <Button
                            size="1"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSyncModels(server.id);
                            }}
                            disabled={syncModelsMutation.isPending}
                          >
                            <RotateCw size={12} />
                            <span className="button-text">Sync Models</span>
                          </Button>
                          <Button
                            size="1"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              updateMutation.mutate({ id: server.id, active: !server.active });
                            }}
                          >
                            {server.active ? <EyeOff size={12} /> : <Eye size={12} />}
                            <span className="button-text">{server.active ? 'Disable' : 'Enable'}</span>
                          </Button>
                          <Button
                            size="1"
                            variant="ghost"
                            color="red"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this server?')) {
                                deleteMutation.mutate(server.id);
                              }
                            }}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </Flex>
                      </Flex>
                    </Card>
                  ))}
                </div>
              )}
            </Flex>
          </Card>

          {selectedServer && (
            <Card className="models-card">
              <Flex direction="column" gap="4">
                <Flex align="center" justify="between">
                  <Text size="4" weight="bold">
                    Available Models
                  </Text>
                  <Button
                    size="2"
                    variant="ghost"
                    onClick={() => handleSyncModels(selectedServer)}
                    disabled={syncModelsMutation.isPending}
                  >
                    <RotateCw size={16} />
                    {syncModelsMutation.isPending ? 'Syncing...' : 'Sync Models'}
                  </Button>
                </Flex>
                
                {models?.length === 0 ? (
                  <Flex direction="column" align="center" gap="3" py="6">
                    <Text size="3" color="gray">No models found</Text>
                    <Text size="2" color="gray">Click "Sync Models" to fetch available models</Text>
                  </Flex>
                ) : (
                  <div className="models-list">
                    {models?.map((model: any) => (
                      <Flex 
                        key={model.id} 
                        align="center" 
                        justify="between" 
                        p="3"
                        className="model-item"
                      >
                        <Flex direction="column" gap="1">
                          <Text size="2" weight="medium">{model.displayName}</Text>
                          <Text size="1" color="gray">{model.modelId}</Text>
                        </Flex>
                        
                        <Switch
                          checked={model.enabled}
                          onCheckedChange={(checked) => handleToggleModel(model.id, checked)}
                        />
                      </Flex>
                    ))}
                  </div>
                )}
              </Flex>
            </Card>
          )}
        </div>
      </Flex>
      
      <style>{`
        .upstream-servers-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .create-form-card {
          padding: 24px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }
        
        .form-grid {
          display: grid;
          gap: 16px;
        }
        
        .servers-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 24px;
        }
        
        .servers-list-card,
        .models-card {
          padding: 24px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.15) !important;
        }
        
        .servers-list {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .server-item {
          padding: 16px !important;
          background-color: #141414 !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .server-item:hover {
          border-color: rgba(59, 130, 246, 0.3) !important;
          background-color: rgba(59, 130, 246, 0.05) !important;
        }
        
        .server-item.selected {
          border-color: #3b82f6 !important;
          background-color: rgba(59, 130, 246, 0.1) !important;
        }
        
        .models-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: calc(100vh - 300px);
          overflow-y: auto;
        }
        
        .model-item {
          background-color: #141414;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
        }
        
        @media (max-width: 1024px) {
          .servers-grid {
            grid-template-columns: 1fr;
          }
        }
        
        @media (max-width: 768px) {
          .upstream-servers-container {
            padding: 16px;
            padding-bottom: 120px;
          }
          
          .servers-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          
          .create-button .button-text {
            display: none;
          }
          
          .create-form-card {
            padding: 16px;
            background-color: #141414 !important;
          }
          
          .servers-list-card,
          .models-card {
            padding: 16px;
          }
          
          .server-item .button-text {
            display: inline !important;
          }
        }
        
        @media (max-width: 480px) {
          .upstream-servers-container {
            padding: 12px;
          }
          
          .create-form-card {
            padding: 12px;
          }
          
          .form-actions {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </Box>
  );
};

export default UpstreamServers;