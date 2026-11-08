#!/bin/bash

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Stopping Media Manager Services ==="

if [ -f "$DIR/.backend.pid" ]; then
  PID=$(cat "$DIR/.backend.pid")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping backend (PID $PID)..."
    kill "$PID" || true
  fi
  rm -f "$DIR/.backend.pid"
fi

if [ -f "$DIR/.frontend.pid" ]; then
  PID=$(cat "$DIR/.frontend.pid")
  if ps -p "$PID" > /dev/null 2>&1; then
    echo "Stopping frontend (PID $PID)..."
    kill "$PID" || true
  fi
  rm -f "$DIR/.frontend.pid"
fi

# Kill any leftover servers on port 8080 and 3000
lsof -ti:8080 | xargs kill -9 > /dev/null 2>&1 || true
lsof -ti:3000 | xargs kill -9 > /dev/null 2>&1 || true

echo "All services stopped."

