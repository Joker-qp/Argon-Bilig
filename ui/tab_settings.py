"""Argon-bilig — Ayarlar, Reçete ve Biyolojik Eşik Yönetimi Bileşeni

Sorumluluk: Bakanlık reçetelerini, agronomik eşik değerlerini, aktif zeytin
çeşidini ve ESP32/Firebase donanım ayarlarını arayüzden düzenleyip
settings.yaml'a kaydeder.
"""

import streamlit as st

from config.config_manager import cfg


def render_settings_tab() -> None:
    """Streamlit Ayarlar ve Bilgi Bankası Yönetim Sekmesi."""
    st.markdown("### ⚙️ Bilgi Bankası, Zirai Reçeteler ve Sistem Ayarları")
    st.caption(
        "Tüm agronomik kuralları, ilaçlama tavsiyelerini ve istasyon parametrelerini "
        "koda dokunmadan bu panelden güncelleyebilirsiniz."
    )

    settings_tab1, settings_tab2, settings_tab3 = st.tabs(
        [
            "📋 Zirai Mücadele Reçeteleri",
            "🫒 Çeşit & Biyolojik Eşik Değerleri",
            "📡 ESP32 & İstasyon Bağlantısı",
        ]
    )

    # =========================================================================
    # 1. SEKME: ZİRAİ MÜCADELE REÇETELERİ DÜZENLEME
    # =========================================================================
    with settings_tab1:
        st.markdown("##### 📋 T.C. Tarım ve Orman Bakanlığı Tavsiye & Reçeteleri")
        st.write(
            "Yapay zekâ veya risk motoru bir teşhis koyduğunda üreticiye gösterilecek "
            "resmi tavsiye ve ilaçlama yönergelerini buradan güncelleyebilirsiniz."
        )

        prescriptions = cfg.prescriptions

        with st.form("form_prescriptions"):
            # 1. Halkalı Leke Reçetesi
            st.markdown("###### 🍂 Zeytin Halkalı Leke Hastalığı (Spilocaea oleagina)")
            p_peacock = prescriptions.get("peacock", {})
            peacock_advice = st.text_area(
                "Genel Bakanlık Uyarısı / Reçetesi:",
                value=p_peacock.get("advice", ""),
                height=90,
                key="peacock_adv",
            )

            p_treatments = p_peacock.get("treatments", {})
            col_t1, col_t2 = st.columns(2)
            with col_t1:
                t_early = st.text_input(
                    "Erken / Koruyucu Tedavi (Örn: Bordo Bulamacı):",
                    value=p_treatments.get("early", ""),
                )
            with col_t2:
                t_moderate = st.text_input(
                    "Orta / Çimlenme Başlangıcı Tedavisi:",
                    value=p_treatments.get("moderate", ""),
                )
            t_severe = st.text_input(
                "İleri Düzey Sistemik Tedavi:",
                value=p_treatments.get("severe", ""),
            )

            st.markdown("---")

            # 2. Zeytin Pas Akarı Reçetesi
            st.markdown("###### 🕷️ Zeytin Pas Akarı (Aceria oleae / Aculus olearius)")
            p_mite = prescriptions.get("mite", {})
            mite_advice = st.text_area(
                "Pas Akarı Mücadele Yönergesi:",
                value=p_mite.get("advice", ""),
                height=90,
                key="mite_adv",
            )
            m_treatments = p_mite.get("treatments", {})
            m_col1, m_col2 = st.columns(2)
            with m_col1:
                m_standard = st.text_input(
                    "Standart İlaçlama (Örn: Kükürt WP):",
                    value=m_treatments.get("standard", ""),
                )
            with m_col2:
                m_severe = st.text_input(
                    "Yoğun Koloni Tedavisi (Ruhsatlı Akarisit):",
                    value=m_treatments.get("severe", ""),
                )

            st.markdown("---")

            # 3. Sağlıklı Doku Tavsiyesi
            st.markdown("###### 🌿 Sağlıklı Gemlik Yaprağı")
            p_healthy = prescriptions.get("healthy", {})
            healthy_advice = st.text_area(
                "Kültürel Bakım Tavsiyesi:",
                value=p_healthy.get("advice", ""),
                height=70,
                key="healthy_adv",
            )

            submitted_prescriptions = st.form_submit_button(
                "💾 Reçeteleri Kaydet ve Güncelle", type="primary"
            )
            if submitted_prescriptions:
                # Ayarları güncelle ve settings.yaml'a yaz
                cfg.update_prescription(
                    "peacock",
                    peacock_advice,
                    {
                        "early": t_early,
                        "moderate": t_moderate,
                        "severe": t_severe,
                    },
                )
                cfg.update_prescription(
                    "mite",
                    mite_advice,
                    {"standard": m_standard, "severe": m_severe},
                )
                cfg.update_prescription("healthy", healthy_advice)
                st.success(
                    "✅ Zirai reçeteler başarıyla kaydedildi! Teşhis ve Harita sekmeleri güncellendi."
                )
                st.rerun()

    # =========================================================================
    # 2. SEKME: ÇEŞİT & BİYOLOJİK EŞİK DEĞERLERİ
    # =========================================================================
    with settings_tab2:
        st.markdown("##### 🫒 Zeytin Çeşit Profili ve Biyolojik Risk Eşikleri")

        cultivars_cfg = cfg.config.get("cultivars", {})
        active_key = cultivars_cfg.get("active", "gemlik")
        presets = cultivars_cfg.get("presets", {})

        # Aktif Çeşit Seçici
        col_c1, col_c2 = st.columns([2, 2])
        with col_c1:
            selected_cultivar = st.selectbox(
                "Aktif Zeytin Çeşidi Seçin:",
                options=list(presets.keys()),
                index=(
                    list(presets.keys()).index(active_key)
                    if active_key in presets
                    else 0
                ),
                format_func=lambda x: presets.get(x, {}).get("name", x),
            )
        with col_c2:
            st.info(
                f"Bilimsel Adı: *{presets.get(selected_cultivar, {}).get('scientific_name', '')}*"
            )

        cur_preset = presets.get(selected_cultivar, {})
        cur_th = cur_preset.get("thresholds", {})

        with st.form("form_thresholds"):
            st.markdown("###### 🍂 Halkalı Leke İnkübasyon Parametreleri")
            t_col1, t_col2, t_col3 = st.columns(3)
            with t_col1:
                th_p_temp_min = st.number_input(
                    "Optimum Sıcaklık Alt Sınırı (°C)",
                    value=float(cur_th.get("peacock_temp_min", 10.0)),
                )
            with t_col2:
                th_p_temp_max = st.number_input(
                    "Optimum Sıcaklık Üst Sınırı (°C)",
                    value=float(cur_th.get("peacock_temp_max", 20.0)),
                )
            with t_col3:
                th_p_hum = st.number_input(
                    "Kritik Bağıl Nem Sınırı (%)",
                    value=float(cur_th.get("peacock_humidity_min", 85.0)),
                )

            th_p_rain = st.number_input(
                "Enfeksiyon Başlatan 48s Yağış Eşiği (mm)",
                value=float(cur_th.get("peacock_rain_trigger", 2.0)),
            )

            st.markdown("###### 🕷️ Zeytin Pas Akarı Popülasyon Parametreleri")
            m_col1, m_col2, m_col3 = st.columns(3)
            with m_col1:
                th_m_temp_min = st.number_input(
                    "Akar Üreme Başlangıç Sıcaklığı (°C)",
                    value=float(cur_th.get("mite_temp_min", 22.0)),
                )
            with m_col2:
                th_m_hum_max = st.number_input(
                    "Maksimum Nem Eşiği (Kuru Hava) (%)",
                    value=float(cur_th.get("mite_humidity_max", 70.0)),
                )
            with m_col3:
                th_m_rain = st.number_input(
                    "Popülasyon Baskılayan Yağış (mm)",
                    value=float(cur_th.get("mite_rain_suppression", 5.0)),
                )

            st.markdown("###### ❄️ Fenoloji & Soğuklama İhtiyacı")
            th_chilling = st.number_input(
                "Yıllık Kış Soğuklama Hedefi (<7.2°C saat)",
                value=int(cur_preset.get("chilling_hours", 500)),
            )

            submit_th = st.form_submit_button(
                "💾 Çeşit ve Eşikleri Kaydet", type="primary"
            )
            if submit_th:
                # Yapılandırmayı güncelle
                cfg.set_active_cultivar(selected_cultivar)
                if selected_cultivar in presets:
                    presets[selected_cultivar]["chilling_hours"] = th_chilling
                    presets[selected_cultivar]["thresholds"] = {
                        "peacock_temp_min": th_p_temp_min,
                        "peacock_temp_max": th_p_temp_max,
                        "peacock_humidity_min": th_p_hum,
                        "peacock_rain_trigger": th_p_rain,
                        "mite_temp_min": th_m_temp_min,
                        "mite_humidity_max": th_m_hum_max,
                        "mite_rain_suppression": th_m_rain,
                    }
                    cfg.save()
                    st.success(
                        f"✅ '{presets[selected_cultivar]['name']}' eşik değerleri kaydedildi!"
                    )
                    st.rerun()

    # =========================================================================
    # 3. SEKME: ESP32 & İSTASYON BAĞLANTISI
    # =========================================================================
    with settings_tab3:
        st.markdown("##### 📡 ESP32 Donanım & Firebase RTDB Ayarları")
        st.write(
            "Tarladaki ESP32 istasyonunuzun ölçtüğü mikroklima verilerini anlık okumak için "
            "Firebase REST veritabanı adresini yapılandırın."
        )

        station_cfg = cfg.config.get("station", {})

        with st.form("form_station"):
            fb_url = st.text_input(
                "Firebase Realtime Database URL:",
                value=station_cfg.get("firebase_url", ""),
                placeholder="https://projeniz-default-rtdb.firebaseio.com",
            )
            node_path = st.text_input(
                "Telemetri Düğüm Adı (Node Path):",
                value=station_cfg.get("node_path", "esp32_station"),
            )
            poll_sec = st.number_input(
                "Veri Tazeleme Aralığı (Saniye):",
                value=int(station_cfg.get("polling_interval_sec", 7)),
                min_value=3,
                max_value=120,
            )

            submit_station = st.form_submit_button(
                "💾 İstasyon Ayarlarını Kaydet", type="primary"
            )
            if submit_station:
                if "station" not in cfg.config:
                    cfg.config["station"] = {}
                cfg.config["station"]["firebase_url"] = fb_url.strip()
                cfg.config["station"]["node_path"] = node_path.strip()
                cfg.config["station"]["polling_interval_sec"] = poll_sec
                cfg.save()
                st.success("✅ ESP32 saha istasyonu ayarları kaydedildi!")
                st.rerun()
