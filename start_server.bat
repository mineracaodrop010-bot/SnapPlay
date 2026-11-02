@echo off
chcp 65001 >nul
title SnapPlay - Servidor Local

echo ========================================================
echo          🚀 INICIANDO O SNAPPAY (SEU SNAPTUBE)
echo ========================================================
echo.

REM Verifica se o Python está instalado
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Python não foi encontrado no sistema!
    echo Instale o Python 3.10+ e marque a opção "Add Python to PATH".
    pause
    exit /b 1
)

echo [*] Verificando dependencias...
pip install -r backend/requirements.txt -q

echo.
echo [*] Iniciando servidor SnapPlay...
echo.
echo 💻 Acesso no seu Notebook: http://localhost:8000
echo 📱 Acesso no Celular: Conecte no mesmo Wi-Fi e use o QR Code na tela!
echo.
echo ========================================================
echo.

REM Inicia o servidor e abre o navegador automaticamente
start http://localhost:8000
python -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload

pause
