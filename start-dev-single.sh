#!/bin/zsh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$ROOT_DIR/SentinelVault"
ML_DIR="$ROOT_DIR/crypto-ml"
ML_PYTHON="$ML_DIR/.venv/bin/python"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is not installed."
  exit 1
fi

if [[ ! -x "$ML_PYTHON" ]] && ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is not installed."
  exit 1
fi

cleanup() {
  if [[ -n "${ML_PID:-}" ]] && kill -0 "$ML_PID" >/dev/null 2>&1; then
    kill "$ML_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

cd "$ML_DIR"
if [[ -x "$ML_PYTHON" ]]; then
  PYTHON_CMD="$ML_PYTHON"
else
  PYTHON_CMD="python3"
fi

PORT=8000 "$PYTHON_CMD" fastapi_server.py &
ML_PID=$!

echo "Crypto ML API started with PID $ML_PID"

cd "$APP_DIR"
npm run dev
