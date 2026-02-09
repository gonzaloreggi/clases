@echo off
title Herramientas de parseo (Next.js)
:: Request admin rights (avoids EPERM when running npm)
>nul 2>&1 "%SYSTEMROOT%\system32\cacls.exe" "%SYSTEMROOT%\system32\config\system"
if '%errorlevel%' NEQ '0' (
  echo Solicitando permisos de administrador...
  goto UACPrompt
) else ( goto gotAdmin )

:UACPrompt
  echo Set UAC = CreateObject^("Shell.Application"^) > "%temp%\getadmin.vbs"
  echo UAC.ShellExecute "%~s0", "", "", "runas", 1 >> "%temp%\getadmin.vbs"
  "%temp%\getadmin.vbs"
  exit /B

:gotAdmin
  cd /d "%~dp0"
  echo Iniciando servidor Next.js...
  start "Servidor - Herramientas de parseo" cmd /k "npm run dev"
  timeout /t 6 /nobreak >nul
  start http://localhost:3000/
  echo.
  echo Navegador abierto en http://localhost:3000
  echo Deja la ventana "Servidor" abierta mientras uses la app.
  timeout /t 3 /nobreak >nul
