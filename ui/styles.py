"""Argon-bilig — Orijinal Web Sitesi Teması & Tailwind CSS Enjeksiyonu

Tasarım Referansı: src/app.css & src/App.svelte
Sorumluluk: Orijinal Tailwind 'slate-950' zemin, 'slate-900' kart panelleri,
yarı saydam 'emerald-600/20' hap sekmeleri ve zeytin paleti tasarım kurallarını Streamlit'e uygular.
"""

import streamlit as st

# Orijinal app.css ve App.svelte tasarım token'ları
AUTHENTIC_THEME_CSS = """
<style>
    /* =========================================================================
       1. TAILWIND OLIVE VE SLATE DEĞİŞKENLERİ & ZEMİN
       ========================================================================= */
    :root {
        --color-olive-50: #f6f7f2;
        --color-olive-100: #ebede2;
        --color-olive-200: #d7dbc5;
        --color-olive-500: #5c6f34;
        --color-olive-600: #485827;
        --color-olive-700: #38451e;
        --color-olive-800: #2c3718;
        --color-olive-900: #1e2610;
    }

    /* Orijinal Metin Seçim Rengi: selection:bg-emerald-600 */
    ::selection {
        background-color: #059669 !important;
        color: #ffffff !important;
    }

    /* Orijinal Zemin: bg-slate-950 (#020617) & text-slate-100 */
    .stApp {
        background-color: #020617 !important;
        color: #f1f5f9 !important;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
    }

    /* =========================================================================
       2. APP.SVELTE HEADER & BRAND KARTI
       ========================================================================= */
    .brand-header-box {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0 20px 0;
        border-bottom: 1px solid #1e293b;
        margin-bottom: 20px;
    }

    .brand-title-group {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .brand-logo-icon {
        width: 44px;
        height: 44px;
        border-radius: 12px;
        background-color: #047857; /* bg-emerald-700 */
        border: 1px solid rgba(16, 185, 129, 0.5); /* border-emerald-600/50 */
        box-shadow: 0 10px 15px -3px rgba(2, 44, 34, 0.5); /* shadow-emerald-950/40 */
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 22px;
    }

    .brand-text-title {
        font-size: 24px;
        font-weight: 800;
        color: #ffffff;
        line-height: 1.1;
        letter-spacing: -0.025em;
    }

    .brand-text-emerald {
        color: #34d399; /* text-emerald-400 */
    }

    .brand-text-subtitle {
        font-size: 11px;
        color: #94a3b8; /* text-slate-400 */
        font-weight: 500;
        display: block;
        margin-top: 2px;
    }

    /* =========================================================================
       3. ORİJİNAL SEKME STİLİ (APP.SVELTE NAV BUTTONS)
       ========================================================================= */
    /* Sekme Barı Kapsayıcısı */
    .stTabs [data-baseweb="tab-list"] {
        background-color: transparent !important;
        border-bottom: 1px solid #1e293b !important; /* border-slate-800 */
        padding: 0 0 8px 0 !important;
        gap: 8px !important;
        margin-bottom: 24px !important;
    }

    /* Standart / Pasif Sekme */
    .stTabs [data-baseweb="tab"] {
        background-color: transparent !important;
        color: #94a3b8 !important; /* text-slate-400 */
        border-radius: 12px !important; /* rounded-xl */
        font-size: 13px !important;
        font-weight: 600 !important;
        padding: 8px 18px !important;
        border: 1px solid transparent !important;
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
    }

    .stTabs [data-baseweb="tab"]:hover {
        background-color: #1e293b !important; /* hover:bg-slate-800 */
        color: #ffffff !important; /* hover:text-white */
    }

    /* Aktif Sekme: bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 */
    .stTabs [data-baseweb="tab"][aria-selected="true"] {
        background-color: rgba(5, 150, 105, 0.2) !important;
        color: #34d399 !important;
        border: 1px solid rgba(16, 185, 129, 0.3) !important;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important;
    }

    /* Streamlit'in çirkin kırmızı alt çizgisini kaldır */
    .stTabs [data-baseweb="tab-highlight"] {
        display: none !important;
    }

    /* =========================================================================
       4. YAN PANEL (SIDEBAR) & KARTLAR
       ========================================================================= */
    [data-testid="stSidebar"] {
        background-color: #0b1120 !important; /* Derin slate */
        border-right: 1px solid #1e293b !important; /* border-slate-800 */
    }

    /* Metrik Kartları: bg-slate-900 border border-slate-800 rounded-2xl */
    [data-testid="stMetric"] {
        background-color: #0f172a !important; /* bg-slate-900 */
        border: 1px solid #1e293b !important; /* border-slate-800 */
        border-radius: 16px !important; /* rounded-2xl */
        padding: 16px !important;
        box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3) !important;
    }

    [data-testid="stMetricLabel"] {
        color: #94a3b8 !important; /* text-slate-400 */
        font-size: 11px !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.05em !important;
    }

    [data-testid="stMetricValue"] {
        color: #ffffff !important;
        font-weight: 800 !important;
        font-size: 24px !important;
    }

    /* =========================================================================
       5. BUTONLAR: bg-emerald-600 hover:bg-emerald-500 rounded-xl
       ========================================================================= */
    .stButton button {
        background-color: #059669 !important; /* bg-emerald-600 */
        color: #ffffff !important;
        border-radius: 12px !important; /* rounded-xl */
        font-size: 12px !important;
        font-weight: 600 !important;
        padding: 8px 18px !important;
        border: 1px solid transparent !important;
        transition: all 0.2s ease !important;
        box-shadow: 0 4px 6px -1px rgba(2, 44, 34, 0.5) !important;
    }

    .stButton button:hover {
        background-color: #10b981 !important; /* hover:bg-emerald-500 */
        color: #ffffff !important;
        border-color: #34d399 !important;
        transform: translateY(-1px) !important;
    }

    /* Form ve Girdi Alanları */
    .stTextInput > div > div > input,
    .stTextArea > div > div > textarea,
    .stNumberInput > div > div > input {
        background-color: #0f172a !important; /* bg-slate-900 */
        border: 1px solid #1e293b !important; /* border-slate-800 */
        color: #f1f5f9 !important;
        border-radius: 12px !important;
    }

    /* =========================================================================
       6. LAZER ANİMASYONU (APP.CSS HUD-LASER)
       ========================================================================= */
    @keyframes hud-laser {
        0% { transform: translateY(0%); opacity: 0.8; }
        50% { opacity: 1; }
        100% { transform: translateY(100%); opacity: 0.8; }
    }

    .scanline-laser-anim {
        animation: hud-laser 1.6s ease-in-out infinite;
    }
</style>
"""


def apply_custom_theme() -> None:
    """Orijinal Tailwind CSS kurallarını Streamlit arayüzüne enjekte eder."""
    st.markdown(AUTHENTIC_THEME_CSS, unsafe_allow_html=True)


def render_brand_header(is_esp_online: bool = False) -> None:
    """App.svelte dosyasındaki orijinal üst başlık ve logo bileşeni."""
    esp_badge = (
        '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background-color: #34d399; margin-right: 6px;"></span> ESP32 Çevrimiçi'
        if is_esp_online
        else '<span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background-color: #475569; margin-right: 6px;"></span> ESP32 Bağlantısı Yok'
    )

    header_html = f"""
    <div class="brand-header-box">
        <div class="brand-title-group">
            <div class="brand-logo-icon">🌱</div>
            <div>
                <span class="brand-text-title">
                    Argon<span class="brand-text-emerald">-bilig</span>
                </span>
                <span class="brand-text-subtitle">
                    Olea europaea cv. Gemlik
                </span>
            </div>
        </div>
        <div style="background-color: #0f172a; border: 1px solid #1e293b; padding: 6px 14px; border-radius: 9999px; font-size: 11px; font-weight: 500; color: #cbd5e1;">
            {esp_badge}
        </div>
    </div>
    """
    st.markdown(header_html, unsafe_allow_html=True)
