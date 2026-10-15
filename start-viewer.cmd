@echo off
rem Double-click to open the siddur viewer in your browser. Close this window to stop it.
cd /d "%~dp0"
set "NODE=%USERPROFILE%\Tools\node-v24.22.0-win-x64\node.exe"
if not exist "%NODE%" set "NODE=node"
start "" http://localhost:8080
"%NODE%" serve.mjs
pause
