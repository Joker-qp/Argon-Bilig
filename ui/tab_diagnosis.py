"""Argon-bilig — Teşhis Laboratuvarı Arayüz Bileşeni Sorumluluk: Kamera / dosya

girdisi alır, pipeline çıkarımını tetikler, maskeleri görselleştirir ve Bakanlık
reçetesini sunar.
"""

from typing import Any

import cv2
import numpy as np
import streamlit as st

from core.pipeline import pipeline


def _create_overlay_visualization(
    original_bgr: np.ndarray, yolo_res: dict[str, Any]
) -> np.ndarray:
    """Orijinal görsel üzerine yaprak (yeşil) ve lezyon (kırmızı) maskelerini bindirir."""
    overlay = original_bgr.copy()
    leaf_mask = yolo_res.get("leaf_mask")
    lesion_mask = yolo_res.get("lesion_mask")

    # 1. Yaprak Alanını Yeşil ile Yarı Saydam Boya
    if leaf_mask is not None and np.any(leaf_mask == 255):
        green_layer = np.zeros_like(original_bgr)
        green_layer[:] = (34, 197, 94)  # BGR formatında yeşil
        overlay = np.where(leaf_mask[:, :, None] == 255, green_layer, overlay)
        overlay = cv2.addWeighted(overlay, 0.45, original_bgr, 0.55, 0)

    # 2. Lezyon Odaklarını Kırmızı ile Vurgula
    if (
        yolo_res.get("has_lesion")
        and lesion_mask is not None
        and np.any(lesion_mask == 255)
    ):
        red_layer = np.zeros_like(original_bgr)
        red_layer[:] = (40, 40, 230)  # BGR formatında canlı kırmızı
        overlay = np.where(lesion_mask[:, :, None] == 255, red_layer, overlay)
        overlay = cv2.addWeighted(overlay, 0.70, original_bgr, 0.30, 0)

    # Streamlit RGB beklediği için BGR -> RGB çevrimi
    return cv2.cvtColor(overlay, cv2.COLOR_BGR2RGB)


def render_diagnosis_tab() -> None:
    """Streamlit Teşhis Laboratuvarı Sekmesi Ana Görünümü."""
    st.markdown("### 🔬 Gemlik Zeytini Teşhis Laboratuvarı")
    st.caption(
        "YOLOv8-seg lezyon segmentasyonu ve EfficientNet-B0 çift kademeli çıkarım motoru."
    )

    # Donanım Durumu Rozeti
    col_badge1, col_badge2 = st.columns([3, 1])
    with col_badge1:
        st.info(f"⚙️ **Donanım Durumu:** {pipeline.hardware_status}")
    with col_badge2:
        st.success("🟢 ONNX Çift Model Aktif")

    st.markdown("---")

    # 1. Girdi Seçim Bölümü (Kamera vs Dosya Yükleme)
    input_method = st.radio(
        "Görüntü Kaynağı Seçiniz:",
        ["📁 Fotoğraf Yükle", "📷 Canlı Kamera / Mikroskop"],
        horizontal=True,
    )

    input_image_bytes: bytes | None = None

    if input_method == "📁 Fotoğraf Yükle":
        uploaded_file = st.file_uploader(
            "Zeytin yaprağı fotoğrafı yükleyin (JPG, PNG)",
            type=["jpg", "jpeg", "png"],
            help="En iyi sonuç için yaprağın net odaklandığı bir fotoğraf seçiniz.",
        )
        if uploaded_file is not None:
            input_image_bytes = uploaded_file.read()

    else:
        camera_file = st.camera_input("Canlı kameradan yaprak görüntüsü yakala")
        if camera_file is not None:
            input_image_bytes = camera_file.read()

    # Görüntü Sağlandıysa Çıkarımı Başlat
    if input_image_bytes:
        # Byte verisini OpenCV BGR dizisine çevir
        file_bytes = np.frombuffer(input_image_bytes, np.uint8)
        img_bgr = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img_bgr is None:
            st.error("Görüntü çözümlenemedi. Lütfen geçerli bir dosya yükleyin.")
            return

        with st.spinner("Lazer tarama ve çift model çıkarımı yapılıyor..."):
            result = pipeline.diagnose(img_bgr)

        st.markdown("---")

        # 2. Üst Metrik Kartları
        m1, m2, m3, m4 = st.columns(4)
        m1.metric(label="Teşhis", value=result["disease"].split("(")[0].strip())
        m2.metric(label="Güven Skoru", value=f"%{result['confidence']}")
        m3.metric(label="Lezyon Şiddeti", value=f"%{result['severity']}")
        m4.metric(label="Yaprak Odak Güveni", value=f"%{result['leaf_confidence']}")

        st.markdown("---")

        # 3. Görsel Segmentasyon Sonuçları (Yan Yana Karşılaştırma)
        col_img1, col_img2 = st.columns(2)

        with col_img1:
            st.markdown("##### 🎯 Segmentasyon & Leke Tespiti")
            overlay_rgb = _create_overlay_visualization(img_bgr, result)
            st.image(
                overlay_rgb,
                use_container_width=True,
                caption="Yeşil: İzole Yaprak Dokusu | Kırmızı: Şüpheli Lezyon Odakları",
            )

        with col_img2:
            st.markdown("##### 🖤 Zemin İzolasyonu (EfficientNet Girdisi)")
            isolated_rgb = cv2.cvtColor(result["isolated_leaf"], cv2.COLOR_BGR2RGB)
            st.image(
                isolated_rgb,
                use_container_width=True,
                caption="Arka plandan tamamen yalıtılmış RGB(0,0,0) yaprak yüzeyi",
            )

        st.markdown("---")

        # 4. Sınıf Olasılık Dağılımı
        st.markdown("##### 📊 Model Olasılık Dağılımı")
        probs = result["probabilities"]

        p_col1, p_col2, p_col3 = st.columns(3)
        with p_col1:
            st.write(f"🍂 **Halkalı Leke:** %{probs['peacock']}")
            st.progress(probs["peacock"] / 100.0)
        with p_col2:
            st.write(f"🕷️ **Zeytin Pas Akarı:** %{probs['mite']}")
            st.progress(probs["mite"] / 100.0)
        with p_col3:
            st.write(f"🌿 **Sağlıklı Yaprak:** %{probs['healthy']}")
            st.progress(probs["healthy"] / 100.0)

        st.markdown("---")

        # 5. Zirai Reçete & Mücadele Tavsiyesi
        st.markdown("##### 📋 T.C. Tarım ve Orman Bakanlığı Mücadele Reçetesi")
        if result["type"] == "peacock":
            st.error(f"⚠️ **{result['disease']}**\n\n{result['prescription']}")
        elif result["type"] == "mite":
            st.warning(f"⚠️ **{result['disease']}**\n\n{result['prescription']}")
        else:
            st.success(f"✅ **{result['disease']}**\n\n{result['prescription']}")
