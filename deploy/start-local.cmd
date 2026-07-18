@echo off
setlocal
cd /d "%~dp0"

docker compose version >nul 2>&1
if errorlevel 1 (
  echo Docker Desktop is required. Install or start Docker Desktop, then run this file again.
  pause
  exit /b 1
)

if not exist ".env" (
  copy /Y ".env.local.example" ".env" >nul
  if errorlevel 1 (
    echo Failed to create deploy\.env from the local-trial template.
    pause
    exit /b 1
  )
)

docker compose -f docker-compose.release.yml up -d
if errorlevel 1 (
  echo TaskBridge failed to start. Review the Docker output above.
  pause
  exit /b 1
)

set "TASKBRIDGE_READY_URL=http://127.0.0.1:8080/ready"
set /a TASKBRIDGE_READY_ATTEMPT=0

:wait_for_ready
powershell -NoProfile -Command "try { $response = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 '%TASKBRIDGE_READY_URL%'; if ($response.StatusCode -eq 200) { exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 goto ready
set /a TASKBRIDGE_READY_ATTEMPT+=1
if %TASKBRIDGE_READY_ATTEMPT% GEQ 60 goto ready_timeout
timeout /t 2 /nobreak >nul
goto wait_for_ready

:ready_timeout
echo TaskBridge did not become ready within 120 seconds.
echo Review logs with: docker compose -f docker-compose.release.yml logs
pause
exit /b 1

:ready
echo TaskBridge is ready at http://127.0.0.1:8080
start "" "http://127.0.0.1:8080"
pause
