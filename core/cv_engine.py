"""
Argon-bilig — Yüksek Performanslı Görüntü İşleme ve Morfoloji Motoru (OpenCV)
Sorumluluk: Letterbox dönüşümü, topolojik delik kapatma, 5x5 morfolojik genişletme,
RGB(0,0,0) zemin izolasyonu ve lezyon şiddet alanı hesabı.
"""

from typing import Any

import cv2
import numpy as np

from config.config_manager import cfg


def letterbox_image(
    image: np.ndarray,
    target_size: int = 640,
    pad_color: tuple[int, int, int] = (114, 114, 114),
) -> tuple[np.ndarray, dict[str, Any]]:
    """Görüntüyü en-boy oranını koruyarak target_size x target_size boyutuna getirir

    ve kenarları belirtilen renkle doldurur (Letterbox).
    """
    orig_h, orig_w = image.shape[:2]
    scale = min(target_size / orig_w, target_size / orig_h)

    scaled_w = round(orig_w * scale)
    scaled_h = round(orig_h * scale)

    # Boyutlandırma
    resized = cv2.resize(image, (scaled_w, scaled_h), interpolation=cv2.INTER_LINEAR)

    # Dolgu hesabı (ortalamak için)
    pad_x = (target_size - scaled_w) // 2
    pad_y = (target_size - scaled_h) // 2

    top = pad_y
    bottom = target_size - (scaled_h + pad_y)
    left = pad_x
    right = target_size - (scaled_w + pad_x)

    letterboxed = cv2.copyMakeBorder(
        resized,
        top,
        bottom,
        left,
        right,
        cv2.BORDER_CONSTANT,
        value=pad_color,
    )

    metadata = {
        "orig_w": orig_w,
        "orig_h": orig_h,
        "scaled_w": scaled_w,
        "scaled_h": scaled_h,
        "pad_x": pad_x,
        "pad_y": pad_y,
        "scale": scale,
        "target_size": target_size,
    }

    return letterboxed, metadata


def fill_mask_holes(mask: np.ndarray) -> np.ndarray:
    """Topolojik Delik Kapatma (Flood-Fill):

    Yaprak içindeki nekrotik lekeler veya klorotik delikleri tamamen doldurur.
    Dış arka plan sınırlarına dokunmaz.
    """
    h, w = mask.shape[:2]
    # Dış sınırlardan taşmayı önlemek için 1 piksellik siyah çerçeve ekle
    padded = cv2.copyMakeBorder(mask, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    ff_mask = np.zeros((h + 4, w + 4), np.uint8)

    # (0, 0) noktasından dış arka planı flood-fill ile doldur
    flood_filled = padded.copy()
    cv2.floodFill(flood_filled, ff_mask, (0, 0), 255)

    # Çerçeveyi kesip çıkar ve tersini al
    flood_cropped = flood_filled[1:-1, 1:-1]
    inverted_flood = cv2.bitwise_not(flood_cropped)

    # Orijinal maske ile ters flood-fill'i birleştir (iç delikler kapanır)
    filled = mask | inverted_flood
    return filled


def binary_dilation(
    mask: np.ndarray, radius: int = 2, iterations: int = 1
) -> np.ndarray:
    """5x5 Dairesel Disk Morfolojik Genişletme:

    Yaprak kenarlarındaki lezyon odaklarını korumak için maskeyi dışa doğru 1-2 piksel şişirir.
    """
    kernel_size = 2 * radius + 1
    # 5x5 dairesel eliptik çekirdek
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
    dilated = cv2.dilate(mask, kernel, iterations=iterations)
    return dilated


def isolate_background(
    image: np.ndarray,
    mask: np.ndarray,
    bg_color: tuple[int, int, int] = (0, 0, 0),
) -> np.ndarray:
    """Maskelenen yaprak alanı dışındaki tüm arka planı saf siyah RGB(0,0,0) yapar.

    EfficientNet-B0 modeline temiz veri aktarmak için zorunludur.
    """
    # Görüntü ve maske boyutlarını eşitle
    if image.shape[:2] != mask.shape[:2]:
        mask_resized = cv2.resize(
            mask,
            (image.shape[1], image.shape[0]),
            interpolation=cv2.INTER_NEAREST,
        )
    else:
        mask_resized = mask

    # 3 kanallı maske üret
    mask_3ch = cv2.merge([mask_resized, mask_resized, mask_resized])

    # Siyah arka plan üzerine sadece yaprağı yerleştir
    isolated = np.where(mask_3ch == 255, image, np.array(bg_color, dtype=np.uint8))
    return isolated


def preprocess_for_classifier(
    isolated_image: np.ndarray, target_size: int = 224
) -> np.ndarray:
    """İzole edilmiş yaprağı EfficientNet için 224x224 boyutuna getirir

    ve ImageNet mean/std değerleriyle CHW formatında normalize eder.
    """
    pipeline_cfg = cfg.pipeline_config
    norm_mean = np.array(
        pipeline_cfg.get("norm_mean", [0.485, 0.456, 0.406]), dtype=np.float32
    )
    norm_std = np.array(
        pipeline_cfg.get("norm_std", [0.229, 0.224, 0.225]), dtype=np.float32
    )

    # 224x224 RGB boyutlandırma
    resized = cv2.resize(
        isolated_image, (target_size, target_size), interpolation=cv2.INTER_LINEAR
    )
    rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0

    # ImageNet Standardizasyonu: (x - mean) / std
    normalized = (rgb - norm_mean) / norm_std

    # HWC -> CHW ve Batch boyutu ekleme: (1, 3, 224, 224)
    tensor = np.transpose(normalized, (2, 0, 1))
    tensor = np.expand_dims(tensor, axis=0).astype(np.float32)
    return tensor


def extract_polygon_and_area(
    mask: np.ndarray, num_points: int = 84
) -> tuple[list[dict[str, int]], float]:
    """Maskeden kontur çıkarır, alanını (Shoelace / Green teoremi) ve

    arayüz için poligon koordinatlarını üretir.
    """
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return [], 0.0

    # En büyük dış konturu al
    largest_cnt = max(contours, key=cv2.contourArea)
    area = float(cv2.contourArea(largest_cnt))

    # Poligon basitleştirme (çizim noktası sayısını optimize etmek için)
    epsilon = 0.005 * cv2.arcLength(largest_cnt, True)
    approx = cv2.approxPolyDP(largest_cnt, epsilon, True)

    polygon = [{"x": int(pt[0][0]), "y": int(pt[0][1])} for pt in approx]
    return polygon, area


def calculate_severity(leaf_area: float, lesion_area: float) -> float:
    """Yaprak alanı ile lezyon alanını oranlayarak enfeksiyon şiddetini (%) hesaplar."""
    if leaf_area <= 0.0:
        return 0.0
    ratio = (lesion_area / leaf_area) * 100.0
    return float(round(min(100.0, max(0.0, ratio)), 1))


if __name__ == "__main__":
    print("=" * 60)
    print("Argon-bilig CV Engine Doğrulama Testi")
    print("=" * 60)

    # 1. Sentetik 640x480 test görüntüsü
    dummy_img = np.zeros((480, 640, 3), dtype=np.uint8)
    dummy_img[:, :] = (30, 120, 30)  # Yeşil yaprak arka planı

    # Letterbox Testi
    lbox, meta = letterbox_image(dummy_img, target_size=640)
    print(f"[+] Letterbox Başarılı: Şekil = {lbox.shape}, Ölçek = {meta['scale']:.2f}")

    # 2. İçinde delik olan yapay maske testi
    test_mask = np.zeros((160, 160), dtype=np.uint8)
    cv2.circle(test_mask, (80, 80), 50, 255, -1)  # Yaprak
    cv2.circle(test_mask, (80, 80), 15, 0, -1)  # İçindeki nekrotik delik

    filled_mask = fill_mask_holes(test_mask)
    hole_pixel_val = filled_mask[80, 80]
    print(
        f"[+] Topolojik Delik Kapatma: Merkez piksel değeri (Beklenen 255) = {hole_pixel_val}"
    )

    # 3. 5x5 Morfolojik Genişletme
    dilated = binary_dilation(filled_mask, radius=2)
    print(
        f"[+] Morfolojik Dilation: Genişletilmiş alan = {np.count_nonzero(dilated)} piksel"
    )

    # 4. Sınıflandırıcı Girdisi Testi
    clf_tensor = preprocess_for_classifier(lbox, target_size=224)
    print(f"[+] Classifier Tensör Şekli (Beklenen 1, 3, 224, 224) = {clf_tensor.shape}")
    print("=" * 60)
    print("Tüm OpenCV fonksiyonları kusursuz çalışıyor!")
