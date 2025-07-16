import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Box, Card, Flex, Text, Grid } from '@radix-ui/themes';
import { Key, Wrench, MessageSquare, Activity } from 'lucide-react';
import { adminApi } from '../api/client';

const Dashboard: React.FC = () => {
  const { data: apiKeys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: () => adminApi.getApiKeys().then((res) => res.data),
  });

  const { data: tools } = useQuery({
    queryKey: ['tools'],
    queryFn: () => adminApi.getTools().then((res) => res.data),
  });

  const { data: conversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => adminApi.getConversations().then((res) => res.data),
  });

  const stats = [
    {
      icon: Key,
      label: 'API Keys',
      value: apiKeys?.length || 0,
      active: apiKeys?.filter((k: any) => k.active).length || 0,
      color: '#3b82f6',
      link: '/api-keys',
    },
    {
      icon: Wrench,
      label: 'Tools',
      value: tools?.length || 0,
      active: tools?.filter((t: any) => t.active).length || 0,
      color: '#10b981',
      link: '/tools',
    },
    {
      icon: MessageSquare,
      label: 'Conversations',
      value: conversations?.length || 0,
      active: conversations?.filter((c: any) => !c.endedAt).length || 0,
      color: '#f59e0b',
      link: '/conversations',
    },
    {
      icon: Activity,
      label: 'Total Tokens',
      value: conversations?.reduce((sum: number, c: any) => sum + (c.totalTokensUsed || 0), 0) || 0,
      active: 0,
      color: '#8b5cf6',
      link: '/conversations',
    },
  ];

  return (
    <Box className="dashboard-container">
      <Flex direction="column" gap="6">
        <Flex direction="column" gap="1" className="dashboard-header">
          <Text size="6" weight="bold">
            Dashboard
          </Text>
          <Text size="3" style={{ color: '#9ca3af' }}>
            Overview of your OpenAI proxy server
          </Text>
        </Flex>

        <div className="stats-grid">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Link key={stat.label} to={stat.link} style={{ textDecoration: 'none' }}>
                <Card className="stat-card stat-card-clickable">
                  <Flex direction="column" gap="3">
                    <Flex align="center" justify="between">
                      <Icon size={24} color={stat.color} />
                      <Text size="1" style={{ color: '#9ca3af' }}>
                        {stat.label}
                      </Text>
                    </Flex>

                    <Text size="7" weight="bold">
                      {stat.value.toLocaleString()}
                    </Text>

                    {stat.active > 0 && (
                      <Text size="2" style={{ color: '#9ca3af' }}>
                        {stat.active} active
                      </Text>
                    )}
                  </Flex>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="charts-grid">
          <Card className="chart-card">
            <Text size="4" weight="bold" mb="4">
              Recent Activity
            </Text>
            <div className="activity-list">
              {conversations?.slice(0, 5).map((conversation: any, index: number) => (
                <div key={conversation.id}>
                  <Flex justify="between" align="center" py="2" className="activity-item">
                    <Box style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <Text size="2" weight="medium">
                        {conversation.model}
                      </Text>
                      <Text size="1" color="gray">
                        {conversation.apiKeyName}
                      </Text>
                    </Box>
                    <Text size="1" color="gray">
                      {new Date(conversation.startedAt).toLocaleDateString()}
                    </Text>
                  </Flex>
                  {index < conversations.slice(0, 5).length - 1 && (
                    <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 16px' }} />
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card className="chart-card">
            <Text size="4" weight="bold" mb="4">
              Popular Models
            </Text>
            <div className="models-list">
              {Object.entries(
                conversations?.reduce((acc: any, conv: any) => {
                  acc[conv.model] = (acc[conv.model] || 0) + 1;
                  return acc;
                }, {}) || {}
              )
                .sort(([, a], [, b]) => (b as number) - (a as number))
                .slice(0, 5)
                .map(([model, count], index: number, array: any[]) => (
                  <div key={model as string}>
                    <Flex justify="between" align="center" py="2" className="model-item">
                      <Text size="2" weight="medium">
                        {model as string}
                      </Text>
                      <Text size="1" color="gray">
                        {count as number} uses
                      </Text>
                    </Flex>
                    {index < array.length - 1 && (
                      <div style={{ height: '1px', backgroundColor: 'rgba(255, 255, 255, 0.1)', margin: '0 16px' }} />
                    )}
                  </div>
                ))}
            </div>
          </Card>
        </div>
      </Flex>
      
      <style>{`
        .dashboard-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .stats-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 16px;
        }
        
        .stat-card {
          padding: 24px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        .stat-card-clickable {
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .stat-card-clickable:hover {
          background-color: #252525 !important;
          border-color: rgba(59, 130, 246, 0.3) !important;
          transform: translateY(-2px);
          box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
        }
        
        .charts-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 24px;
        }
        
        .chart-card {
          padding: 24px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        @media (max-width: 1024px) {
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (max-width: 768px) {
          .dashboard-container {
            padding: 16px;
            padding-bottom: 120px;
            margin-left: 0;
          }
          
          .stats-grid {
            grid-template-columns: repeat(2, 1fr);
            gap: 12px;
          }
          
          .stat-card {
            padding: 16px;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
          
          .stat-card-clickable:hover {
            background-color: #1f1f1f !important;
          }
          
          .charts-grid {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          
          .chart-card {
            padding: 16px;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
          
          .dashboard-header {
            margin-bottom: 8px;
          }
        }
        
        @media (max-width: 480px) {
          .dashboard-container {
            padding: 12px;
          }
          
          .stats-grid {
            grid-template-columns: 1fr;
            gap: 8px;
          }
          
          .stat-card {
            padding: 12px;
          }
          
          .stat-card-clickable:hover {
            background-color: #1a1a1a !important;
            transform: none;
          }
          
          .chart-card {
            padding: 12px;
          }
          
          .activity-item, .model-item {
            flex-wrap: wrap;
            gap: 8px;
          }
        }
      `}</style>
    </Box>
  );
};

export default Dashboard;