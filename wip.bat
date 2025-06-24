@echo off
echo ===================================
echo Git WIP Quick Commit and Push
echo ===================================

echo.
echo Current branch:
git branch --show-current
echo.

echo Adding all changes...
git add .

echo.
echo Committing with message "wip"...
git commit -m "wip"

if %errorlevel% neq 0 (
    echo.
    echo No changes to commit!
    pause
    exit /b
)

echo.
echo Pushing to remote...
git push

if %errorlevel% neq 0 (
    echo.
    echo Push failed! You might need to run:
    echo git push -u origin wip
    pause
    exit /b
)

echo.
echo ===================================
echo Successfully committed and pushed!
echo ===================================
pause