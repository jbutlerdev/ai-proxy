# OpenAI API Proxy Server

A comprehensive OpenAI API proxy with tool injection, MCP server support, and admin interface.

## Features

- **Transparent OpenAI API Proxy**: Fully compatible with OpenAI API specification
- **Tool Injection**: Automatically inject custom tools and MCP servers into conversations
- **MCP Server Support**: Support for Model Context Protocol servers with npx and uvx
- **Admin Web Interface**: Manage API keys, tools, and view conversations
- **Conversation Logging**: Complete logging with token usage and performance metrics
- **Docker Support**: Easy deployment with Docker Compose
- **Comprehensive Testing**: Full unit test coverage

## Quick Start

### Using Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd openai-proxy-server
```

2. Copy environment file:
```bash
cp .env.example .env
```

3. Edit `.env` with your configuration:
```bash
# Required: Set a secure JWT secret
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Optional: Set admin password (default: admin123)
ADMIN_PASSWORD=your-admin-password

# Optional: Set default OpenAI API key
OPENAI_API_KEY=sk-your-openai-api-key
```

4. Start the services:
```bash
docker-compose up -d
```

5. Access the admin interface at http://localhost:3000

### Manual Installation

1. Install dependencies:
```bash
npm install
```

2. Set up PostgreSQL database and update `.env`

3. Run migrations:
```bash
npm run migrate
```

4. Build the application:
```bash
npm run build
```

5. Start the server:
```bash
npm start
```

## Usage

### Admin Interface

1. Login at http://localhost:3000 with your admin password
2. Create API keys for your applications
3. Configure tools (custom functions or MCP servers)
4. Assign tools to API keys
5. Monitor conversations and performance

### API Usage

Use the proxy as a drop-in replacement for OpenAI API:

```javascript
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: 'your-proxy-api-key', // API key from the admin interface
  baseURL: 'http://localhost:3000/v1',
});

const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'Hello!' }],
});
```

### Tool Configuration

#### Custom Function Tools

```javascript
// Example: Calculator tool
{
  \"name\": \"calculator\",
  \"description\": \"Perform mathematical calculations\",
  \"type\": \"function\",
  \"parameters\": {
    \"type\": \"object\",
    \"properties\": {
      \"expression\": {
        \"type\": \"string\",
        \"description\": \"Mathematical expression to evaluate\"
      }
    },
    \"required\": [\"expression\"]
  },
  \"implementation\": \"return { result: eval(args.expression) };\"
}
```

#### MCP Server Tools

```javascript
// Example: Filesystem MCP server
{
  \"name\": \"read_file\",
  \"description\": \"Read file contents\",
  \"type\": \"mcp\",
  \"parameters\": {
    \"type\": \"object\",
    \"properties\": {
      \"path\": {
        \"type\": \"string\",
        \"description\": \"File path to read\"
      }
    },
    \"required\": [\"path\"]
  },
  \"mcpServerCommand\": \"npx @modelcontextprotocol/server-filesystem /path/to/allowed/directory\"
}
```

## API Endpoints

### Proxy Endpoints
- `POST /v1/chat/completions` - OpenAI chat completions (with tool injection)

### Admin Endpoints
- `POST /api/admin/login` - Admin authentication
- `GET /api/admin/api-keys` - List API keys
- `POST /api/admin/api-keys` - Create API key
- `PATCH /api/admin/api-keys/:id` - Update API key
- `GET /api/admin/tools` - List tools
- `POST /api/admin/tools` - Create tool
- `PATCH /api/admin/tools/:id` - Update tool
- `GET /api/admin/conversations` - List conversations
- `GET /api/admin/conversations/:id` - Get conversation details

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment | `development` |
| `DATABASE_HOST` | PostgreSQL host | `localhost` |
| `DATABASE_PORT` | PostgreSQL port | `5432` |
| `DATABASE_NAME` | Database name | `openai_proxy` |
| `DATABASE_USER` | Database user | `postgres` |
| `DATABASE_PASSWORD` | Database password | `password` |
| `JWT_SECRET` | JWT signing secret | `secret` |
| `ADMIN_PASSWORD` | Admin panel password | `admin123` |
| `OPENAI_API_KEY` | Default OpenAI API key | - |
| `LOG_LEVEL` | Logging level | `info` |

### Database Schema

The application uses PostgreSQL with the following tables:
- `api_keys` - API key management
- `tools` - Tool definitions
- `api_key_tools` - Tool assignments to API keys
- `conversations` - Conversation metadata
- `messages` - Individual messages and responses
- `tool_executions` - Tool execution logs

## Development

### Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Development Server

```bash
npm run dev
```

### Linting and Type Checking

```bash
npm run lint
npm run typecheck
```

## Security Considerations

1. **JWT Secret**: Use a strong, unique JWT secret in production
2. **Admin Password**: Change the default admin password
3. **API Keys**: Regularly rotate API keys
4. **Tool Security**: Carefully review custom tool implementations
5. **MCP Servers**: Only use trusted MCP servers
6. **Database**: Secure PostgreSQL with proper authentication
7. **Network**: Use HTTPS in production
8. **Container Security**: Keep Docker images updated

## Performance

- Conversation logging is optimized for high throughput
- Database queries use proper indexing
- Tool execution is isolated and timeout-protected
- Streaming responses are efficiently handled
- Token counting provides accurate usage metrics

## Troubleshooting

### Common Issues

1. **Database Connection**: Ensure PostgreSQL is running and credentials are correct
2. **Migration Errors**: Check database permissions and schema
3. **Tool Execution**: Verify tool implementations and MCP server commands
4. **API Key Issues**: Ensure API keys are active and properly formatted
5. **Admin Access**: Check JWT secret and admin password configuration

### Logs

Check Docker logs for detailed error information:
```bash
docker-compose logs app
docker-compose logs postgres
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Write tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## License

MIT License - see LICENSE file for details.