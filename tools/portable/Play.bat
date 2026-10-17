@echo off
rem First start: makes the "Megumin" shortcuts (desktop, Start menu) and opens the game.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0app\serve.ps1" -Install
if errorlevel 1 pause
