@echo off
SETLOCAL EnableDelayedExpansion
title SentinelVault Dashboard

echo ==============================================================
echo 🛡️  Starting SentinelVault Local Development Environment 🛡️
echo ==============================================================

:: Check for python
python --version >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Python is not installed or not in PATH!
    pause
    exit /b 1
)

:: Check for npm
call npm -v >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [ERROR] NPM is not installed or not in PATH!
    pause
    exit /b 1
)

:: Start the Crypto ML API in a transparent background or split terminal
echo.
echo [1/2] Booting up Crypto Risk Engine (FastAPI on Port 8000)...
start "Crypto ML Engine" cmd /k "color 0a && cd crypto-ml && echo Starting Chainlink ML Server... && python fastapi_server.py"

:: Give the API 3 seconds to spin up
timeout /t 3 /nobreak > nul

:: Start the Front End Application
echo.
echo [2/2] Booting up Next.js Front-End (Port 3000)...
cd SentinelVault

:: We run the front-end directly in this terminal
npm run dev

echo.
pause
