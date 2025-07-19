# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an OpenAI API Proxy Server that acts as a transparent proxy for the OpenAI API while adding custom functionality including tool injection, MCP (Model Context Protocol) server support, conversation logging, and an admin interface.

## Development Commands

### Essential Commands
```bash
# Install dependencies
npm install

use ./build_and_deploy.sh to build and run the app
```

### Docker Commands
```bash
# Start full stack (app + PostgreSQL)
docker-compose up -d

# View logs
docker-compose logs -f

# Rebuild containers
docker-compose build
```

## Architecture Overview

### Core Components

1. **API Proxy Handler** (`src/api/proxy-handler.ts`)
   - Intercepts OpenAI API requests
   - Injects tools based on API key permissions
   - Maintains streaming response compatibility
   - Logs conversations and token usage

2. **Tool System**
   - **Custom Tools** (`src/services/tool-service.ts`): JavaScript functions executed in sandbox
   - **MCP Servers** (`src/services/mcp-service.ts`): External tool servers using Model Context Protocol
   - Tools are dynamically injected into OpenAI conversations based on API key assignments

3. **Database Schema** (`src/db/schema.ts`)
   - Uses Drizzle ORM with PostgreSQL
   - Key tables: apiKeys, conversations, messages, tools, mcpServers, toolExecutions
   - Migrations in `/migrations` directory
   - Auto-migration on startup

4. **Authentication Middleware** (`src/middleware/auth.ts`)
   - API Key authentication for proxy endpoints
   - JWT authentication for admin endpoints
   - Supports anonymous access when configured

5. **Admin Frontend** (`src/admin/`)
   - React SPA built with Vite
   - Manages API keys, tools, conversations, and upstream servers
   - Uses React Query for data fetching and Radix UI for components

### Key Patterns

- **Service Layer Pattern**: Business logic separated into service classes
- **Middleware Chain**: Express middleware for auth, logging, error handling
- **Streaming Response Handling**: Maintains OpenAI streaming compatibility
- **Tool Sandboxing**: Custom tools run in isolated context with limited permissions

## Testing Approach

Tests are located in `/tests` directory mirroring the source structure. Use Jest with ts-jest preset. Focus on testing services and middleware logic.

## Environment Configuration

Required environment variables:
- `DATABASE_*`: PostgreSQL connection details
- `JWT_SECRET`: For admin authentication
- `ADMIN_PASSWORD`: Initial admin password
- `PORT`: Server port (default: 3002)

Optional:
- `OPENAI_API_KEY`: Default API key if not provided by client
- `LOG_LEVEL`: Logging verbosity

## Important Notes

- The proxy maintains full OpenAI API compatibility while adding custom features
- Tool injection happens transparently - the client doesn't need to know about proxy-added tools
- MCP servers are spawned as child processes and communicate via stdio
- Conversation logging includes token usage and costs calculation
- The admin interface is served from the same Express app at `/admin`
- Database migrations run automatically on startup in production
