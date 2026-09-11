@echo off
chcp 65001 >nul
title 翰墨裂变系统 - 一键启动（带日志）
cd /d "%~dp0"
set LOG=%~dp0start-log.txt

echo =========================================== > "%LOG%"
echo   翰墨裂变·线上书法培训系统 - 启动日志 >> "%LOG%"
echo   %date% %time% >> "%LOG%"
echo =========================================== >> "%LOG%"

echo 启动准备中... 日志会写入 start-log.txt

rem ---- 检查 Node ----
node -v >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Node.js，请先安装。>> "%LOG%"
    echo [错误] 未检测到 Node.js，请先安装 Node.js 后再运行。
    pause
    exit /b 1
)
echo [OK] Node 已安装 >> "%LOG%"
node -v >> "%LOG%"

rem ---- 安装后端依赖 ----
if not exist "server\node_modules" (
    echo [安装] 后端依赖... >> "%LOG%"
    cd /d "%~dp0server"
    call npm install >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo [错误] 后端 npm install 失败，请看 start-log.txt 里的报错。>> "%LOG%"
        cd /d "%~dp0"
        echo [错误] 后端依赖安装失败，请查看 start-log.txt 里的详细错误。
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)
echo [OK] 后端依赖已就绪 >> "%LOG%"

rem ---- 安装前端依赖 ----
if not exist "web\node_modules" (
    echo [安装] 前端依赖... >> "%LOG%"
    cd /d "%~dp0web"
    call npm install >> "%LOG%" 2>&1
    if errorlevel 1 (
        echo [错误] 前端 npm install 失败。>> "%LOG%"
        cd /d "%~dp0"
        echo [错误] 前端依赖安装失败，请查看 start-log.txt。
        pause
        exit /b 1
    )
    cd /d "%~dp0"
)
echo [OK] 前端依赖已就绪 >> "%LOG%"

rem ---- 测试后端能否启动 ----
echo [测试] 正在检测后端能否启动... >> "%LOG%"
start "翰墨裂变-后端" cmd /k "cd /d "%~dp0server" && npm run dev"

echo 后端启动窗口已打开，等待 5 秒... >> "%LOG%"
timeout /t 5 /nobreak >nul

rem ---- 检测后端 3000 端口 ----
netstat -ano | findstr :3000 >nul 2>&1
if errorlevel 1 (
    echo [错误] 后端 3000 端口未监听，启动失败。>> "%LOG%"
    echo [错误] 后端未成功启动，请查看后端 cmd 窗口里的报错。
    echo 常见原因：Node 版本过低（需 v22.5+），或端口被占用。
    pause
    exit /b 1
)
echo [OK] 后端 3000 端口已监听 >> "%LOG%"

rem ---- 启动前端 ----
start "翰墨裂变-前端" cmd /k "cd /d "%~dp0web" && npm run dev"
echo [OK] 前端 5173 端口已启动 >> "%LOG%"

timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"

echo 启动完成！若浏览器未自动打开，请手动访问 http://localhost:5173 >> "%LOG%"
echo.
echo [完成] 启动成功！按任意键可关闭本窗口（前后端窗口会保留运行）。
pause
