"""Argon-bilig — Gemlik Zeytini Yapay Zekâ Erken Uyarı & Teşhis Sistemi

Ana Giriş Kapısı (Streamlit Application Entry Point)
Tasarım: Orijinal Svelte/Tailwind Slate-950 & Emerald-600 Mimarisi
"""

import streamlit as st

from config.config_manager import cfg
from core.pipeline import pipeline
from services.esp32_service import esp32_service
from ui.styles import apply_custom_theme, render_brand_header
from ui.tab_diagnosis import render_diagnosis_tab
from ui.tab_map import render_map_tab
from ui.tab_settings import render_settings_tab
from ui.tab_testing import render_testing_tab

# ==============================================================================
# 1. STREAMLIT SAYFA YAPILANDIRMASI
# ==============================================================================
st.set_page_config(
    page_title="Argon-bilig | Gemlik Zeytini AI Teşhis",
    page_icon="🌿",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Web sitesinin orijinal Tailwind CSS temasını ve renklerini enjekte et
apply_custom_theme()


# ==============================================================================
# 2. YAN PANEL (SIDEBAR) BİLGİLERİ & AGRO-METRİKLER
# ==============================================================================
with st.sidebar:
    st.image(
        "https://images.unsplash.com/photo-1541256942802-7b29ec6564c8?auto=format&fit=crop&w=600&q=80",
        caption="Olea europaea cv. Gemlik",
        use_container_width=True,
    )

    st.markdown("### 🌿 Argon-bilig")
    st.caption("Gemlik Havzası Tarımsal Erken Uyarı Sistemi")

    st.markdown("---")

    # Aktif Çeşit Bilgisi
    active_cultivar = cfg.active_cultivar
    st.markdown("##### 🫒 Aktif Çeşit Profili")
    st.markdown(f"**Çeşit:** {active_cultivar.get('name', 'Gemlik')}")
    st.markdown(f"*{active_cultivar.get('scientific_name', '')}*")
    st.markdown(
        f"**Soğuklama İhtiyacı:** {active_cultivar.get('chilling_hours', 500)} saat"
    )

    st.markdown("---")

    # Donanım Durumu
    st.markdown("##### ⚡ Donanım / Runtime")
    st.code(pipeline.hardware_status, language="bash")

    st.markdown("---")
    st.caption("Argon-bilig © 2026 | Yerel Streamlit Çıkarım Motoru")


# ==============================================================================
# 3. ANA GÖVDE, LOGO HEADER VE SEKMELER
# ==============================================================================
def main():
    # ESP32 telemetri durumunu al ve sitendeki orijinal 🌱 Argon-bilig logosunu çiz
    esp_state = esp32_service.get_telemetry()
    render_brand_header(is_esp_online=esp_state.get("is_online", False))

    # Orijinal Web Sitesi Menüsüne Karşılık Gelen Sekmeler
    tab_diag, tab_test, tab_map, tab_settings = st.tabs(
        [
            "🔬 Teşhis Laboratuvarı",
            "🧪 Test & Simülasyon",
            "🗺️ İkili Risk Haritası",
            "⚙️ Ayarlar & Reçeteler",
        ]
    )

    # 1. SEKME: CANLI TEŞHİS & LEZYON SEGMENTASYONU
    with tab_diag:
        render_diagnosis_tab()

    # 2. SEKME: TEST, BENCHMARK VE SİMÜLASYON LABORATUVARI
    with tab_test:
        render_testing_tab()

    # 3. SEKME: CBS RİSK HARİTASI VE MİKROKLİMA
    with tab_map:
        render_map_tab()

    # 4. SEKME: BİLGİ BANKASI, REÇETE VE EŞİK YÖNETİMİ
    with tab_settings:
        render_settings_tab()


if __name__ == "__main__":
    main()
