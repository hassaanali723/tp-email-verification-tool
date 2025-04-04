@echo off
REM Run multiple worker instances in parallel based on the WORKER_COUNT setting
REM First, get the WORKER_COUNT from config
FOR /F "tokens=*" %%a IN ('python -c "from app.config import settings; print(settings.WORKER_COUNT)"') DO SET WORKER_COUNT=%%a

echo Starting %WORKER_COUNT% worker instances...

REM Loop to create the specified number of workers
FOR /L %%i IN (1,1,%WORKER_COUNT%) DO (
    echo Starting worker %%i...
    start "Email Validation Worker %%i" python -c "from app.worker import start_worker; import asyncio; asyncio.run(start_worker())"
)

echo All workers started. Press Ctrl+C in each window to stop the workers. 