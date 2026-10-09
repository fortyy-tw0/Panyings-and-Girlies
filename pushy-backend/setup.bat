@echo off
REM Pu-shy backend setup (Windows). Run while you still have internet.
REM Creates .venv, installs dependencies, and runs a quick healthcheck.

cd /d "%~dp0"

where python >nul 2>nul
if %errorlevel% neq 0 (
    echo Python not found on PATH. Install Python 3.12+ first.
    exit /b 1
)

if not exist .venv (
    python -m venv .venv
)

if exist vendor (
    .venv\Scripts\python.exe -m pip install --no-index --find-links vendor -r requirements.txt
) else (
    .venv\Scripts\python.exe -m pip install -r requirements.txt
)

.venv\Scripts\python.exe -c "import fastapi, cryptography, sqlite3; sqlite3.connect(':memory:').execute('CREATE VIRTUAL TABLE t USING fts5(x)'); print('setup OK: fastapi, cryptography, FTS5 available')"

REM v2.1: Ollama privacy check — debug logging must be off, and chat is via
REM the local API only (the Ollama desktop window keeps its own history).
if defined OLLAMA_DEBUG (
    echo WARNING: OLLAMA_DEBUG is set — unset it so prompts are not logged.
)
where ollama >nul 2>nul
if %errorlevel% equ 0 (
    echo Ollama found. Use only the local API ^(127.0.0.1:11434^), not the desktop chat window.
) else (
    echo Ollama not found — B2 will install it for the Companion demo.
)

echo.
echo To run the server:
echo   .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8420
