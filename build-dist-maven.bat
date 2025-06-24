@echo off
echo Building Maven-based distribution package...
echo.

REM Clean up previous build
if exist dist rmdir /s /q dist
mkdir dist
mkdir dist\src

echo Step 1: Copying source files...
copy AutomationRobot.java dist\src\
copy pom.xml dist\

echo Step 2: Creating build script for clients...
echo @echo off> dist\build.bat
echo echo Building Windows Automation Robot...>> dist\build.bat
echo echo.>> dist\build.bat
echo.>> dist\build.bat
echo REM Check for Maven>> dist\build.bat
echo mvn --version ^>nul 2^>^&1>> dist\build.bat
echo if %%ERRORLEVEL%% neq 0 (>> dist\build.bat
echo     echo ERROR: Maven not found!>> dist\build.bat
echo     echo Please install Maven from https://maven.apache.org/download.cgi>> dist\build.bat
echo     echo Or use: winget install Apache.Maven>> dist\build.bat
echo     pause>> dist\build.bat
echo     exit /b 1>> dist\build.bat
echo )>> dist\build.bat
echo.>> dist\build.bat
echo echo Compiling Java source...>> dist\build.bat
echo javac -cp "target/dependency/*" src/AutomationRobot.java -d target/classes>> dist\build.bat
echo if %%ERRORLEVEL%% neq 0 (>> dist\build.bat
echo     echo Trying with Maven...>> dist\build.bat
echo     mvn clean compile>> dist\build.bat
echo )>> dist\build.bat
echo.>> dist\build.bat
echo echo Building JAR with dependencies...>> dist\build.bat
echo mvn clean package>> dist\build.bat
echo.>> dist\build.bat
echo if exist target\AutomationRobot-jar-with-dependencies.jar (>> dist\build.bat
echo     echo.>> dist\build.bat
echo     echo Build successful!>> dist\build.bat
echo     echo JAR created: target\AutomationRobot-jar-with-dependencies.jar>> dist\build.bat
echo     echo.>> dist\build.bat
echo     echo Copying to current directory...>> dist\build.bat
echo     copy target\AutomationRobot-jar-with-dependencies.jar AutomationRobot.jar>> dist\build.bat
echo ) else (>> dist\build.bat
echo     echo Build failed!>> dist\build.bat
echo )>> dist\build.bat
echo pause>> dist\build.bat

echo Step 3: Creating alternative build script (no Maven)...
echo @echo off> dist\build-simple.bat
echo echo Simple build without Maven...>> dist\build-simple.bat
echo echo.>> dist\build-simple.bat
echo echo Step 1: Download json-20211205.jar from:>> dist\build-simple.bat
echo echo https://repo1.maven.org/maven2/org/json/json/20211205/json-20211205.jar>> dist\build-simple.bat
echo echo.>> dist\build-simple.bat
echo echo Step 2: Place it in this directory>> dist\build-simple.bat
echo echo.>> dist\build-simple.bat
echo echo Step 3: Compile with:>> dist\build-simple.bat
echo echo javac -cp "json-20211205.jar;." src/AutomationRobot.java>> dist\build-simple.bat
echo echo.>> dist\build-simple.bat
echo echo Step 4: Run with:>> dist\build-simple.bat
echo echo java -cp "json-20211205.jar;." AutomationRobot>> dist\build-simple.bat
echo pause>> dist\build-simple.bat

echo Step 4: Copying Node.js files...
copy automation-cli.js dist\
copy package.json dist\ 2>nul

echo Step 5: Copying example flows...
if exist flows\*.json (
    mkdir dist\flows
    copy flows\*.json dist\flows\
)
if exist example-notepad.json (
    if not exist dist\flows mkdir dist\flows
    copy example-notepad.json dist\flows\
)

echo Step 6: Creating run script...
echo @echo off> dist\run.bat
echo echo Starting Windows Automation System...>> dist\run.bat
echo echo.>> dist\run.bat
echo.>> dist\run.bat
echo REM Check if JAR exists>> dist\run.bat
echo if not exist AutomationRobot.jar (>> dist\run.bat
echo     echo AutomationRobot.jar not found!>> dist\run.bat
echo     echo Please run build.bat first.>> dist\run.bat
echo     pause>> dist\run.bat
echo     exit /b 1>> dist\run.bat
echo )>> dist\run.bat
echo.>> dist\run.bat
echo if not exist clicks.json (>> dist\run.bat
echo     echo Creating empty clicks.json...>> dist\run.bat
echo     echo {"contexts":{"_root":{"clicks":{},"subcontexts":{}}}}^> clicks.json>> dist\run.bat
echo )>> dist\run.bat
echo if not exist flows mkdir flows>> dist\run.bat
echo if not exist logs mkdir logs>> dist\run.bat
echo.>> dist\run.bat
echo echo Starting automation...>> dist\run.bat
echo node automation-cli.js>> dist\run.bat

echo Step 7: Creating README...
echo # Windows Automation System> dist\README.md
echo.>> dist\README.md
echo ## Requirements>> dist\README.md
echo - Windows OS>> dist\README.md
echo - Java 11 or higher>> dist\README.md
echo - Node.js 12.18 or higher>> dist\README.md
echo - Maven (optional, for easier building)>> dist\README.md
echo.>> dist\README.md
echo ## Building>> dist\README.md
echo.>> dist\README.md
echo ### Option 1: With Maven (Recommended)>> dist\README.md
echo 1. Install Maven if not already installed>> dist\README.md
echo 2. Run `build.bat`>> dist\README.md
echo 3. This will create AutomationRobot.jar>> dist\README.md
echo.>> dist\README.md
echo ### Option 2: Without Maven>> dist\README.md
echo 1. Download json-20210307.jar from Maven Central>> dist\README.md
echo 2. Follow instructions in `build-simple.bat`>> dist\README.md
echo.>> dist\README.md
echo ## Running>> dist\README.md
echo 1. After building, run `run.bat`>> dist\README.md
echo 2. Use `help` command to see available commands>> dist\README.md
echo.>> dist\README.md
echo ## Project Structure>> dist\README.md
echo - `src/AutomationRobot.java` - Java automation code>> dist\README.md
echo - `automation-cli.js` - Node.js CLI interface>> dist\README.md
echo - `pom.xml` - Maven project file>> dist\README.md
echo - `flows/` - Automation flow definitions>> dist\README.md
echo - `logs/` - Execution logs (created at runtime)>> dist\README.md

echo Step 8: Creating install checker...
copy install.bat dist\ 2>nul
if not exist dist\install.bat (
    REM Create simple version check
    echo @echo off> dist\check-requirements.bat
    echo echo Checking requirements...>> dist\check-requirements.bat
    echo java -version>> dist\check-requirements.bat
    echo node --version>> dist\check-requirements.bat
    echo mvn --version 2^>nul ^|^| echo Maven not found (optional)>> dist\check-requirements.bat
    echo pause>> dist\check-requirements.bat
)

echo.
echo ===== BUILD COMPLETE =====
echo Distribution created in: dist\
echo.
echo Contents:
dir /b dist\
echo.
echo Clients can build with Maven using: cd dist ^& build.bat
echo.
pause