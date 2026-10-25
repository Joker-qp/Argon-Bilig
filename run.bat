@echo off
chcp 65001 >nul
title Argon-bilig: Gemlik Zeytini AI Teşhis Sistemi

echo ============================================================
echo 🌿 Argon-bilig: Gemlik Zeytini AI Teşhis Sistemi Başlatılıyor
echo ============================================================

:: Scriptin çalıştığı proje klasörüne geç
cd /d "%~dp0"

:: 1. Sanal ortam (venv) denetimi
if exist "venv\Scripts\activate.bat" (
    echo [*] Sanal ortam (venv) aktif ediliyor...
    call "venv\Scripts\activate.bat"
) else if exist ".venv\Scripts\activate.bat" (
    echo [*] Sanal ortam (.venv) aktif ediliyor...
    call ".venv\Scripts\activate.bat"
) else (
    echo.
    echo [-] HATA: Sanal ortam klasörü ('venv') bulunamadı!
    echo [*] Lütfen önce Windows terminalinde sanal ortamı oluşturun:
    echo     python -m venv venv
    echo     .\venv\Scripts\activate
    echo     pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

:: 2. Python ve Çevre Doğrulaması
echo [*] Çalışan Python Sürümü:
python --version

:: 3. Streamlit Uygulamasını Başlat
echo.
echo [+] Streamlit yerel tarayıcıda başlatılıyor (http://localhost:8501)...
echo ============================================================
streamlit run app.py --server.headless=false --server.port=8501 --browser.gatherUsageStats=false --theme.base="dark"

:: Olası bir çökmede pencerenin anında kapanmasını önle
if %ERRORLEVEL% neq 0 (
    echo.
    echo [-] Uygulama beklenmedik bir hata ile sonlandı.
    pause
)