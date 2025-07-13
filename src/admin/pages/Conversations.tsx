import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Box, Card, Flex, Text, Badge } from '@radix-ui/themes';
import { MessageSquare } from 'lucide-react';
import { adminApi } from '../api/client';

const Conversations: React.FC = () => {
  const { data: conversations, isLoading, error } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => adminApi.getConversations().then((res) => res.data),
  });

  if (isLoading) {
    return (
      <Box className="conversations-container">
        <Text>Loading conversations...</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="conversations-container">
        <Text>Error loading conversations: {error instanceof Error ? error.message : 'Unknown error'}</Text>
      </Box>
    );
  }

  return (
    <Box className="conversations-container">
      <Flex direction="column" gap="6">
        <Flex direction="column" gap="1">
          <Text size="6" weight="bold">
            Conversations
          </Text>
          <Text size="3" style={{ color: '#9ca3af' }}>
            View and analyze conversations going through the proxy
          </Text>
        </Flex>

        <Card style={{ padding: '24px', backgroundColor: '#1a1a1a', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
          {!conversations || conversations.length === 0 ? (
            <Text>No conversations found</Text>
          ) : (
            <Flex direction="column" gap="3">
              <Text size="4" weight="bold">
                {conversations.length} Conversations
              </Text>
              {conversations.map((conversation: any) => (
                <Card key={conversation.id} style={{ padding: '16px', backgroundColor: '#141414' }}>
                  <Flex direction="column" gap="2">
                    <Flex align="center" gap="2">
                      <MessageSquare size={16} color="#3b82f6" />
                      <Link to={`/conversations/${conversation.id}`} style={{ textDecoration: 'none' }}>
                        <Text weight="medium" style={{ color: '#3b82f6' }}>
                          {conversation.id.substring(0, 8)}...
                        </Text>
                      </Link>
                    </Flex>
                    <Flex gap="4" wrap="wrap" className="conversation-metadata">
                      <Flex gap="2" align="center">
                        <Text size="2" color="gray">API:</Text>
                        <Text size="2">{conversation.apiKeyName}</Text>
                      </Flex>
                      <Flex gap="2" align="center">
                        <Text size="2" color="gray">Model:</Text>
                        <Badge color="blue">{conversation.model}</Badge>
                      </Flex>
                      <Flex gap="2" align="center">
                        <Text size="2" color="gray">Tokens:</Text>
                        <Text size="2">{conversation.totalTokensUsed}</Text>
                      </Flex>
                      <Flex gap="2" align="center">
                        <Text size="2" color="gray">Started:</Text>
                        <Text size="2">{new Date(conversation.startedAt).toLocaleString()}</Text>
                      </Flex>
                    </Flex>
                  </Flex>
                </Card>
              ))}
            </Flex>
          )}
        </Card>
      </Flex>
      
      <style>{`
        .conversations-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        @media (max-width: 768px) {
          .conversations-container {
            padding: 16px;
            padding-bottom: 120px;
          }
        }
        
        @media (max-width: 480px) {
          .conversations-container {
            padding: 12px;
          }
        }
        
        @media (max-width: 640px) {
          .conversation-metadata {
            flex-direction: column;
            gap: 8px;
          }
        }
      `}</style>
    </Box>
  );
};

export default Conversations;