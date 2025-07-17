# Multi-stage build for optimal image size
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install && npm cache clean --force

# Copy source code
COPY src/ ./src/
COPY vite.config.ts ./

# Add a cache-busting argument
ARG BUILD_DATE=unknown
RUN echo "Build date: ${BUILD_DATE}"

# Build the application
RUN npm run build

# Production image
FROM node:18-alpine

# Install required system packages for MCP servers
RUN apk add --no-cache \
    python3 \
    py3-pip \
    curl \
    bash \
    git

# Install uvx for MCP server support (npx is already included with Node.js)
RUN pip3 install --break-system-packages uv

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S openai-proxy -u 1001

# Set working directory
WORKDIR /app

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm install --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# Copy migration files
COPY migrations/ ./migrations/
COPY migrate.js ./

# Change ownership to app user
RUN chown -R openai-proxy:nodejs /app

# Create a script to ensure credentials directory exists with correct permissions
RUN echo '#!/bin/sh' > /usr/local/bin/init-credentials.sh && \
    echo 'mkdir -p /home/openai-proxy/.google_workspace_mcp/credentials' >> /usr/local/bin/init-credentials.sh && \
    echo 'chown -R openai-proxy:nodejs /home/openai-proxy/.google_workspace_mcp' >> /usr/local/bin/init-credentials.sh && \
    echo 'exec su-exec openai-proxy "$@"' >> /usr/local/bin/init-credentials.sh && \
    chmod +x /usr/local/bin/init-credentials.sh

# Install su-exec for clean user switching
RUN apk add --no-cache su-exec

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
ENTRYPOINT ["/usr/local/bin/init-credentials.sh"]
CMD ["npm", "start"]