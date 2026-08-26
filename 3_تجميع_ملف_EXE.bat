@echo off
chcp 65001 >nul
title تجميع برنامج واتساب جماعي - EXE Builder
cd /d "%~dp0"

echo ======================================================
echo    [WhatsApp Bulk Sender] Building EXE Package...
echo ======================================================
echo.

npx electron-packager . "WhatsApp Flow Pro" --platform=win32 --arch=x64 --out=dist --icon=icon.ico --asar --ignore="^/(data|\.wwebjs_auth|\.wwebjs_cache|uploads|dist|\.git|scratch|keygen\.js|2_.*|3_.*|لوحة.*|.*\.zip)" --overwrite

echo.
echo ======================================================
echo    [Done] Packaged successfully in: dist\WhatsApp Flow Pro-win32-x64
echo ======================================================
echo.

pause
