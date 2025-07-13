import React, { useState } from 'react';
import { Box, Card, Flex, Text, TextField, Button } from '@radix-ui/themes';
import { Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminApi } from '../api/client';

interface LoginProps {
  onLogin: (token: string) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await adminApi.login(password);
      const { token } = response.data;
      onLogin(token);
      toast.success('Logged in successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Flex
      align="center"
      justify="center"
      style={{
        height: '100vh',
        background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)',
      }}
    >
      <Card style={{ width: '400px', padding: '32px' }}>
        <Flex direction="column" align="center" gap="4">
          <Box
            style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: '50%',
              padding: '16px',
            }}
          >
            <Lock size={24} color="#3b82f6" />
          </Box>

          <Text size="5" weight="bold" align="center">
            Admin Login
          </Text>

          <Text size="2" color="gray" align="center">
            Enter your admin password to access the control panel
          </Text>

          <form onSubmit={handleSubmit} style={{ width: '100%' }}>
            <Flex direction="column" gap="4">
              <TextField.Root style={{ width: '100%' }}>
                <TextField.Input
                  type="password"
                  placeholder="Admin password"
                  value={password}
                  onChange={(e) => setPassword((e.target as HTMLInputElement).value)}
                  required
                />
              </TextField.Root>

              <Button
                type="submit"
                size="3"
                disabled={loading || !password}
                style={{ width: '100%' }}
              >
                {loading ? (
                  <Flex align="center" gap="2">
                    <div className="spinner" style={{ width: '16px', height: '16px' }} />
                    Logging in...
                  </Flex>
                ) : (
                  'Login'
                )}
              </Button>
            </Flex>
          </form>
        </Flex>
      </Card>
    </Flex>
  );
};

export default Login;