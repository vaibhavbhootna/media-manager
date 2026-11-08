#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Starting Media Manager in Development Mode ==="

cd "$DIR/backend"
echo "-> Building Swift backend..."
swift build

echo "-> Starting Swift backend on http://127.0.0.1:8080..."
"$DIR/backend/.build/debug/backend" &
BACKEND_PID=$!
echo "$BACKEND_PID" > "$DIR/.backend.pid"

cd "$DIR/frontend"
echo "-> Starting Vite frontend on http://localhost:3000..."
npm run dev &
FRONTEND_PID=$!
echo "$FRONTEND_PID" > "$DIR/.frontend.pid"

echo ""
echo "=========================================================="
echo " Media Manager running!"
echo " Frontend: http://localhost:3000"
echo " Backend:  http://127.0.0.1:8080"
echo " Stop with: ./scripts/stop.sh"
echo "=========================================================="

wait $BACKEND_PID $FRONTEND_PID
