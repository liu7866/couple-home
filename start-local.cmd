@echo off
cd /d "%~dp0"
node --env-file-if-exists=.env dist-node/server.mjs
pause
