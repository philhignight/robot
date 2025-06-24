@echo off
echo Starting Windows Automation System...
echo.

REM Check if JAR exists
if not exist AutomationRobot.jar (
    echo AutomationRobot.jar not found!
    echo Please run build.bat first.
    pause
    exit /b 
)

if not exist clicks.json (
    echo Creating empty clicks.json...
    echo {"contexts":{"_root":{"clicks":{},"subcontexts":{}}}}> clicks.json
)
if not exist flows mkdir flows
if not exist logs mkdir logs

echo Starting automation...
node automation-cli.js
