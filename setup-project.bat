@echo off
echo ==========================================
echo  AI SETUP - COPY ALL 305 SKILLS
echo ==========================================
echo.

REM Buat folder .agent\skills
mkdir .agent\skills 2>nul

REM Copy semua skill dari global
xcopy /E /I /Y "%USERPROFILE%\.gemini\antigravity\skills\*" ".agent\skills\"

echo.
echo ✅ Done! All skills copied to .agent\skills
echo.
dir /B ".agent\skills" 2>nul | find /C /V "" 
echo skills ready to use
pause