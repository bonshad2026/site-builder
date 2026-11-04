@echo off
rem Downloads the template photos into var\demo-images (needs access to unsplash.com, e.g. a VPN).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0download-photos.ps1"
pause
