import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Flex, Text, Button, TextField, Switch, Table, Dialog, Badge } from '@radix-ui/themes';
import { Plus, Key, Copy, Settings, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

interface ApiKey {
  id: number;
  name: string;
  key: string;
  active: boolean;
  createdAt: string;
}

const ApiKeys: React.FC = () => {
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showToolsDialog, setShowToolsDialog] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<ApiKey | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<number>>(new Set());
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => adminApi.getApiKeys().then((res) => res.data),
  });

  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: () => adminApi.getTools().then((res) => res.data),
    enabled: showToolsDialog,
  });

  const { data: apiKeyTools } = useQuery({
    queryKey: ['apiKeyTools', selectedApiKey?.id],
    queryFn: () => selectedApiKey ? adminApi.getApiKeyTools(selectedApiKey.id).then((res) => res.data) : [],
    enabled: showToolsDialog && !!selectedApiKey,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => adminApi.createApiKey(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast.success('API key created successfully');
      setNewKeyName('');
      setShowCreateForm(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create API key');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      adminApi.updateApiKey(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast.success('API key updated successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update API key');
    },
  });

  const assignToolMutation = useMutation({
    mutationFn: ({ apiKeyId, toolId }: { apiKeyId: number; toolId: number }) =>
      adminApi.assignTool(apiKeyId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeyTools', selectedApiKey?.id] });
      toast.success('Tool assigned successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to assign tool');
    },
  });

  const removeToolMutation = useMutation({
    mutationFn: ({ apiKeyId, toolId }: { apiKeyId: number; toolId: number }) =>
      adminApi.removeTool(apiKeyId, toolId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeyTools', selectedApiKey?.id] });
      toast.success('Tool removed successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove tool');
    },
  });

  const copyToClipboard = (text: string) => {
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } else {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      toast.success('Copied to clipboard');
    }
  };

  const formatApiKey = (key: string, isVisible: boolean = false) => {
    if (isVisible) {
      return key;
    }
    
    if (key.length <= 8) {
      // For short keys like "anonymous", show partial
      return key.length <= 4 ? key : `${key.substring(0, 2)}...${key.substring(key.length - 2)}`;
    }
    
    // For longer keys, show more characters
    return `${key.substring(0, 8)}...${key.substring(key.length - 4)}`;
  };

  const toggleKeyVisibility = (apiKeyId: number) => {
    const newVisibleKeys = new Set(visibleKeys);
    if (newVisibleKeys.has(apiKeyId)) {
      newVisibleKeys.delete(apiKeyId);
    } else {
      newVisibleKeys.add(apiKeyId);
    }
    setVisibleKeys(newVisibleKeys);
  };

  const openToolsDialog = (apiKey: ApiKey) => {
    setSelectedApiKey(apiKey);
    setShowToolsDialog(true);
  };

  const closeToolsDialog = () => {
    setShowToolsDialog(false);
    setSelectedApiKey(null);
  };

  const isToolAssigned = (toolId: number) => {
    return apiKeyTools?.some((apiKeyTool: any) => apiKeyTool.toolId === toolId && apiKeyTool.enabled);
  };

  const toggleTool = (toolId: number) => {
    if (!selectedApiKey) return;

    if (isToolAssigned(toolId)) {
      removeToolMutation.mutate({ apiKeyId: selectedApiKey.id, toolId });
    } else {
      assignToolMutation.mutate({ apiKeyId: selectedApiKey.id, toolId });
    }
  };

  if (isLoading) {
    return (
      <Box p="6">
        <div className="flex-center" style={{ height: '200px' }}>
          <div className="spinner" />
        </div>
      </Box>
    );
  }

  return (
    <Box className="api-keys-container">
      <Flex direction="column" gap="6">
        <Flex justify="between" className="api-keys-header">
          <Flex direction="column" gap="1">
            <Text size="6" weight="bold">
              API Keys
            </Text>
            <Text size="3" style={{ color: '#9ca3af' }}>
              Manage API keys for accessing the proxy
            </Text>
          </Flex>
          <Button onClick={() => setShowCreateForm(true)} className="create-button">
            <Plus size={16} />
            <span className="button-text">Create API Key</span>
          </Button>
        </Flex>

        {showCreateForm && (
          <Card style={{ padding: '24px' }}>
            <Flex direction="column" gap="4">
              <Text size="4" weight="bold">
                Create New API Key
              </Text>
              <TextField.Root>
                <TextField.Input 
                  placeholder="Enter a name for this API key" 
                  value={newKeyName}
                  onChange={(e) => setNewKeyName((e.target as HTMLInputElement).value)}
                />
              </TextField.Root>
              <Flex gap="2">
                <Button
                  onClick={() => createMutation.mutate(newKeyName)}
                  disabled={!newKeyName || createMutation.isPending}
                >
                  Create
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewKeyName('');
                  }}
                >
                  Cancel
                </Button>
              </Flex>
            </Flex>
          </Card>
        )}

        <Card className="api-keys-table-card">
          <div className="table-container">
            <Table.Root>
              <Table.Header className="table-header">
                <Table.Row>
                  <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="key-column">API Key</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="status-column">Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="date-column">Created</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="actions-column">Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {apiKeys?.map((apiKey: any) => (
                  <Table.Row key={apiKey.id} className="api-key-row">
                    <Table.Cell>
                      <Text weight="medium">{apiKey.name}</Text>
                    </Table.Cell>
                    <Table.Cell className="key-cell">
                      <Flex align="center" gap="2">
                        <Text size="2" style={{ fontFamily: 'monospace' }} className="key-text">
                          {formatApiKey(apiKey.key, visibleKeys.has(apiKey.id))}
                        </Text>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => toggleKeyVisibility(apiKey.id)}
                          className="visibility-button"
                        >
                          {visibleKeys.has(apiKey.id) ? <EyeOff size={12} /> : <Eye size={12} />}
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => copyToClipboard(apiKey.key)}
                          className="copy-button"
                        >
                          <Copy size={12} />
                        </Button>
                      </Flex>
                    </Table.Cell>
                    <Table.Cell className="status-cell">
                      <Switch
                        checked={apiKey.active}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ id: apiKey.id, active: checked })
                        }
                      />
                    </Table.Cell>
                    <Table.Cell className="date-cell">
                      <Text size="2" color="gray">
                        {new Date(apiKey.createdAt).toLocaleDateString()}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="actions-cell">
                      <Button 
                        size="1" 
                        variant="ghost" 
                        className="manage-button"
                        onClick={() => openToolsDialog(apiKey)}
                      >
                        <Settings size={14} />
                        <span className="button-text">Manage Tools</span>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </Card>

        <Dialog.Root open={showToolsDialog} onOpenChange={setShowToolsDialog}>
          <Dialog.Content style={{ maxWidth: 600 }}>
            <Dialog.Title>Manage Tools for {selectedApiKey?.name}</Dialog.Title>
            <Dialog.Description>
              Enable or disable tools for this API key
            </Dialog.Description>
            
            <Box mt="4">
              {tools?.map((tool: any) => {
                const assigned = isToolAssigned(tool.id);
                const assignedTool = apiKeyTools?.find((at: any) => at.toolId === tool.id);
                
                return (
                  <Card key={tool.id} mb="2" style={{ padding: '12px' }}>
                    <Flex justify="between" align="center">
                      <Flex direction="column" gap="1">
                        <Flex align="center" gap="2">
                          <Text weight="bold" size="3">{tool.name}</Text>
                          <Badge size="1" variant="outline">
                            {tool.sourceType === 'mcp' ? 'MCP' : 'Built-in'}
                          </Badge>
                          {assigned && (
                            <Badge size="1" color="green">
                              Enabled
                            </Badge>
                          )}
                        </Flex>
                        <Text size="2" color="gray">
                          {tool.description}
                        </Text>
                      </Flex>
                      <Switch
                        checked={assigned}
                        onCheckedChange={() => toggleTool(tool.id)}
                        disabled={assignToolMutation.isPending || removeToolMutation.isPending}
                      />
                    </Flex>
                  </Card>
                );
              })}
              
              {(!tools || tools.length === 0) && (
                <Text size="2" color="gray" style={{ textAlign: 'center', display: 'block', padding: '20px' }}>
                  No tools available. Create tools or add MCP servers first.
                </Text>
              )}
            </Box>

            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft">
                  Close
                </Button>
              </Dialog.Close>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
      
      <style>{`
        .api-keys-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
        .api-keys-table-card {
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        @media (max-width: 768px) {
          .api-keys-container {
            padding: 16px;
            padding-bottom: 120px;
          }
          
          .api-keys-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          
          .create-button .button-text {
            display: none;
          }
          
          /* Hide table headers on mobile */
          .table-header {
            display: none;
          }
          
          /* Convert table rows to card layout */
          .api-key-row {
            display: block !important;
            padding: 16px !important;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 8px;
            margin-bottom: 12px;
          }
          
          /* Stack table cells vertically */
          .api-key-row > * {
            display: block !important;
            margin-bottom: 8px;
            border: none !important;
            padding: 0 !important;
          }
          
          .api-key-row > *:last-child {
            margin-bottom: 0;
          }
          
          /* Add labels for mobile */
          .key-cell::before {
            content: "API Key: ";
            font-weight: bold;
            color: #9ca3af;
            font-size: 12px;
            display: block;
            margin-bottom: 4px;
          }
          
          .status-cell::before {
            content: "Status: ";
            font-weight: bold;
            color: #9ca3af;
            font-size: 12px;
            display: inline-block;
            margin-right: 8px;
          }
          
          .date-cell::before {
            content: "Created: ";
            font-weight: bold;
            color: #9ca3af;
            font-size: 12px;
            display: inline-block;
            margin-right: 8px;
          }
          
          .actions-cell::before {
            content: "Actions: ";
            font-weight: bold;
            color: #9ca3af;
            font-size: 12px;
            display: block;
            margin-bottom: 4px;
          }
          
          /* Status and actions on same line for mobile */
          .status-cell {
            display: inline-block !important;
            margin-right: 16px;
          }
          
          .api-keys-table-card {
            padding: 0;
            background-color: transparent !important;
            border: none !important;
          }
          
          /* Key text responsive */
          .key-text {
            font-size: 12px !important;
            word-break: break-all;
          }
          
          /* Mobile button adjustments */
          .visibility-button,
          .copy-button {
            padding: 6px !important;
            min-width: 32px;
          }
          
          .manage-button .button-text {
            display: inline !important;
          }
        }
        
        @media (max-width: 480px) {
          .api-keys-container {
            padding: 12px;
          }
          
          .key-text {
            font-size: 11px;
          }
          
          .copy-button {
            padding: 4px;
          }
          
          .manage-button .button-text {
            display: none;
          }
        }
      `}</style>
    </Box>
  );
};

export default ApiKeys;