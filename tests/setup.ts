import { beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';

// Test database setup
const testDbConfig = {
  host: process.env.TEST_DATABASE_HOST || 'localhost',
  port: parseInt(process.env.TEST_DATABASE_PORT || '5432'),
  database: process.env.TEST_DATABASE_NAME || 'openai_proxy_test',
  user: process.env.TEST_DATABASE_USER || 'postgres',
  password: process.env.TEST_DATABASE_PASSWORD || 'password',
};

let testPool: Pool;

beforeAll(async () => {
  // Create test database connection
  testPool = new Pool(testDbConfig);
  
  // Run migrations or setup test schema here if needed
  // await runTestMigrations(testPool);
});

afterAll(async () => {
  if (testPool) {
    await testPool.end();
  }
});

beforeEach(async () => {
  // Clean up test data before each test
  if (testPool) {
    await testPool.query('TRUNCATE TABLE api_keys, tools, api_key_tools, conversations, messages, tool_executions RESTART IDENTITY CASCADE');
  }
});

export { testPool };