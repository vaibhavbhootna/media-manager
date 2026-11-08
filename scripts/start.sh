#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Starting Media Manager Daemon ==="

cd "$DIR/backend"
swift build

nohup "$DIR/backend/.build/debug/backend" > "$DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$DIR/.backend.pid"

cd "$DIR/frontend"
npm run build
nohup npx vite preview --port 3000 --host "::" > "$DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$DIR/.frontend.pid"

echo "Media Manager started successfully."
echo "Frontend: http://localhost:3000"
echo "Backend:  http://127.0.0.1:8080 (PID $BACKEND_PID)"
