#!/usr/bin/env bash
echo "========================================================"
echo "         🚀 INICIANDO O SNAPPAY (SEU SNAPTUBE)"
echo "========================================================"
echo ""

pip install -r backend/requirements.txt -q
echo "[*] Servidor iniciado!"
echo "💻 Notebook: http://localhost:8000"
echo "📱 Celular: Conecte no mesmo Wi-Fi e use o QR Code!"

python3 -m uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
