@echo off
chcp 65001 >nul
title 安装后端依赖 - 带日志
cd /d "%~dp0server"
set LOG=%~dp0install-log.txt

echo =========================================== > "%LOG%"
echo   后端依赖安装日志 >> "%LOG%"
echo   %date% %time% >> "%LOG%"
echo =========================================== >> "%LOG%"

echo [检查] Node 版本: >> "%LOG%"
node -v >> "%LOG%" 2>&1
echo [检查] npm 版本: >> "%LOG%"
npm -v >> "%LOG%" 2>&1
echo [检查] 当前目录: >> "%LOG%"
cd >> "%LOG%"

echo.
echo 开始安装，请稍候...（日志写入 install-log.txt）
echo.

call npm install >> "%LOG%" 2>&1
set EXITCODE=%ERRORLEVEL%
echo [退出码] %EXITCODE% >> "%LOG%"

if %EXITCODE% neq 0 (
    echo.
    echo ============================================
    echo   安装失败！退出码：%EXITCODE%
    echo   详细错误已写入 install-log.txt
    echo ============================================
    type "%LOG%"
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   安装成功！
echo ============================================
type "%LOG%"
echo.
pause
