import React, { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Box, Flex } from '@radix-ui/themes';
import Sidebar from './components/Sidebar';
import MobileHeader from './components/MobileHeader';
import Dashboard from './pages/Dashboard';
import ApiKeys from './pages/ApiKeys';
import UpstreamServers from './pages/UpstreamServers';
import McpServers from './pages/McpServers';
import Tools from './pages/Tools';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    // No-op since we don't have authentication
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <>
      <Toaster position="top-right" />
      <Flex style={{ height: '100vh', flexDirection: 'column' }}>
        {/* Mobile Header */}
        <Box 
          style={{ display: 'none' }}
          className="mobile-header"
        >
          <MobileHeader onMenuToggle={toggleMobileMenu} />
        </Box>
        
        <Flex style={{ flex: 1, position: 'relative' }}>
          <Sidebar 
            onLogout={handleLogout} 
            isMobileMenuOpen={isMobileMenuOpen}
            onCloseMobileMenu={closeMobileMenu}
          />
          
          {/* Mobile Overlay */}
          {isMobileMenuOpen && (
            <Box
              onClick={closeMobileMenu}
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0, 0, 0, 0.5)',
                zIndex: 40,
              }}
              className="mobile-overlay"
            />
          )}
          
          <div 
            style={{ 
              flex: 1, 
              overflowY: 'scroll',
              overflowX: 'hidden',
              paddingTop: '0px',
              backgroundColor: '#0a0a0a',
              color: '#e5e7eb',
              height: 'calc(100vh - 0px)',
              position: 'relative'
            }}
            className="main-content"
          >
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/upstream-servers" element={<UpstreamServers />} />
              <Route path="/mcp-servers" element={<McpServers />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/conversations/:id" element={<ConversationDetail />} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </div>
        </Flex>
      </Flex>
      
      <style>{`
        /* Global scrollbar styling */
        * {
          scrollbar-width: thin;
          scrollbar-color: #6b7280 #374151;
        }
        
        *::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        
        *::-webkit-scrollbar-track {
          background: #374151;
          border-radius: 6px;
        }
        
        *::-webkit-scrollbar-thumb {
          background: #6b7280;
          border-radius: 6px;
          border: 2px solid #374151;
        }
        
        *::-webkit-scrollbar-thumb:hover {
          background: #9ca3af;
        }
        
        *::-webkit-scrollbar-corner {
          background: #374151;
        }
        
        /* Main content specific */
        .main-content {
          overflow-y: scroll !important;
          overflow-x: hidden !important;
          scrollbar-gutter: stable;
          min-height: calc(100vh + 100px) !important;
        }
        
        /* Force all containers to allow scrolling */
        .rt-Flex, .rt-Box {
          max-height: none !important;
          overflow: visible !important;
        }
        
        /* Ensure content can scroll */
        body, html, #root {
          overflow: visible !important;
          height: auto !important;
        }
        
        @media (max-width: 768px) {
          .mobile-header {
            display: block !important;
          }
          .main-content {
            padding-top: 60px !important;
          }
        }
      `}</style>
    </>
  );
}

export default App;