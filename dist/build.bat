@echo off
echo Building Windows Automation Robot...
echo.

REM Check for Maven
mvn --version >nul 2>&
if %ERRORLEVEL% neq 0 (
    echo ERROR: Maven not found!
    echo Please install Maven from https://maven.apache.org/download.cgi
    echo Or use: winget install Apache.Maven
    pause
    exit /b 
)

echo Compiling Java source...
javac -cp "target/dependency/*" src/AutomationRobot.java -d target/classes
if %ERRORLEVEL% neq 0 (
    echo Trying with Maven...
    mvn clean compile
)

echo Building JAR with dependencies...
mvn clean package

if exist target\AutomationRobot-jar-with-dependencies.jar (
    echo.
    echo Build successful!
    echo JAR created: target\AutomationRobot-jar-with-dependencies.jar
    echo.
    echo Copying to current directory...
    copy target\AutomationRobot-jar-with-dependencies.jar AutomationRobot.jar
) else (
    echo Build failed!
)
pause
