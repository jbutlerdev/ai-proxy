import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Flex, Text, Button, TextField, Switch, Table, Dialog, TextArea, Badge } from '@radix-ui/themes';
import { Plus, Server, Edit2, Trash2, RefreshCw, Eye } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

interface McpServer {
  id: number;
  name: string;
  command: string;
  description: string | null;
  allowedDirectories: string[] | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const McpServers: React.FC = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingServer, setEditingServer] = useState<McpServer | null>(null);
  const [showDiscoveredTools, setShowDiscoveredTools] = useState(false);
  const [discoveredTools, setDiscoveredTools] = useState<any[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    command: '',
    description: '',
    allowedDirectories: '',
  });

  const { data: servers, isLoading } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => adminApi.getMcpServers().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; command: string; description?: string; allowedDirectories?: string[] }) =>
      adminApi.createMcpServer(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      toast.success('MCP server created successfully');
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create MCP server');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: any }) =>
      adminApi.updateMcpServer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      toast.success('MCP server updated successfully');
      setShowEditForm(false);
      setEditingServer(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update MCP server');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => adminApi.deleteMcpServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcpServers'] });
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('MCP server deleted successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to delete MCP server');
    },
  });

  const syncMutation = useMutation({
    mutationFn: (id: number) => adminApi.syncMcpTools(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('Tools synced successfully');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to sync tools');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      command: '',
      description: '',
      allowedDirectories: '',
    });
    setShowCreateForm(false);
  };

  const handleCreate = () => {
    const directories = formData.allowedDirectories
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);

    createMutation.mutate({
      name: formData.name,
      command: formData.command,
      description: formData.description || undefined,
      allowedDirectories: directories.length > 0 ? directories : undefined,
    });
  };

  const handleEdit = (server: McpServer) => {
    setEditingServer(server);
    setFormData({
      name: server.name,
      command: server.command,
      description: server.description || '',
      allowedDirectories: server.allowedDirectories?.join(', ') || '',
    });
    setShowEditForm(true);
  };

  const handleUpdate = () => {
    if (!editingServer) return;

    const directories = formData.allowedDirectories
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d);

    updateMutation.mutate({
      id: editingServer.id,
      name: formData.name,
      command: formData.command,
      description: formData.description || null,
      allowedDirectories: directories.length > 0 ? directories : null,
    });
  };

  const handleDiscover = async (server: McpServer) => {
    setDiscovering(true);
    try {
      const response = await adminApi.discoverMcpTools(server.id);
      setDiscoveredTools(response.data);
      setShowDiscoveredTools(true);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to discover tools');
    } finally {
      setDiscovering(false);
    }
  };

  if (isLoading) {
    return (
      <Box className="mcp-servers-container">
        <div className="flex-center" style={{ height: '200px' }}>
          <div className="spinner" />
        </div>
      </Box>
    );
  }

  return (
    <Box className="mcp-servers-container">
      <Flex direction="column" gap="6">
        <Flex justify="between" className="mcp-servers-header">
          <Flex direction="column" gap="1">
            <Text size="6" weight="bold">
              MCP Servers
            </Text>
            <Text size="3" style={{ color: '#9ca3af' }}>
              Manage Model Context Protocol servers and their tools
            </Text>
          </Flex>
          <Button onClick={() => setShowCreateForm(true)} className="create-button">
            <Plus size={16} />
            <span className="button-text">Add MCP Server</span>
          </Button>
        </Flex>

        <Dialog.Root open={showCreateForm} onOpenChange={setShowCreateForm}>
          <Dialog.Content style={{ maxWidth: 500 }}>
            <Dialog.Title>Add MCP Server</Dialog.Title>
            <Dialog.Description>
              Configure a new Model Context Protocol server to provide tools
            </Dialog.Description>
            <Flex direction="column" gap="4" mt="4">
              <div>
                <Text size="2" mb="1">Name</Text>
                <TextField.Root>
                  <TextField.Input
                    placeholder="e.g., Filesystem Server"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </TextField.Root>
              </div>
              <div>
                <Text size="2" mb="1">Command</Text>
                <TextField.Root>
                  <TextField.Input
                    placeholder="e.g., npx @modelcontextprotocol/server-filesystem /tmp"
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  />
                </TextField.Root>
              </div>
              <div>
                <Text size="2" mb="1">Description (optional)</Text>
                <TextArea
                  placeholder="Describe what this server does"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Text size="2" mb="1">Allowed Directories (comma-separated, optional)</Text>
                <TextField.Root>
                  <TextField.Input
                    placeholder="e.g., /tmp, /home/user/documents"
                    value={formData.allowedDirectories}
                    onChange={(e) => setFormData({ ...formData, allowedDirectories: e.target.value })}
                  />
                </TextField.Root>
              </div>
            </Flex>
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleCreate}
                disabled={!formData.name || !formData.command || createMutation.isPending}
              >
                Create Server
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={showEditForm} onOpenChange={setShowEditForm}>
          <Dialog.Content style={{ maxWidth: 500 }}>
            <Dialog.Title>Edit MCP Server</Dialog.Title>
            <Flex direction="column" gap="4" mt="4">
              <div>
                <Text size="2" mb="1">Name</Text>
                <TextField.Root>
                  <TextField.Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </TextField.Root>
              </div>
              <div>
                <Text size="2" mb="1">Command</Text>
                <TextField.Root>
                  <TextField.Input
                    value={formData.command}
                    onChange={(e) => setFormData({ ...formData, command: e.target.value })}
                  />
                </TextField.Root>
              </div>
              <div>
                <Text size="2" mb="1">Description</Text>
                <TextArea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Text size="2" mb="1">Allowed Directories (comma-separated)</Text>
                <TextField.Root>
                  <TextField.Input
                    value={formData.allowedDirectories}
                    onChange={(e) => setFormData({ ...formData, allowedDirectories: e.target.value })}
                  />
                </TextField.Root>
              </div>
            </Flex>
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleUpdate}
                disabled={!formData.name || !formData.command || updateMutation.isPending}
              >
                Update Server
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={showDiscoveredTools} onOpenChange={setShowDiscoveredTools}>
          <Dialog.Content style={{ maxWidth: 600 }}>
            <Dialog.Title>Discovered Tools</Dialog.Title>
            <Dialog.Description>
              Tools available from this MCP server
            </Dialog.Description>
            <Box mt="4" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {discoveredTools.map((tool, index) => (
                <Card key={index} mb="2" style={{ padding: '12px' }}>
                  <Text weight="bold" size="3">{tool.name}</Text>
                  <Text size="2" color="gray" style={{ display: 'block', marginTop: '4px' }}>
                    {tool.description}
                  </Text>
                </Card>
              ))}
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

        <Card className="mcp-servers-table-card">
          {/* Desktop Table Layout */}
          <div className="table-container desktop-only">
            <Table.Root>
              <Table.Header className="table-header">
                <Table.Row>
                  <Table.ColumnHeaderCell>Server</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell>Command</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="status-column">Status</Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell className="actions-column">Actions</Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {servers?.map((server: McpServer) => (
                  <Table.Row key={server.id} className="mcp-server-row">
                    <Table.Cell>
                      <Flex direction="column" gap="1">
                        <Flex align="center" gap="2">
                          <Server size={16} />
                          <Text weight="medium">{server.name}</Text>
                        </Flex>
                        {server.description && (
                          <Text size="1" color="gray">{server.description}</Text>
                        )}
                        {server.allowedDirectories && server.allowedDirectories.length > 0 && (
                          <Flex gap="1" mt="1">
                            {server.allowedDirectories.map((dir, idx) => (
                              <Badge key={idx} size="1" variant="outline">
                                {dir}
                              </Badge>
                            ))}
                          </Flex>
                        )}
                      </Flex>
                    </Table.Cell>
                    <Table.Cell>
                      <Text size="2" style={{ fontFamily: 'monospace' }}>
                        {server.command}
                      </Text>
                    </Table.Cell>
                    <Table.Cell className="status-cell">
                      <Switch
                        checked={server.active}
                        onCheckedChange={(checked) =>
                          updateMutation.mutate({ id: server.id, active: checked })
                        }
                      />
                    </Table.Cell>
                    <Table.Cell className="actions-cell">
                      <Flex gap="2">
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => handleDiscover(server)}
                          disabled={discovering}
                        >
                          <Eye size={14} />
                          <span className="button-text">Discover</span>
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => syncMutation.mutate(server.id)}
                          disabled={syncMutation.isPending}
                        >
                          <RefreshCw size={14} />
                          <span className="button-text">Sync</span>
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          onClick={() => handleEdit(server)}
                        >
                          <Edit2 size={14} />
                          <span className="button-text">Edit</span>
                        </Button>
                        <Button
                          size="1"
                          variant="ghost"
                          color="red"
                          onClick={() => {
                            if (confirm('Are you sure you want to delete this MCP server?')) {
                              deleteMutation.mutate(server.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </Button>
                      </Flex>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </div>

          {/* Mobile Card Layout */}
          <div className="mobile-only">
            {servers?.map((server: McpServer) => (
              <div key={server.id} className="mobile-server-card">
                <div className="mobile-server-header">
                  <div className="mobile-server-info">
                    <div className="mobile-server-name">
                      <Server size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                      {server.name}
                    </div>
                    {server.description && (
                      <div className="mobile-server-description">
                        {server.description}
                      </div>
                    )}
                    <div className="mobile-server-command">
                      <strong>Command:</strong> {server.command}
                    </div>
                    {server.allowedDirectories && server.allowedDirectories.length > 0 && (
                      <div className="mobile-server-directories">
                        <strong>Directories:</strong>
                        <div className="mobile-directory-badges">
                          {server.allowedDirectories.map((dir, idx) => (
                            <Badge key={idx} size="1" variant="outline">
                              {dir}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="mobile-server-actions">
                  <div className="mobile-status-section">
                    <Text size="2" color="gray">Active:</Text>
                    <Switch
                      checked={server.active}
                      onCheckedChange={(checked) =>
                        updateMutation.mutate({ id: server.id, active: checked })
                      }
                    />
                  </div>
                  
                  <div className="mobile-actions-section">
                    <Button
                      size="1"
                      variant="outline"
                      onClick={() => handleDiscover(server)}
                      disabled={discovering}
                    >
                      <Eye size={14} />
                      Discover
                    </Button>
                    <Button
                      size="1"
                      variant="outline"
                      onClick={() => syncMutation.mutate(server.id)}
                      disabled={syncMutation.isPending}
                    >
                      <RefreshCw size={14} />
                      Sync
                    </Button>
                    <Button
                      size="1"
                      variant="outline"
                      onClick={() => handleEdit(server)}
                    >
                      <Edit2 size={14} />
                      Edit
                    </Button>
                    <Button
                      size="1"
                      variant="outline"
                      color="red"
                      onClick={() => {
                        if (confirm('Are you sure you want to delete this MCP server?')) {
                          deleteMutation.mutate(server.id);
                        }
                      }}
                    >
                      <Trash2 size={14} />
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Flex>

      <style>{`
        .mcp-servers-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
        .mcp-servers-table-card {
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        /* Desktop layout - show by default */
        .desktop-only {
          display: block;
        }
        
        .mobile-only {
          display: none;
        }
        
        /* Mobile server cards */
        .mobile-server-card {
          background-color: #0a0a0a;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 12px;
        }
        
        .mobile-server-name {
          font-weight: 600;
          font-size: 16px;
          margin-bottom: 8px;
          display: flex;
          align-items: center;
          color: #ffffff;
        }
        
        .mobile-server-description {
          font-size: 14px;
          color: #9ca3af;
          margin-bottom: 8px;
          line-height: 1.4;
        }
        
        .mobile-server-command {
          font-size: 12px;
          color: #e5e7eb;
          margin-bottom: 8px;
          word-break: break-all;
          font-family: monospace;
        }
        
        .mobile-server-directories {
          margin-bottom: 16px;
        }
        
        .mobile-directory-badges {
          display: flex;
          gap: 4px;
          margin-top: 4px;
          flex-wrap: wrap;
        }
        
        .mobile-server-actions {
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          padding-top: 12px;
        }
        
        .mobile-status-section {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 12px;
        }
        
        .mobile-actions-section {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        @media (max-width: 768px) {
          .mcp-servers-container {
            padding: 16px;
            padding-bottom: 120px;
          }
          
          .mcp-servers-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          
          .create-button .button-text {
            display: none;
          }
          
          /* Hide desktop layout on mobile */
          .desktop-only {
            display: none !important;
          }
          
          /* Show mobile layout on mobile */
          .mobile-only {
            display: block !important;
          }
          
          .mcp-servers-table-card {
            padding: 0;
            background-color: transparent !important;
            border: none !important;
          }
        }
      `}</style>
    </Box>
  );
};

export default McpServers;