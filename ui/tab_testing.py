"""Argon-bilig — Test, Benchmark ve Donanım Simülatörü Bileşeni

Sorumluluk: AI model gecikme (latency) benchmark'ı, senaryo bazlı iklim
simülasyonu, ESP32 veri enjeksiyonu ve sistem bileşenleri sağlık taraması
(healthcheck).
"""

import time

import numpy as np
import streamlit as st

from config.config_manager import cfg
from core.model_downloader import check_execution_providers
from core.pipeline import pipeline
from services.esp32_service import esp32_service
from services.risk_service import risk_service
from services.weather_service import weather_service


def render_testing_tab() -> None:
    """Streamlit Test ve Simülasyon Laboratuvarı Sekmesi."""
    st.markdown("### 🧪 Argon-bilig Test, Benchmark & Simülasyon Laboratuvarı")
    st.caption(
        "Modülleri bağımsız olarak denetleyin, yapay zekâ hızını ölçün ve uç iklim senaryoları simüle edin."
    )

    test_subtab1, test_subtab2, test_subtab3, test_subtab4 = st.tabs(
        [
            "⚡ AI Model Benchmark",
            "🌦️ İklim & Risk Simülatörü (What-If)",
            "📡 ESP32 Telemetri Enjektörü",
            "🩺 Sistem Sağlık Taraması",
        ]
    )

    # =========================================================================
    # 1. ALT SEKME: AI MODEL BENCHMARK (HIZ VE GECİKME TESTİ)
    # =========================================================================
    with test_subtab1:
        st.markdown("##### ⚡ Çift Kademeli Çıkarım Hızı ve Donanım Ölçümü")
        st.write(
            "YOLOv8-seg (640x640) ve EfficientNet-B0 (224x224) modellerinin donanımın üzerindeki "
            "gerçek çıkarım hızını (latency & FPS) sentetik tensörlerle 10 döngü boyunca test eder."
        )

        col_b1, col_b2 = st.columns([2, 2])
        with col_b1:
            st.info(f"Aktif Donanım: **{pipeline.hardware_status}**")
        with col_b2:
            st.metric("Çıkarım Sağlayıcıları", str(pipeline.providers))

        if st.button("🚀 10 Döngülük Hız Testini Başlat", type="primary"):
            progress_bar = st.progress(0)
            status_text = st.empty()

            dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
            # Yeşil yaprak şekli
            dummy_img[100:380, 150:490] = (34, 139, 34)

            latencies = []

            # 1. Isınma Döngüsü (Warmup)
            status_text.text("GPU/CPU Isınma turu koşturuluyor...")
            _ = pipeline.diagnose(dummy_img)

            # 2. Ölçüm Döngüleri
            for i in range(10):
                status_text.text(f"Döngü {i + 1}/10 işleniyor...")
                t_start = time.perf_counter()
                _ = pipeline.diagnose(dummy_img)
                t_end = time.perf_counter()
                latencies.append((t_end - t_start) * 1000.0)  # ms
                progress_bar.progress((i + 1) / 10.0)

            status_text.text("Test başarıyla tamamlandı!")
            avg_latency = float(np.mean(latencies))
            min_latency = float(np.min(latencies))
            max_latency = float(np.max(latencies))
            fps = 1000.0 / avg_latency if avg_latency > 0 else 0.0

            st.markdown("---")
            m1, m2, m3, m4 = st.columns(4)
            m1.metric("Ortalama Gecikme", f"{avg_latency:.1f} ms")
            m2.metric("En Hızlı Tur", f"{min_latency:.1f} ms")
            m3.metric("En Yavaş Tur", f"{max_latency:.1f} ms")
            m4.metric("Kare Hızı (FPS)", f"{fps:.1f} FPS")

            st.line_chart(
                latencies,
                y_label="Gecikme (Milisaniye)",
                x_label="Döngü Sayısı",
            )

    # =========================================================================
    # 2. ALT SEKME: İKLİM & BİYOLOJİK RİSK SİMÜLATÖRÜ (WHAT-IF)
    # =========================================================================
    with test_subtab2:
        st.markdown("##### 🌦️ Uç Senaryo Biyolojik Risk Simülatörü")
        st.write(
            "Tarladaki koşulları yapay olarak değiştirerek Halkalı Leke ve Pas Akarı modellerinin "
            "nasıl karar ürettiğini ve dinamik risk çemberini nasıl büyüttüğünü canlı gözlemleyin."
        )

        col_s1, col_s2 = st.columns(2)
        with col_s1:
            sim_temp = st.slider("Simüle Edilen Sıcaklık (°C)", -5.0, 45.0, 16.0)
            sim_hum = st.slider("Simüle Edilen Bağıl Nem (%)", 10.0, 100.0, 92.0)
            sim_wet = st.checkbox("Sensörde Yaprak Islaklığı Var mı?", value=True)

        with col_s2:
            sim_rain = st.slider("48 Saatlik Beklenen Yağış (mm)", 0.0, 50.0, 6.5)
            sim_sev = st.slider(
                "Yapay Zekâ Tespit Ettiği Lezyon Şiddeti (%)", 0.0, 40.0, 5.0
            )

        # Yapay paketle Risk Servisini çalıştır
        sim_weather = {
            "current": {"temperature": sim_temp, "humidity": sim_hum},
            "forecast48h": {"total_rain_mm": sim_rain},
        }
        sim_esp = {
            "is_online": True,
            "temperature": sim_temp,
            "humidity": sim_hum,
            "leaf_wetness": sim_wet,
        }

        sim_eval = risk_service.evaluate_dual_risk(
            weather_data=sim_weather,
            esp_data=sim_esp,
            lesion_severity=sim_sev,
        )

        st.markdown("---")
        st.markdown("###### 📊 Simülasyon Çıktısı:")

        res_c1, res_c2, res_c3 = st.columns(3)
        res_c1.metric("Genel Risk Skoru", f"%{sim_eval['overall']['score']}")
        res_c2.metric("Risk Seviyesi", sim_eval["overall"]["badge"])
        res_c3.metric(
            "Dinamik Tampon Çemberi",
            f"{sim_eval['overall']['risk_radius_km']} km",
        )

        if sim_eval["overall"]["dominant_threat"] == "peacock":
            st.error(
                f"🚨 **Baskın Tehdit: Halkalı Leke**\n\n{sim_eval['peacock']['description']}\n\n"
                f"**Acil Eylem Planı:** {sim_eval['peacock']['action']}"
            )
        elif sim_eval["overall"]["dominant_threat"] == "mite":
            st.warning(
                f"⚠️ **Baskın Tehdit: Pas Akarı**\n\n{sim_eval['mite']['description']}\n\n"
                f"**Mücadele:** {sim_eval['mite']['action']}"
            )
        else:
            st.success(
                "🌿 **Tehdit Yok:** Koşullar spor veya akar popülasyonu için elverişsiz."
            )

    # =========================================================================
    # 3. ALT SEKME: ESP32 TELEMETRİ ENJEKTÖRÜ
    # =========================================================================
    with test_subtab3:
        st.markdown("##### 📡 Sanal ESP32 İstasyon Verisi Enjeksiyonu")
        st.write(
            "Fiziksel ESP32 cihazı yanınızda yokken, sisteme yapay sensör paketleri göndererek "
            "harita ve risk ekranlarının bu telemetriye nasıl uyum sağladığını test edin."
        )

        e_col1, e_col2, e_col3 = st.columns(3)
        with e_col1:
            inj_temp = st.number_input("İstasyon Sıcaklığı (°C)", value=19.5)
        with e_col2:
            inj_hum = st.number_input("İstasyon Nemi (%)", value=85.0)
        with e_col3:
            inj_wet = st.selectbox(
                "Yaprak Islaklığı",
                [True, False],
                format_func=lambda x: "Islak" if x else "Kuru",
            )

        if st.button("📡 Telemetriyi Sisteme Enjekte Et"):
            injected = esp32_service.get_telemetry(
                simulate=True,
                sim_temp=inj_temp,
                sim_hum=inj_hum,
                sim_wetness=inj_wet,
            )
            st.success(
                f"Yapay telemetri başarıyla enjekte edildi! Son Görülme: {injected['last_seen']}"
            )
            st.json(injected)

    # =========================================================================
    # 4. ALT SEKME: SİSTEM SAĞLIK TARAMASI (HEALTHCHECK)
    # =========================================================================
    with test_subtab4:
        st.markdown("##### 🩺 Argon-bilig Modüler Bileşen Sağlık Denetimi")
        st.write("Sistemin tüm alt servislerinin anlık durumunu tarar.")

        if st.button("🔍 Tüm Bileşenleri Tara"):
            with st.spinner("Bileşenler taranıyor..."):
                # 1. Model Dosyaları
                hf_cfg = cfg.huggingface_config
                models_dir = cfg.config_path.parent.parent / hf_cfg.get(
                    "local_dir", "models"
                )
                yolo_exists = (models_dir / hf_cfg.get("yolo_filename", "")).exists()
                clf_exists = (
                    models_dir / hf_cfg.get("classifier_filename", "")
                ).exists()

                # 2. Donanım Sağlayıcıları
                providers, hw_msg = check_execution_providers()

                # 3. Canlı Hava Durumu Bağlantısı
                weather_ok = False
                try:
                    w = weather_service.get_forecast()
                    weather_ok = w.get("provider") == "open-meteo"
                except Exception:  # noqa: BLE001
                    weather_ok = False

                st.markdown("---")
                # Göstergeler
                if yolo_exists and clf_exists:
                    st.success(
                        "✅ **Yapay Zekâ Modelleri:** İki ONNX modeli de yerel diskte doğrulanmış durumda."
                    )
                else:
                    st.error("❌ **Yapay Zekâ Modelleri:** Model dosyaları eksik.")

                if "CUDAExecutionProvider" in providers:
                    st.success(f"✅ **Hızlandırma Donanımı:** {hw_msg}")
                else:
                    st.info(f"ℹ️ **Hızlandırma Donanımı:** {hw_msg}")

                if weather_ok:
                    st.success(
                        "✅ **Meteoroloji Katmanı:** Open-Meteo API bağlantısı aktif ve veri akışı sağlanıyor."
                    )
                else:
                    st.warning(
                        "⚠️ **Meteoroloji Katmanı:** Open-Meteo yanıt vermedi, çevrimdışı mod devrede."
                    )

                st.success(
                    "✅ **Konfigürasyon Motoru:** settings.yaml başarıyla okundu ve aktif."
                )
