import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Box, Card, Flex, Text, Badge, Button, Separator } from '@radix-ui/themes';
import { ArrowLeft, User, Bot, Wrench, ChevronDown, ChevronUp, FileText, Eye } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { adminApi } from '../api/client';
// Using built-in date formatting to avoid date-fns issues

const ConversationDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [expandedReasoning, setExpandedReasoning] = useState<Set<string>>(new Set());
  const [markdownEnabled, setMarkdownEnabled] = useState<boolean>(true);

  const { data: conversation, isLoading } = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => adminApi.getConversationDetail(id!).then((res) => res.data),
    enabled: !!id,
  });

  const toggleReasoning = (messageId: string) => {
    const newExpanded = new Set(expandedReasoning);
    if (newExpanded.has(messageId)) {
      newExpanded.delete(messageId);
    } else {
      newExpanded.add(messageId);
    }
    setExpandedReasoning(newExpanded);
  };

  const renderContent = (content: string) => {
    if (!content) return null;
    
    if (markdownEnabled) {
      return (
        <ReactMarkdown 
          remarkPlugins={[remarkGfm]}
          components={{
            // Custom styling for markdown elements
            h1: ({children}) => <Text size="6" weight="bold" style={{display: 'block', marginBottom: '16px'}}>{children}</Text>,
            h2: ({children}) => <Text size="5" weight="bold" style={{display: 'block', marginBottom: '12px'}}>{children}</Text>,
            h3: ({children}) => <Text size="4" weight="bold" style={{display: 'block', marginBottom: '8px'}}>{children}</Text>,
            p: ({children}) => <Text size="2" style={{display: 'block', marginBottom: '8px', lineHeight: '1.5'}}>{children}</Text>,
            code: ({children}) => <Text size="1" style={{fontFamily: 'monospace', background: 'rgba(255,255,255,0.1)', padding: '2px 4px', borderRadius: '4px'}}>{children}</Text>,
            pre: ({children}) => <div style={{background: 'rgba(255,255,255,0.05)', padding: '12px', borderRadius: '8px', marginBottom: '8px', overflow: 'auto'}}>{children}</div>,
            ul: ({children}) => <ul style={{marginBottom: '8px', paddingLeft: '20px'}}>{children}</ul>,
            ol: ({children}) => <ol style={{marginBottom: '8px', paddingLeft: '20px'}}>{children}</ol>,
            li: ({children}) => <li style={{marginBottom: '4px', color: '#e5e7eb'}}>{children}</li>,
            blockquote: ({children}) => <div style={{borderLeft: '3px solid #60a5fa', paddingLeft: '12px', margin: '8px 0', fontStyle: 'italic', color: '#9ca3af'}}>{children}</div>,
            table: ({children}) => <table style={{borderCollapse: 'collapse', width: '100%', marginBottom: '8px'}}>{children}</table>,
            th: ({children}) => <th style={{border: '1px solid #374151', padding: '8px', background: 'rgba(255,255,255,0.05)', textAlign: 'left'}}>{children}</th>,
            td: ({children}) => <td style={{border: '1px solid #374151', padding: '8px'}}>{children}</td>,
          }}
        >
          {content}
        </ReactMarkdown>
      );
    } else {
      return (
        <Text
          size="2"
          style={{
            whiteSpace: 'pre-wrap',
            lineHeight: '1.5'
          }}
        >
          {content}
        </Text>
      );
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

  if (!conversation) {
    return (
      <Box p="6">
        <Text>Conversation not found</Text>
      </Box>
    );
  }

  const renderMessage = (message: any, index: number) => {
    const isUser = message.role === 'user';
    const isAssistant = message.role === 'assistant';
    const isTool = message.role === 'tool';
    const isSystem = message.role === 'system';

    return (
      <Card key={message.id} className="message-card">
        <Flex direction="column" gap="3">
          <div className="message-header">
            <Flex align="center" gap="2" className="message-role">
              {isUser && <User size={16} color="#10b981" />}
              {isAssistant && <Bot size={16} color="#3b82f6" />}
              {isTool && <Wrench size={16} color="#f59e0b" />}
              
              <Text size="2" weight="medium" color={isSystem ? 'gray' : undefined}>
                {message.role.charAt(0).toUpperCase() + message.role.slice(1)}
                {message.name && ` (${message.name})`}
              </Text>
            </Flex>
            
            <div className="message-badges">
              {message.requestTokens > 0 && (
                <Badge color="blue" size="1">
                  {message.requestTokens} tokens
                </Badge>
              )}
              
              {message.responseTokens > 0 && (
                <Badge color="green" size="1">
                  {message.responseTokens} tokens
                </Badge>
              )}
              
              {message.latencyMs && (
                <Badge color="orange" size="1">
                  {message.latencyMs}ms
                </Badge>
              )}
            </div>
            
            <Text size="1" color="gray" className="message-time">
              {new Date(message.createdAt).toLocaleTimeString('en-US')}
            </Text>
          </div>

          {/* Reasoning Section for AI responses */}
          {message.metadata?.reasoning_content && isAssistant && (
            <Box>
              <Button
                variant="ghost"
                size="1"
                onClick={() => toggleReasoning(message.id)}
                style={{
                  padding: '4px 8px',
                  marginBottom: '8px',
                  color: '#9ca3af',
                  fontSize: '12px'
                }}
              >
                <Flex align="center" gap="1">
                  {expandedReasoning.has(message.id) ? (
                    <ChevronUp size={12} />
                  ) : (
                    <ChevronDown size={12} />
                  )}
                  <Text size="1">
                    {expandedReasoning.has(message.id) ? 'Hide' : 'Show'} AI Reasoning
                  </Text>
                </Flex>
              </Button>
              
              {expandedReasoning.has(message.id) && (
                <Box
                  style={{
                    background: 'rgba(59, 130, 246, 0.05)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(59, 130, 246, 0.2)',
                    marginBottom: '12px',
                  }}
                >
                  <Text
                    size="1"
                    weight="medium"
                    style={{ 
                      color: '#60a5fa',
                      marginBottom: '8px',
                      display: 'block'
                    }}
                  >
                    🧠 AI Thinking Process
                  </Text>
                  <div style={{fontSize: '11px', color: '#d1d5db'}}>
                    {renderContent(message.metadata.reasoning_content)}
                  </div>
                </Box>
              )}
            </Box>
          )}

          {/* Main Response Content */}
          {message.content && (
            <Box
              style={{
                background: isSystem ? 'rgba(156, 163, 175, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{
                fontFamily: isSystem ? 'monospace' : 'inherit',
                fontSize: isSystem ? '12px' : 'inherit',
              }}>
                {isSystem ? (
                  <Text size="2" style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: '12px' }}>
                    {message.content}
                  </Text>
                ) : (
                  renderContent(message.content)
                )}
              </div>
            </Box>
          )}

          {message.toolCalls && message.toolCalls.length > 0 && (
            <Box>
              <Text size="2" weight="medium" mb="2">
                Tool Calls:
              </Text>
              {message.toolCalls.map((toolCall: any, idx: number) => (
                <Box
                  key={idx}
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(245, 158, 11, 0.2)',
                    marginBottom: '8px',
                  }}
                >
                  <Text size="2" weight="medium">
                    {toolCall.function.name}
                  </Text>
                  <Text size="1" style={{ fontFamily: 'monospace', display: 'block', marginTop: '4px' }}>
                    {toolCall.function.arguments}
                  </Text>
                </Box>
              ))}
            </Box>
          )}

          {message.functionCall && (
            <Box
              style={{
                background: 'rgba(245, 158, 11, 0.1)',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid rgba(245, 158, 11, 0.2)',
              }}
            >
              <Text size="2" weight="medium">
                Function Call: {message.functionCall.name}
              </Text>
              <Text size="1" style={{ fontFamily: 'monospace', display: 'block', marginTop: '4px' }}>
                {message.functionCall.arguments}
              </Text>
            </Box>
          )}
        </Flex>
      </Card>
    );
  };

  return (
    <Box className="conversation-detail-container">
      <Flex direction="column" gap="6" style={{ height: '100%' }}>
        <div className="header-section">
          <Link to="/conversations">
            <Button variant="ghost" size="2" className="back-button">
              <ArrowLeft size={16} />
              <span className="back-text">Back</span>
            </Button>
          </Link>
          <Flex direction="column" gap="1" className="title-section">
            <Text size="6" weight="bold">
              Conversation Details
            </Text>
            <Text size="3" style={{ color: '#9ca3af' }} className="conversation-id">
              {conversation.id}
            </Text>
          </Flex>
        </div>

        <Card className="metadata-card">
          <Flex direction="column" gap="4">
            <Flex justify="between" align="center" className="metadata-header">
              <Text size="4" weight="bold">
                Conversation Metadata
              </Text>
              <Badge color={conversation.endedAt ? 'green' : 'orange'}>
                {conversation.endedAt ? 'Completed' : 'Active'}
              </Badge>
            </Flex>
            
            <Separator />
            
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
                <Text size="2">{conversation.totalTokensUsed.toLocaleString()}</Text>
              </Flex>
              <Flex gap="2" align="center">
                <Text size="2" color="gray">Started:</Text>
                <Text size="2">{new Date(conversation.startedAt).toLocaleString()}</Text>
              </Flex>
              {conversation.endedAt && (
                <Flex gap="2" align="center">
                  <Text size="2" color="gray">Ended:</Text>
                  <Text size="2">{new Date(conversation.endedAt).toLocaleString()}</Text>
                </Flex>
              )}
              {conversation.totalCost > 0 && (
                <Flex gap="2" align="center">
                  <Text size="2" color="gray">Cost:</Text>
                  <Text size="2">${(conversation.totalCost / 100).toFixed(4)}</Text>
                </Flex>
              )}
            </Flex>
          </Flex>
        </Card>

        <Box className="messages-section">
          <Flex justify="between" align="center" mb="4">
            <Text size="4" weight="bold">
              Messages ({conversation.messages?.length || 0})
            </Text>
            <Button
              variant="ghost"
              size="2"
              onClick={() => setMarkdownEnabled(!markdownEnabled)}
              style={{
                color: '#9ca3af',
                fontSize: '14px'
              }}
            >
              <Flex align="center" gap="2">
                {markdownEnabled ? <Eye size={16} /> : <FileText size={16} />}
                <Text size="2">
                  {markdownEnabled ? 'Raw Text' : 'Markdown'}
                </Text>
              </Flex>
            </Button>
          </Flex>
          
          <div className="messages-container">
            {conversation.messages?.map(renderMessage)}
          </div>
        </Box>
      </Flex>
      
      <style>{`
        .conversation-detail-container {
          padding: 24px;
          padding-bottom: 80px;
          min-height: 100%;
        }
        
        .messages-section {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .messages-container {
          flex: 1;
          padding-right: 8px;
        }
        
        .header-section {
          display: flex;
          align-items: flex-start;
          gap: 16px;
        }
        
        .title-section {
          flex: 1;
        }
        
        .metadata-card {
          padding: 24px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        .conversation-metadata {
          margin-top: 16px;
        }
        
        .message-card {
          padding: 16px;
          margin-bottom: 16px;
          background-color: #1a1a1a !important;
          border: 1px solid rgba(255, 255, 255, 0.1) !important;
        }
        
        .message-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 8px;
        }
        
        .message-badges {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        
        @media (max-width: 768px) {
          .conversation-detail-container {
            padding: 16px;
            padding-bottom: 120px;
          }
          
          .messages-section {
            flex: 1;
          }
          
          .header-section {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }
          
          .back-text {
            display: none;
          }
          
          .conversation-id {
            font-size: 12px;
            word-break: break-all;
          }
          
          .metadata-card {
            padding: 16px;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
          
          .conversation-metadata {
            flex-direction: column;
            gap: 8px;
          }
          
          .date-text {
            font-size: 12px;
            word-break: break-all;
          }
          
          .message-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 8px;
          }
          
          .message-role {
            align-self: flex-start;
          }
          
          .message-badges {
            justify-content: flex-start;
          }
          
          .message-time {
            align-self: flex-end;
          }
          
          .message-card {
            padding: 12px;
            background-color: #141414 !important;
            border: 1px solid rgba(255, 255, 255, 0.1) !important;
          }
        }
        
        @media (max-width: 480px) {
          .conversation-detail-container {
            padding: 12px;
          }
          
          .conversation-metadata {
            flex-direction: column;
            gap: 8px;
          }
          
          .metadata-card {
            padding: 12px;
          }
          
          .message-badges {
            flex-wrap: wrap;
            gap: 4px;
          }
        }
      `}</style>
    </Box>
  );
};

export default ConversationDetail;