@echo off
echo Testing distribution build...
echo.

if not exist dist\AutomationRobot.jar (
    echo ERROR: dist\AutomationRobot.jar not found!
    echo Please run build-dist.bat first.
    pause
    exit /b 1
)

echo Testing standalone JAR...
cd dist
java -jar AutomationRobot.jar test
cd ..

echo.
echo If the test passed, the distribution is ready!
pause