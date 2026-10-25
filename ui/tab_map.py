"""
Argon-bilig — CBS Risk Haritası ve İklim Takibi Bileşeni
Sorumluluk: Folium tabanlı dinamik risk çemberi (buffer), Esri topoğrafya katmanı,
ESP32 telemetrisi, Open-Meteo verileri, ERA5 reanaliz fenolojisi ve 60 günlük inkübasyon şeridi.
"""

import folium
import streamlit as st
from streamlit_folium import st_folium

from config.config_manager import cfg
from services.esp32_service import esp32_service
from services.historical_archive_service import historical_service
from services.risk_service import risk_service
from services.weather_service import weather_service


def _get_risk_colors(level: str) -> dict[str, str]:
    """Risk seviyesine göre kenarlık ve dolgu renklerini döndürür."""
    colors = {
        "critical": {"stroke": "#dc2626", "fill": "#ef4444"},
        "high": {"stroke": "#ea580c", "fill": "#f97316"},
        "moderate": {"stroke": "#d97706", "fill": "#f59e0b"},
        "low": {"stroke": "#059669", "fill": "#10b981"},
    }
    return colors.get(level, colors["low"])


def render_map_tab() -> None:
    """Streamlit CBS Risk Haritası ve Mikroklima Takip Sekmesi."""
    st.markdown("### 🗺️ Gemlik Havzası CBS Risk Haritası ve İklim Takibi")
    st.caption(
        "Halkalı Leke ve Zeytin Pas Akarı enfeksiyon ihtimallerini mikroklima, "
        "IoT telemetrisi ve dinamik tampon çemberiyle canlı izleyin."
    )

    # 1. Koordinat Durumu (Session State ile Yönetim)
    loc_cfg = cfg.config.get("location", {})
    if "garden_lat" not in st.session_state:
        st.session_state["garden_lat"] = float(loc_cfg.get("latitude", 40.4286))
    if "garden_lon" not in st.session_state:
        st.session_state["garden_lon"] = float(loc_cfg.get("longitude", 29.1556))
    if "garden_name" not in st.session_state:
        st.session_state["garden_name"] = str(
            loc_cfg.get("name", "Gemlik (Merkez), Bursa")
        )

    lat = st.session_state["garden_lat"]
    lon = st.session_state["garden_lon"]
    loc_name = st.session_state["garden_name"]

    # 2. Canlı Servis Verilerini Topla (Hava + ESP32 + Risk + ERA5 Tarihsel İklim)
    with st.spinner("Meteoroloji, sensör ve ERA5 arşivi senkronize ediliyor..."):
        weather_data = weather_service.get_forecast(lat=lat, lon=lon)
        esp_data = esp32_service.get_telemetry(simulate=False)
        risk_res = risk_service.evaluate_dual_risk(
            weather_data=weather_data, esp_data=esp_data
        )
        # ERA5 365 Günlük Arşiv ve 60 Günlük İnkübasyon
        annual_archive = historical_service.get_annual_climate_archive(lat=lat, lon=lon)
        incubation_timeline = historical_service.get_incubation_timeline(
            lat=lat, lon=lon
        )

    overall = risk_res["overall"]
    peacock = risk_res["peacock"]
    mite = risk_res["mite"]

    # 3. Üst Bilgi ve Koordinat Çubuğu
    col_hdr1, col_hdr2 = st.columns([3, 1])
    with col_hdr1:
        st.markdown(f"📍 **Seçili Konum:** `{loc_name}` ({lat:.4f}°N, {lon:.4f}°E)")
    with col_hdr2:
        if st.button("🔄 Gemlik Merkeze Sıfırla"):
            st.session_state["garden_lat"] = 40.4286
            st.session_state["garden_lon"] = 29.1556
            st.session_state["garden_name"] = "Gemlik (Merkez), Bursa"
            st.rerun()

    st.markdown("---")

    # 4. Ana Düzen: Sol (Harita - 8 birim) | Sağ (Tehdit Kartları - 4 birim)
    col_map, col_cards = st.columns([8, 4])

    with col_map:
        st.markdown("##### 🛰️ Esri Topoğrafik Dinamik Risk Tamponu")

        # Folium Haritasını Oluştur
        m = folium.Map(
            location=[lat, lon],
            zoom_start=12,
            tiles=None,
            control_scale=True,
        )

        # Esri Topoğrafya Katmanı
        folium.TileLayer(
            tiles="https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
            attr="Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ",
            name="Esri Topoğrafya",
            max_zoom=19,
        ).add_to(m)

        # OpenStreetMap Yedek Katmanı
        folium.TileLayer(
            tiles="https://tile.openstreetmap.org/{z}/{x}/{y}.png",
            attr="&copy; OpenStreetMap contributors",
            name="OpenStreetMap",
            max_zoom=19,
        ).add_to(m)

        # Dinamik Risk Çemberi (Risk Radius Buffer)
        color_scheme = _get_risk_colors(overall["level"])
        radius_meters = float(overall.get("risk_radius_km", 2.5)) * 1000.0

        folium.Circle(
            location=[lat, lon],
            radius=radius_meters,
            color=color_scheme["stroke"],
            fill=True,
            fill_color=color_scheme["fill"],
            fill_opacity=0.22,
            weight=2,
            tooltip=f"Dinamik Risk Tamponu: {overall['risk_radius_km']} km ({overall['title']})",
        ).add_to(m)

        # Bahçe Pini ve Zengin Bilgi Kartı (Popup)
        esp_temp_txt = (
            f"{esp_data['temperature']} °C" if esp_data["is_online"] else "Bağlantı Yok"
        )
        esp_hum_txt = (
            f"%{esp_data['humidity']}" if esp_data["is_online"] else "Bağlantı Yok"
        )

        popup_html = f"""
        <div style="font-family: sans-serif; font-size: 12px; width: 220px; color: #1e293b;">
            <b style="font-size: 14px; color: #0f172a;">{loc_name}</b><br/>
            <span style="color: #64748b; font-size: 11px;">Gemlik (Trilye) Zeytinliği</span>
            <hr style="margin: 6px 0; border: 0; border-top: 1px solid #e2e8f0;"/>
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                <span>Baskın Tehdit:</span>
                <b>%{overall["score"]} ({overall["level"].upper()})</b>
            </div>
            <div style="background: #f8fafc; padding: 6px; border-radius: 6px; font-size: 11px;">
                <div>ESP32 Sıcaklık: <b>{esp_temp_txt}</b></div>
                <div>ESP32 Nem: <b>{esp_hum_txt}</b></div>
            </div>
            <p style="margin-top: 6px; font-size: 11px; color: #475569;">{overall["title"]}</p>
        </div>
        """

        folium.Marker(
            location=[lat, lon],
            popup=folium.Popup(popup_html, max_width=260),
            tooltip=f"{loc_name} (Detayları görmek için tıklayın)",
            icon=folium.Icon(color="green", icon="leaf", prefix="fa"),
        ).add_to(m)

        folium.LayerControl().add_to(m)

        # Haritayı Streamlit'e Göm ve Tıklamaları Dinle
        map_output = st_folium(
            m,
            width="100%",
            height=520,
            returned_objects=["last_clicked"],
        )

        # Kullanıcı haritaya tıkladıysa koordinatları anında güncelle
        if map_output and map_output.get("last_clicked"):
            click_lat = round(map_output["last_clicked"]["lat"], 4)
            click_lon = round(map_output["last_clicked"]["lng"], 4)
            if click_lat != lat or click_lon != lon:
                st.session_state["garden_lat"] = click_lat
                st.session_state["garden_lon"] = click_lon
                st.session_state["garden_name"] = (
                    f"Özel Konum ({click_lat:.2f}°, {click_lon:.2f}°)"
                )
                st.rerun()

        st.caption(
            "💡 **İpucu:** Harita üzerinde herhangi bir zeytinliğe tıklayarak konumu değiştirebilirsiniz. "
            "Dinamik risk çemberi ve aşağıdaki ERA5 iklim geçmişi tıkladığınız alana otomatik olarak taşınacaktır."
        )

    # Sağ Panel: Tehdit Kartları & Canlı Sensörler
    with col_cards:
        # 1. Halkalı Leke Tehdit Kartı
        st.markdown(
            f"""
            <div style="padding: 14px; border-radius: 14px; background: #0f172a; border: 1px solid #1e293b; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: #fbbf24;">🍂 HALKALI LEKE TEHDİDİ</span>
                    <span style="font-size: 12px; font-weight: bold; color: #fff; background: #334155; padding: 2px 8px; border-radius: 10px;">%{peacock["score"]}</span>
                </div>
                <h5 style="color: #fff; margin: 6px 0 2px 0;">{peacock["title"]}</h5>
                <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin: 0;">{peacock["description"]}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # 2. Pas Akarı Tehdit Kartı
        st.markdown(
            f"""
            <div style="padding: 14px; border-radius: 14px; background: #0f172a; border: 1px solid #1e293b; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 12px; font-weight: bold; color: #38bdf8;">🕷️ PAS AKARI TEHDİDİ</span>
                    <span style="font-size: 12px; font-weight: bold; color: #fff; background: #334155; padding: 2px 8px; border-radius: 10px;">%{mite["score"]}</span>
                </div>
                <h5 style="color: #fff; margin: 6px 0 2px 0;">{mite["title"]}</h5>
                <p style="font-size: 11px; color: #94a3b8; line-height: 1.4; margin: 0;">{mite["description"]}</p>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # 3. Meteoroloji İstasyonu (Open-Meteo)
        st.markdown(
            f"""
            <div style="padding: 14px; border-radius: 14px; background: #0f172a; border: 1px solid #1e293b; margin-bottom: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: bold; color: #cbd5e1;">METEOROLOJİ ({weather_data["provider"].upper()})</span>
                    <span style="font-size: 11px; color: #34d399; font-weight: bold;">● CANLI</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: #020617; padding: 8px; border-radius: 8px; text-align: center;">
                        <span style="font-size: 10px; color: #64748b; display: block;">Hava Sıcaklığı</span>
                        <b style="color: #fff; font-size: 14px;">{weather_data["current"]["temperature"]} °C</b>
                    </div>
                    <div style="background: #020617; padding: 8px; border-radius: 8px; text-align: center;">
                        <span style="font-size: 10px; color: #64748b; display: block;">Bağıl Nem</span>
                        <b style="color: #fff; font-size: 14px;">%{weather_data["current"]["humidity"]}</b>
                    </div>
                </div>
                <div style="margin-top: 6px; font-size: 11px; color: #38bdf8;">
                    🌧️ <b>48s Beklenen Yağış:</b> {weather_data["forecast48h"]["total_rain_mm"]} mm
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

        # 4. ESP32 Saha İstasyonu Telemetrisi
        status_dot = "🟢 Çevrimiçi" if esp_data["is_online"] else "⚪ Çevrimdışı"
        st.markdown(
            f"""
            <div style="padding: 14px; border-radius: 14px; background: #0f172a; border: 1px solid #1e293b;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: bold; color: #cbd5e1;">ESP32 SAHA İSTASYONU</span>
                    <span style="font-size: 11px; font-weight: bold; color: {"#34d399" if esp_data["is_online"] else "#94a3b8"};">{status_dot}</span>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                    <div style="background: #020617; padding: 8px; border-radius: 8px; text-align: center;">
                        <span style="font-size: 10px; color: #64748b; display: block;">Sensör Sıcaklığı</span>
                        <b style="color: #fff; font-size: 14px;">{esp_temp_txt}</b>
                    </div>
                    <div style="background: #020617; padding: 8px; border-radius: 8px; text-align: center;">
                        <span style="font-size: 10px; color: #64748b; display: block;">Sensör Nemi</span>
                        <b style="color: #fff; font-size: 14px;">{esp_hum_txt}</b>
                    </div>
                </div>
            </div>
            """,
            unsafe_allow_html=True,
        )

    st.markdown("---")

    # =========================================================================
    # 5. ALT BÖLÜM 1: 60 GÜNLÜK BİYOLOJİK İNKÜBASYON PENCERESİ (-30g / +16g)
    # =========================================================================
    st.markdown(
        "#### ⏳ 60 Günlük Biyolojik İnkübasyon Penceresi (-30 Gün Geçmiş / +16 Gün Tahmin)"
    )
    st.caption(
        "Halkalı Leke mantarının yaprak dokusu içindeki 30-60 günlük kuluçka dönemi analizi."
    )

    inc_stats = incubation_timeline.get("summary_stats", {})
    i_col1, i_col2, i_col3, i_col4 = st.columns(4)
    i_col1.metric("Geçmiş 30 Gün Yağışı", f"{inc_stats.get('past_rain_sum', 0.0)} mm")
    i_col2.metric(
        "Geçmiş Kritik Enfeksiyon Günü",
        f"{inc_stats.get('past_risk_days_count', 0)} Gün",
    )
    i_col3.metric(
        "Gelecek 16 Gün Yağışı", f"{inc_stats.get('future_rain_sum', 0.0)} mm"
    )
    i_col4.metric(
        "Gözlemlenen Zaman Penceresi",
        f"{inc_stats.get('total_observed_days', 0)} Gün",
    )

    # Detaylı Günlük Zaman Şeridi (Açılır Kapanır Kuluçka Takvimi)
    with st.expander("📅 Detaylı Günlük İnkübasyon Zaman Çizelgesini Görüntüle"):
        points = incubation_timeline.get("daily_points", [])
        if points:
            cols = st.columns(min(len(points), 6))
            # Son 6 günü özet göster
            for idx, pt in enumerate(points[-6:]):
                with cols[idx]:
                    badge_color = (
                        "🔴"
                        if pt["risk_level"] == "critical"
                        else (
                            "🟠"
                            if pt["risk_level"] == "high"
                            else ("🟡" if pt["risk_level"] == "moderate" else "🟢")
                        )
                    )
                    st.markdown(
                        f"""
                        <div style="background: #020617; border: 1px solid #1e293b; padding: 10px; border-radius: 10px; text-align: center;">
                            <span style="font-size: 11px; color: #94a3b8; font-weight: bold;">{pt["date"][-5:]} {"(Bugün)" if pt["is_today"] else ""}</span>
                            <b style="display: block; font-size: 14px; color: #fff; margin: 4px 0;">{pt["t_mean"]}°C</b>
                            <span style="font-size: 11px; color: #38bdf8; display: block;">🌧️ {pt["rain"]} mm</span>
                            <span style="font-size: 10px; font-weight: bold; margin-top: 4px; display: inline-block;">{badge_color} %{pt["risk_score"]} Risk</span>
                        </div>
                        """,
                        unsafe_allow_html=True,
                    )

    st.markdown("---")

    # =========================================================================
    # 6. ALT BÖLÜM 2: ERA5 REANALYSIS 365 GÜNLÜK İKLİM ARŞİVİ & SOĞUKLAMA
    # =========================================================================
    st.markdown(
        f"#### ❄️ ERA5 Reanalysis Tarihsel İklim & Fenoloji ({cfg.active_cultivar.get('name', 'Gemlik')})"
    )
    st.caption(
        "Avrupa Uzay Ajansı (ESA) ve ECMWF uydularından son 1 yılın gerçek iklim reanalizi."
    )

    cultivar_cfg = cfg.active_cultivar
    target_hours = cultivar_cfg.get("chilling_hours", 500)
    # ERA5'ten canlı hesaplanan gerçek soğuklama saati
    actual_chilling = annual_archive.get("chilling_hours_estimate", 0)
    actual_rain = annual_archive.get("total_rainfall_mm", 0.0)
    actual_risk_days = annual_archive.get("high_risk_days_count", 0)

    progress_ratio = min(1.0, actual_chilling / target_hours)

    f_col1, f_col2, f_col3 = st.columns(3)
    with f_col1:
        st.metric(
            label="Kış Soğuklama Birikimi (<7.2°C)",
            value=f"{actual_chilling} / {target_hours} Saat",
        )
        st.progress(progress_ratio)
        if actual_chilling >= target_hours:
            st.caption(
                "✅ Hedeflenen soğuklama saati karşılandı (Çiçek tutumu yüksek)."
            )
        else:
            st.caption(
                f"⏳ Hedefin %{int(progress_ratio * 100)}'si karşılandı (İklim takibi devam ediyor)."
            )

    with f_col2:
        st.metric(
            label="Yıllık Kümülatif Yağış (ERA5)",
            value=f"{actual_rain} mm",
            help="Gemlik zeytini için optimum dane tutumu asgari 500-600 mm gerektirir.",
        )
        st.caption(
            "Optimum dane tutumu için yıllık asgari 500-600 mm yağış gereklidir."
        )

    with f_col3:
        st.metric(
            label="Yıllık Mantar Patlama Günleri",
            value=f"{actual_risk_days} Gün",
            help="Geçtiğimiz 365 günde mantar sporülasyonu için kritik nem/sıcaklık birleşen gün sayısı.",
        )
        st.caption("Son 1 yılda spor çimlenmesi için kritik koşul oluşan günler.")
