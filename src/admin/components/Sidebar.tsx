import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Box, Flex, Text, Button } from '@radix-ui/themes';
import {
  BarChart3,
  Key,
  Wrench,
  MessageSquare,
  LogOut,
  Activity,
  Server,
} from 'lucide-react';

interface SidebarProps {
  onLogout: () => void;
  isMobileMenuOpen?: boolean;
  onCloseMobileMenu?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onLogout, isMobileMenuOpen = false, onCloseMobileMenu }) => {
  const location = useLocation();

  const menuItems = [
    { path: '/dashboard', icon: BarChart3, label: 'Dashboard' },
    { path: '/api-keys', icon: Key, label: 'API Keys' },
    { path: '/upstream-servers', icon: Server, label: 'Upstream Servers' },
    { path: '/mcp-servers', icon: Server, label: 'MCP Servers' },
    { path: '/tools', icon: Wrench, label: 'Tools' },
    { path: '/conversations', icon: MessageSquare, label: 'Conversations' },
  ];

  return (
    <Box
      style={{
        width: '240px',
        background: '#141414',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)',
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        left: isMobileMenuOpen ? '0' : '-240px',
        top: 0,
        zIndex: 50,
        transition: 'left 0.3s ease',
      }}
      className="sidebar"
    >
      <Box p="4" style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.1)' }}>
        <Flex align="center" gap="2">
          <Activity size={24} color="#3b82f6" />
          <span style={{ 
            color: '#ffffff', 
            fontSize: '20px', 
            fontWeight: 'bold',
            letterSpacing: '-0.02em'
          }}>
            OpenAI Proxy
          </span>
        </Flex>
      </Box>

      <Box style={{ flex: 1, padding: '0 16px' }}>
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onCloseMobileMenu}
              style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}
            >
              <Flex
                align="center"
                gap="3"
                p="3"
                style={{
                  borderRadius: '8px',
                  background: isActive ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                  color: isActive ? '#3b82f6' : '#ffffff',
                  opacity: isActive ? 1 : 0.8,
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '1';
                    e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.opacity = '0.8';
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                <Icon size={18} />
                <Text size="2" weight={isActive ? 'medium' : 'regular'}>
                  {item.label}
                </Text>
              </Flex>
            </Link>
          );
        })}
      </Box>

      <Box p="4">
        <Button
          variant="ghost"
          onClick={onLogout}
          style={{
            width: '100%',
            justifyContent: 'flex-start',
            color: '#ef4444',
          }}
        >
          <LogOut size={18} />
          Logout
        </Button>
      </Box>
      
      <style>{`
        @media (min-width: 769px) {
          .sidebar {
            position: static !important;
            left: 0 !important;
            transition: none !important;
          }
        }
        
        @media (max-width: 768px) {
          .sidebar {
            padding-top: 60px;
          }
        }
      `}</style>
    </Box>
  );
};

export default Sidebar;