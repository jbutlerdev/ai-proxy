import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Box, Card, Flex, Text, Button, TextField, Switch, Table, Dialog, TextArea, Select, Badge, Tabs } from '@radix-ui/themes';
import { Plus, Wrench, Edit2, Trash2, Server, Code } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

interface Tool {
  id: number;
  name: string;
  description: string;
  type: string;
  sourceType: string;
  parameters: any;
  implementation: string | null;
  mcpServerId: number | null;
  mcpServerName?: string;
  mcpServerCmd?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

const Tools: React.FC = () => {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editingTool, setEditingTool] = useState<Tool | null>(null);
  const [filterBy, setFilterBy] = useState<'all' | 'builtin' | 'mcp'>('all');
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: 'function',
    sourceType: 'builtin',
    parameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
    implementation: '',
  });

  const { data: tools, isLoading } = useQuery({
    queryKey: ['tools'],
    queryFn: () => adminApi.getTools().then((res) => res.data),
  });

  const { data: mcpServers } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: () => adminApi.getMcpServers().then((res) => res.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => adminApi.createTool(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('Tool created successfully');
      resetForm();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create tool');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: number; [key: string]: any }) =>
      adminApi.updateTool(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
      toast.success('Tool updated successfully');
      setShowEditForm(false);
      setEditingTool(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update tool');
    },
  });

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      type: 'function',
      sourceType: 'builtin',
      parameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
      implementation: '',
    });
    setShowCreateForm(false);
  };

  const handleCreate = () => {
    try {
      const params = JSON.parse(formData.parameters);
      createMutation.mutate({
        name: formData.name,
        description: formData.description,
        type: formData.type,
        sourceType: formData.sourceType,
        parameters: params,
        implementation: formData.implementation || null,
      });
    } catch (error) {
      toast.error('Invalid JSON in parameters');
    }
  };

  const handleEdit = (tool: Tool) => {
    setEditingTool(tool);
    setFormData({
      name: tool.name,
      description: tool.description,
      type: tool.type,
      sourceType: tool.sourceType,
      parameters: JSON.stringify(tool.parameters, null, 2),
      implementation: tool.implementation || '',
    });
    setShowEditForm(true);
  };

  const handleUpdate = () => {
    if (!editingTool) return;

    try {
      const params = JSON.parse(formData.parameters);
      updateMutation.mutate({
        id: editingTool.id,
        name: formData.name,
        description: formData.description,
        parameters: params,
        implementation: formData.implementation || null,
        active: editingTool.active,
      });
    } catch (error) {
      toast.error('Invalid JSON in parameters');
    }
  };

  const filteredTools = tools?.filter((tool: Tool) => {
    if (filterBy === 'all') return true;
    return tool.sourceType === filterBy;
  });

  const groupedTools = filteredTools?.reduce((acc: any, tool: Tool) => {
    const key = tool.sourceType === 'mcp' && tool.mcpServerName 
      ? tool.mcpServerName 
      : 'Built-in Tools';
    if (!acc[key]) acc[key] = [];
    acc[key].push(tool);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <Box className="tools-container">
        <div className="flex-center" style={{ height: '200px' }}>
          <div className="spinner" />
        </div>
      </Box>
    );
  }

  return (
    <Box className="tools-container">
      <Flex direction="column" gap="6">
        <Flex justify="between" className="tools-header">
          <Flex direction="column" gap="1">
            <Text size="6" weight="bold">
              Tools
            </Text>
            <Text size="3" style={{ color: '#9ca3af' }}>
              Manage tools available for the proxy
            </Text>
          </Flex>
          <Button onClick={() => setShowCreateForm(true)} className="create-button">
            <Plus size={16} />
            <span className="button-text">Create Tool</span>
          </Button>
        </Flex>

        <Tabs.Root defaultValue="all" onValueChange={(value) => setFilterBy(value as any)}>
          <Tabs.List>
            <Tabs.Trigger value="all">All Tools</Tabs.Trigger>
            <Tabs.Trigger value="builtin">Built-in</Tabs.Trigger>
            <Tabs.Trigger value="mcp">MCP Tools</Tabs.Trigger>
          </Tabs.List>

          <Box mt="4">
            {Object.entries(groupedTools || {}).map(([groupName, groupTools]: [string, any]) => (
              <Card key={groupName} className="tools-group-card" mb="4">
                <Flex align="center" gap="2" mb="3">
                  {groupName === 'Built-in Tools' ? <Code size={16} /> : <Server size={16} />}
                  <Text size="4" weight="bold">{groupName}</Text>
                  <Badge size="1" variant="soft">{groupTools.length}</Badge>
                </Flex>
                
                <div className="table-container">
                  <Table.Root>
                    <Table.Header className="table-header">
                      <Table.Row>
                        <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell>Description</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="type-column">Type</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="status-column">Status</Table.ColumnHeaderCell>
                        <Table.ColumnHeaderCell className="actions-column">Actions</Table.ColumnHeaderCell>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {groupTools.map((tool: Tool) => (
                        <Table.Row key={tool.id} className="tool-row">
                          <Table.Cell>
                            <Flex align="center" gap="2">
                              <Wrench size={16} />
                              <Text weight="medium">{tool.name}</Text>
                            </Flex>
                          </Table.Cell>
                          <Table.Cell>
                            <Text size="2">{tool.description}</Text>
                          </Table.Cell>
                          <Table.Cell className="type-cell">
                            <Badge size="1" variant="outline">
                              {tool.type}
                            </Badge>
                          </Table.Cell>
                          <Table.Cell className="status-cell">
                            <Switch
                              checked={tool.active}
                              onCheckedChange={(checked) =>
                                updateMutation.mutate({ id: tool.id, active: checked })
                              }
                              disabled={tool.sourceType === 'mcp'}
                            />
                          </Table.Cell>
                          <Table.Cell className="actions-cell">
                            <Flex gap="2">
                              {tool.sourceType === 'builtin' && (
                                <Button
                                  size="1"
                                  variant="ghost"
                                  onClick={() => handleEdit(tool)}
                                >
                                  <Edit2 size={14} />
                                  <span className="button-text">Edit</span>
                                </Button>
                              )}
                            </Flex>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </div>
              </Card>
            ))}
          </Box>
        </Tabs.Root>

        <Dialog.Root open={showCreateForm} onOpenChange={setShowCreateForm}>
          <Dialog.Content style={{ maxWidth: 600 }}>
            <Dialog.Title>Create New Tool</Dialog.Title>
            <Dialog.Description>
              Create a custom built-in tool with its own implementation
            </Dialog.Description>
            <Flex direction="column" gap="4" mt="4">
              <div>
                <Text size="2" mb="1">Name</Text>
                <TextField.Root>
                  <TextField.Input
                    placeholder="e.g., calculate_sum"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  />
                </TextField.Root>
              </div>
              <div>
                <Text size="2" mb="1">Description</Text>
                <TextArea
                  placeholder="Describe what this tool does"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Text size="2" mb="1">Parameters (JSON Schema)</Text>
                <TextArea
                  placeholder="JSON schema for parameters"
                  value={formData.parameters}
                  onChange={(e) => setFormData({ ...formData, parameters: e.target.value })}
                  style={{ fontFamily: 'monospace', minHeight: '150px' }}
                />
              </div>
              <div>
                <Text size="2" mb="1">Implementation (JavaScript)</Text>
                <TextArea
                  placeholder="return args.a + args.b;"
                  value={formData.implementation}
                  onChange={(e) => setFormData({ ...formData, implementation: e.target.value })}
                  style={{ fontFamily: 'monospace', minHeight: '150px' }}
                />
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
                disabled={!formData.name || !formData.description || createMutation.isPending}
              >
                Create Tool
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>

        <Dialog.Root open={showEditForm} onOpenChange={setShowEditForm}>
          <Dialog.Content style={{ maxWidth: 600 }}>
            <Dialog.Title>Edit Tool</Dialog.Title>
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
                <Text size="2" mb="1">Description</Text>
                <TextArea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <div>
                <Text size="2" mb="1">Parameters (JSON Schema)</Text>
                <TextArea
                  value={formData.parameters}
                  onChange={(e) => setFormData({ ...formData, parameters: e.target.value })}
                  style={{ fontFamily: 'monospace', minHeight: '150px' }}
                />
              </div>
              {editingTool?.sourceType === 'builtin' && (
                <div>
                  <Text size="2" mb="1">Implementation (JavaScript)</Text>
                  <TextArea
                    value={formData.implementation}
                    onChange={(e) => setFormData({ ...formData, implementation: e.target.value })}
                    style={{ fontFamily: 'monospace', minHeight: '150px' }}
                  />
                </div>
              )}
            </Flex>
            <Flex gap="3" mt="4" justify="end">
              <Dialog.Close>
                <Button variant="soft" color="gray">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button
                onClick={handleUpdate}
                disabled={!formData.name || !formData.description || updateMutation.isPending}
              >
                Update Tool
              </Button>
            </Flex>
          </Dialog.Content>
        </Dialog.Root>
      </Flex>
      
      <style>{`
        .tools-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .table-container {
          overflow-x: auto;
        }
        
        .tools-group-card {
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
          padding: 20px !important;
        }
        
        @media (max-width: 768px) {
          .tools-container {
            padding: 16px;
            padding-bottom: 120px;
          }
          
          .tools-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          
          .create-button .button-text {
            display: none;
          }
          
          .type-column,
          .status-column,
          .actions-column {
            display: none;
          }
          
          .type-cell,
          .status-cell,
          .actions-cell {
            display: none;
          }
          
          .button-text {
            display: none;
          }
        }
      `}</style>
    </Box>
  );
};

export default Tools;