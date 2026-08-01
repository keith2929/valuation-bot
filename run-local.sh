#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_PORT="${PORT:-4501}"
APP_PORT="${APP_PORT:-4502}"
APP_URL="http://localhost:${APP_PORT}"

cleanup() {
  if [[ -n "${api_pid:-}" ]] && kill -0 "$api_pid" 2>/dev/null; then
    kill "$api_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

cd "$ROOT_DIR"
pnpm --filter @valuation-bot/orchestrator build
PORT="$API_PORT" node server.js &
api_pid=$!

echo "API: http://localhost:${API_PORT}"
echo "App: ${APP_URL}"
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$APP_URL" >/dev/null 2>&1 || true
elif command -v open >/dev/null 2>&1; then
  open "$APP_URL" >/dev/null 2>&1 || true
fi

VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://localhost:${API_PORT}}" \
VITE_DEV_HOST="0.0.0.0" \
VITE_DEV_PORT="$APP_PORT" \
  pnpm --filter @valuation-bot/valuation-creator-app dev
