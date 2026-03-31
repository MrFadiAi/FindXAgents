#!/usr/bin/env bash
# FindX Startup Script
# Run this from the project root: bash start.sh
#
# Prerequisites: Fill in .env with your API keys before running.

set -e

echo "=== FindX Startup ==="

# 0. Check .env
if [ ! -f .env ]; then
  echo "ERROR: .env file not found. Copy .env.example to .env and fill in your API keys."
  exit 1
fi

# 1. Start infrastructure
echo ""
echo "[1/4] Starting PostgreSQL and Redis..."
docker compose up -d
echo "Waiting for PostgreSQL to be ready..."
sleep 5

# 2. Run migrations
echo ""
echo "[2/4] Running database migrations..."
npx prisma migrate dev --name init

# 3. Seed the database
echo ""
echo "[3/4] Seeding database..."
npm run db:seed

# 4. Start API server
echo ""
echo "[4/4] Starting API server on port 3001..."
npm run dev

echo ""
echo "=== FindX API running ==="
echo "  API:      http://localhost:3001/api/health"
