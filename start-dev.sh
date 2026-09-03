#!/bin/bash

# Ensure we cleanly shut down any background processes when exiting
trap 'kill 0' EXIT INT TERM

echo "=============================================================="
echo "🛡️  Starting SentinelVault Local Development Environment (UNIX) "
echo "=============================================================="

# Define directories
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$ROOT_DIR/SentinelVault"
ML_DIR="$ROOT_DIR/crypto-ml"
ML_PYTHON="$ML_DIR/.venv/bin/python"

# Check for python
if [[ ! -x "$ML_PYTHON" ]] && ! command -v python3 >/dev/null 2>&1; then
  echo -e "\033[31m[ERROR]\033[0m python3 is not installed or not in PATH!"
  exit 1
fi

# Check for npm
if ! command -v npm >/dev/null 2>&1; then
  echo -e "\033[31m[ERROR]\033[0m npm is not installed or not in PATH!"
  exit 1
fi

echo -e "\n\033[36m[1/2] Booting up Crypto Risk Engine (FastAPI on Port 8000)...\033[0m"
cd "$ML_DIR"
if [[ -x "$ML_PYTHON" ]]; then
  PYTHON_CMD="$ML_PYTHON"
else
  PYTHON_CMD="python3"
fi
# Run the FastAPI server in the background
"$PYTHON_CMD" fastapi_server.py &
API_PID=$!

# Wait 3 seconds for the model to load into memory
sleep 3

echo -e "\n\033[32m[2/2] Booting up Next.js Front-End (Port 3000)...\033[0m"
cd "$APP_DIR"
# Run Next.js in the foreground
npm run dev
