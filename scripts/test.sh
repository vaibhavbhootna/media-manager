#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Running Media Manager Automated Test Suite ==="

cd "$DIR/backend"
swift run test-runner

echo ""
echo "=== Building Frontend Production Bundle ==="
cd "$DIR/frontend"
npm run build

echo ""
echo "🎉 ALL TESTS & BUILDS PASSED SUCCESSFULLY!"

