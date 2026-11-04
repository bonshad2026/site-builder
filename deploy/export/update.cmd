@echo off
rem Windows: double-click to apply this design update to the installed site (needs Docker Desktop).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1"
pause
