@echo off
title Auto Deploy to Google Apps Script - PPA Safe & Strong
color 0b
cls

echo ======================================================================
echo   PPA SAFE & STRONG - AUTO DEPLOY TO GOOGLE APPS SCRIPT
echo ======================================================================
echo.
echo Menjalankan proses bundle dan upload ke Google Apps Script...
echo Script ID: 1Tu0W0R3rYpkf2tJq3cgSL7xmUlGfm6lWBy0M6CBW2UWPQI4beG2qIvAs
echo.

cd /d "%~dp0"
node gas_deploy\deploy.js

echo.
echo ======================================================================
echo   Proses Selesai.
echo ======================================================================
echo.
pause
