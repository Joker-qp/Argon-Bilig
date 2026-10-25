#!/usr/bin/env bash

# ==============================================================================
# Argon-bilig — CachyOS / Linux Yerel Başlatıcı Scripti
# ==============================================================================

set -e

# Projenin bulunduğu gerçek mutlak dizini çöz
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$PROJECT_DIR"

echo "============================================================"
echo "🌿 Argon-bilig: Gemlik Zeytini AI Teşhis Sistemi"
echo "============================================================"

# 1. Sanal Ortam Kontrolü
if [ -d "venv" ]; then
    echo "[*] Sanal ortam (venv) aktif ediliyor..."
    source venv/bin/activate
elif [ -d ".venv" ]; then
    echo "[*] Sanal ortam (.venv) aktif ediliyor..."
    source .venv/bin/activate
else
    echo "[-] HATA: Sanal ortam klasörü ('venv') bulunamadı!"
    echo "[*] Lütfen proje kök dizininde sanal ortamı kurun:"
    echo "    uv venv --python 3.11 venv && uv pip install -r requirements.txt"
    exit 1
fi

# 2. Python ve Donanım Doğrulaması
echo "[*] Python Sürümü : $(python --version)"
echo "[*] Konum         : $PROJECT_DIR"

# 3. Streamlit Uygulamasını Başlat
echo "[+] Sistem yerel tarayıcıda başlatılıyor (http://localhost:8501)..."
echo "============================================================"

exec streamlit run app.py \
    --server.headless=false \
    --server.port=8501 \
    --browser.gatherUsageStats=false \
    --theme.base="dark"