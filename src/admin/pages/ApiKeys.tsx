import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Flex, Text, Button, TextField, Switch, Table } from '@radix-ui/themes';
import { Plus, Key, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

const ApiKeys: React.FC = () => {
  const [newKeyName, setNewKeyName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const queryClient = useQueryClient();

  const { data: apiKeys, isLoading } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => adminApi.getApiKeys().then((res) => res.data),
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
                          {apiKey.key.substring(0, 12)}...{apiKey.key.substring(apiKey.key.length - 4)}
                        </Text>
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
                      <Button size="1" variant="ghost" className="manage-button">
                        <span className="button-text">Manage Tools</span>
                      </Button>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>
        </Card>
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
          
          .key-column,
          .date-column,
          .actions-column {
            display: none;
          }
          
          .key-cell,
          .date-cell,
          .actions-cell {
            display: none;
          }
          
          .api-key-row {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 12px;
            padding: 16px;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
            border-radius: 8px;
            margin-bottom: 8px;
          }
          
          .table-header {
            display: none;
          }
          
          .api-keys-table-card {
            padding: 0;
            background-color: transparent !important;
            border: none !important;
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