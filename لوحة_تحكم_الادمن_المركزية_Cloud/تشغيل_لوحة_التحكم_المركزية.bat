@echo off
chcp 65001 >nul
title WhatsApp Flow Pro - Master Admin Cloud Server
cd /d "%~dp0"

echo ======================================================
echo    👑 [WhatsApp Flow Pro] Master Admin Hub Starting...
echo ======================================================
echo.

start "" http://localhost:5000
node server.js

pause
