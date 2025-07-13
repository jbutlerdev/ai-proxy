#!/bin/bash

echo "⚠️  WARNING: This will DELETE ALL DATA including your database! ⚠️"
echo "This script will:"
echo "- Stop all containers"
echo "- Delete all volumes (DATABASE WILL BE LOST)"
echo "- Clear all Docker cache"
echo "- Rebuild everything from scratch"
echo ""
echo "Press Ctrl+C now to cancel, or wait 10 seconds to continue..."

# Give user time to cancel
sleep 10

echo "Starting destructive reset..."

# Stop and remove everything including volumes
docker compose down -v

# Clear all Docker resources
docker system prune -af --volumes

# Rebuild and start fresh
docker compose build --build-arg BUILD_DATE="$(date)" --no-cache
docker compose up -d

echo "Complete reset finished. ALL DATA HAS BEEN LOST."