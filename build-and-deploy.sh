#!/bin/bash

# Build and deploy with cache busting
# NOTE: This script preserves all data - it NEVER uses -v flag or clears volumes
echo "Building with timestamp: $(date)"

# Build with cache busting
docker compose build --build-arg BUILD_DATE="$(date)" --no-cache

# Deploy WITHOUT touching volumes/data
docker compose up -d

echo "Build and deploy complete!"
echo "Database and volumes preserved."