@echo off
echo Compiling Java Robot...

REM Check if json jar exists
if not exist "json-20210307.jar" (
    echo ERROR: json-20210307.jar not found!
    echo Please download from: https://repo1.maven.org/maven2/org/json/json/20210307/json-20210307.jar
    pause
    exit /b 1
)

REM Compile Java
javac -cp "json-20210307.jar;." AutomationRobot.java

if %ERRORLEVEL% neq 0 (
    echo Compilation failed!
    pause
    exit /b 1
)

echo Compilation successful!
echo Starting automation CLI...
echo.

REM Clean up any existing files
if exist input.txt del input.txt
if exist output.txt del output.txt

REM Run Node.js CLI
node automation-cli.js