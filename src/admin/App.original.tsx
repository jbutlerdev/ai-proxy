import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Box, Flex } from '@radix-ui/themes';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ApiKeys from './pages/ApiKeys';
import Tools from './pages/Tools';
import Conversations from './pages/Conversations';
import ConversationDetail from './pages/ConversationDetail';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem('adminToken');
    setIsAuthenticated(!!token);
  }, []);

  const handleLogin = (token: string) => {
    localStorage.setItem('adminToken', token);
    setIsAuthenticated(true);
    navigate('/dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('adminToken');
    setIsAuthenticated(false);
    navigate('/login');
  };

  if (!isAuthenticated && window.location.pathname !== '/login') {
    return <Navigate to="/login" replace />;
  }

  return (
    <>
      <Toaster position="top-right" />
      {isAuthenticated ? (
        <Flex style={{ height: '100vh' }}>
          <Sidebar onLogout={handleLogout} />
          <Box style={{ flex: 1, overflow: 'auto' }}>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/api-keys" element={<ApiKeys />} />
              <Route path="/tools" element={<Tools />} />
              <Route path="/conversations" element={<Conversations />} />
              <Route path="/conversations/:id" element={<ConversationDetail />} />
            </Routes>
          </Box>
        </Flex>
      ) : (
        <Routes>
          <Route path="/login" element={<Login onLogin={handleLogin} />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      )}
    </>
  );
}

export default App;