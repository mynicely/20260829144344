@echo off
chcp 65001 >nul
title 翰墨裂变系统 - 一键启动
cd /d "%~dp0"

echo ================================================
echo   翰墨裂变·线上书法培训系统 - 一键启动
echo ================================================
echo.

rem ---- 检查 Node 是否安装 ----
where node >nul 2>nul
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装 Node.js 22.5+ 后再运行本脚本。
    echo 下载地址: https://nodejs.org （请选择 22.5 及以上版本）
    pause
    exit /b 1
)
echo [OK] Node 已安装: 
node -v

rem ---- 检查后端依赖，缺失则安装 ----
if not exist "server\node_modules" (
    echo.
    echo [安装] 正在安装后端依赖...
    cd /d "%~dp0server"
    call npm install
    cd /d "%~dp0"
)
echo [OK] 后端依赖就绪

rem ---- 检查前端依赖，缺失则安装 ----
if not exist "web\node_modules" (
    echo.
    echo [安装] 正在安装前端依赖...
    cd /d "%~dp0web"
    call npm install
    cd /d "%~dp0"
)
echo [OK] 前端依赖就绪

echo.
echo 正在启动前后端服务...
echo 后端: http://localhost:3000
echo 前端: http://localhost:5173
echo 管理后台: http://localhost:5173/#/admin/login
echo.
echo 两个窗口启动后，请保持本窗口开启。按 Ctrl+C 可停止。
echo.

rem ---- 同时启动前后端 ----
start "翰墨裂变-后端" cmd /k "cd /d "%~dp0server" && npm run dev"
start "翰墨裂变-前端" cmd /k "cd /d "%~dp0web" && npm run dev"

echo 已弹出两个启动窗口，等待 5 秒后自动打开浏览器...
timeout /t 5 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo 启动完成！若浏览器未自动打开，请手动访问 http://localhost:5173
pause
