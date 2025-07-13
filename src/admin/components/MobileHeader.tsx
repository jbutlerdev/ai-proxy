import React from 'react';
import { Box, Flex, Text } from '@radix-ui/themes';
import { Menu, Activity } from 'lucide-react';

interface MobileHeaderProps {
  onMenuToggle: () => void;
}

const MobileHeader: React.FC<MobileHeaderProps> = ({ onMenuToggle }) => {
  return (
    <Box
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: '#141414',
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        zIndex: 50,
        padding: '0 16px',
      }}
    >
      <Flex align="center" justify="between" style={{ height: '100%' }}>
        <button
          onClick={onMenuToggle}
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            cursor: 'pointer',
            padding: '8px',
            borderRadius: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background-color 0.2s, color 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#9ca3af';
          }}
        >
          <Menu size={24} />
        </button>
        
        <Flex align="center" gap="2">
          <Activity size={20} color="#3b82f6" />
          <span style={{ 
            color: '#ffffff', 
            fontSize: '18px', 
            fontWeight: 'bold',
            letterSpacing: '-0.02em'
          }}>
            OpenAI Proxy
          </span>
        </Flex>
        
        <Box style={{ width: '40px' }} />
      </Flex>
    </Box>
  );
};

export default MobileHeader;