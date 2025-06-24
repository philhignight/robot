@echo off
echo Building distribution package...
echo.

REM Clean up previous build
if exist dist rmdir /s /q dist
if exist temp rmdir /s /q temp
if exist AutomationRobot.jar del AutomationRobot.jar

REM Create directories
mkdir dist
mkdir temp

REM Check if json jar exists
if not exist "json-20210307.jar" (
    echo ERROR: json-20210307.jar not found!
    echo Please download from: https://repo1.maven.org/maven2/org/json/json/20210307/json-20210307.jar
    pause
    exit /b 1
)

echo Step 1: Compiling Java...
javac -cp "json-20210307.jar;." AutomationRobot.java
if %ERRORLEVEL% neq 0 (
    echo Compilation failed!
    pause
    exit /b 1
)

echo Step 2: Extracting dependencies...
cd temp
jar xf ..\json-20210307.jar
cd ..

echo Step 3: Creating manifest...
echo Manifest-Version: 1.0> temp\MANIFEST.MF
echo Main-Class: AutomationRobot>> temp\MANIFEST.MF
echo.>> temp\MANIFEST.MF

echo Step 4: Building fat JAR...
copy AutomationRobot*.class temp\
cd temp
jar cfm ..\AutomationRobot.jar MANIFEST.MF AutomationRobot*.class org\*
cd ..

echo Step 5: Copying to dist...
move AutomationRobot.jar dist\
copy automation-cli.js dist\
copy package.json dist\ 2>nul

echo Step 6: Copying example flows...
if exist flows\*.json (
    mkdir dist\flows
    copy flows\*.json dist\flows\
    echo Copied example flows
) else (
    echo No example flows found
    REM Create at least one example
    if not exist flows mkdir flows
    if exist example-notepad.json (
        mkdir dist\flows
        copy example-notepad.json dist\flows\
    )
)

echo Step 6: Creating run script for dist...
echo @echo off> dist\run.bat
echo echo Starting Windows Automation System...>> dist\run.bat
echo echo.>> dist\run.bat
echo if not exist clicks.json (>> dist\run.bat
echo     echo Creating empty clicks.json...>> dist\run.bat
echo     echo {"contexts":{"_root":{"clicks":{},"subcontexts":{}}}}^> clicks.json>> dist\run.bat
echo )>> dist\run.bat
echo if not exist flows mkdir flows>> dist\run.bat
echo if not exist logs mkdir logs>> dist\run.bat
echo echo Starting automation...>> dist\run.bat
echo node automation-cli.js>> dist\run.bat

echo Step 7: Creating dist README...
echo # Windows Automation System - Distribution> dist\README.txt
echo.>> dist\README.txt
echo ## Requirements:>> dist\README.txt
echo - Windows OS>> dist\README.txt
echo - Node.js 12.18 or higher>> dist\README.txt
echo - Java 11 or higher>> dist\README.txt
echo.>> dist\README.txt
echo ## To Run:>> dist\README.txt
echo 1. Copy all files to your desired location>> dist\README.txt
echo 2. Double-click run.bat>> dist\README.txt
echo.>> dist\README.txt
echo ## Files:>> dist\README.txt
echo - AutomationRobot.jar - Contains all Java automation code>> dist\README.txt
echo - automation-cli.js - Node.js CLI interface>> dist\README.txt
echo - run.bat - Launcher script>> dist\README.txt
echo.>> dist\README.txt
echo ## First Time Setup:>> dist\README.txt
echo The system will create these folders automatically:>> dist\README.txt
echo - flows/ - Put your flow JSON files here>> dist\README.txt
echo - logs/ - Execution logs and screenshots>> dist\README.txt
echo - clicks.json - Click recordings (auto-created)>> dist\README.txt

echo Step 8: Cleaning up...
rmdir /s /q temp
del AutomationRobot*.class

echo.
echo ===== BUILD COMPLETE =====
echo Distribution created in: dist\
echo.
echo Contents:
dir /b dist\
echo.
echo The dist folder can be copied to any Windows machine with Node.js and Java.
echo.
pause