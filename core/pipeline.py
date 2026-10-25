"""
Argon-bilig — Çift Kademeli ONNX Çıkarım Boru Hattı (Inference Pipeline)
Sorumluluk: YOLOv8-seg (Segmentasyon) + EfficientNet-B0 (Sınıflandırma)
modellerini GPU/CPU üzerinde senkronize çalıştırır ve teşhis üretir.
"""

from typing import Any, Optional

import cv2
import numpy as np
import onnxruntime as ort

from config.config_manager import cfg
from core.cv_engine import (
    binary_dilation,
    calculate_severity,
    extract_polygon_and_area,
    fill_mask_holes,
    isolate_background,
    letterbox_image,
    preprocess_for_classifier,
)
from core.model_downloader import check_execution_providers, ensure_models_downloaded


class OliveDiagnosisPipeline:
    """Argon-bilig Çift Kademeli Teşhis Orkestratörü."""

    _instance: Optional["OliveDiagnosisPipeline"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.yolo_session: ort.InferenceSession | None = None
        self.classifier_session: ort.InferenceSession | None = None
        self.providers: list[str] = []
        self.hardware_status: str = ""

        self.initialize_sessions()
        self._initialized = True

    def initialize_sessions(self) -> None:
        """Modelleri doğrular, oturumları GPU/CPU sağlayıcılarıyla başlatır."""
        # 1. Modellerin yerelde olduğundan emin ol
        model_paths = ensure_models_downloaded()

        # 2. Donanım sağlayıcılarını belirle (CUDA / CPU)
        self.providers, self.hardware_status = check_execution_providers()
        print(f"[Pipeline] Donanım: {self.hardware_status}")

        sess_options = ort.SessionOptions()
        sess_options.graph_optimization_level = (
            ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        )

        # 3. YOLOv8s-seg Oturumu
        print(f"[Pipeline] YOLOv8-seg yükleniyor: {model_paths['yolo'].name}...")
        self.yolo_session = ort.InferenceSession(
            str(model_paths["yolo"]),
            sess_options=sess_options,
            providers=self.providers,
        )

        # 4. EfficientNet-B0 Oturumu
        print(
            f"[Pipeline] EfficientNet yükleniyor: {model_paths['classifier'].name}..."
        )
        self.classifier_session = ort.InferenceSession(
            str(model_paths["classifier"]),
            sess_options=sess_options,
            providers=self.providers,
        )

        print("[Pipeline] Çift model çıkarım hattı başarıyla hazırlandı.")

    def _preprocess_yolo_tensor(self, letterbox_img: np.ndarray) -> np.ndarray:
        """640x640 BGR görüntüyü [1, 3, 640, 640] float32 tensöre dönüştürür."""
        rgb = cv2.cvtColor(letterbox_img, cv2.COLOR_BGR2RGB).astype(np.float32)
        rgb /= 255.0
        # HWC -> CHW -> NCHW
        tensor = np.transpose(rgb, (2, 0, 1))
        tensor = np.expand_dims(tensor, axis=0)
        return tensor

    def _compute_proto_mask(
        self,
        proto: np.ndarray,
        coeffs: np.ndarray,
        cx: float,
        cy: float,
        w: float,
        h: float,
        proto_size: int = 160,
    ) -> np.ndarray:
        """NumPy vektörizasyonu ile 32 katsayı ve prototip maskelerden lezyon/yaprak maskesi üretir."""
        # Matris çarpımı: (32,) * (32, 160, 160) -> (160, 160)
        logits = np.sum(coeffs[:, None, None] * proto, axis=0)
        prob = 1.0 / (1.0 + np.exp(-logits))
        binary_mask = (prob > 0.5).astype(np.uint8) * 255

        # Bounding Box sınırları dışını sıfırla
        x_min = max(0, int(cx - w / 2))
        x_max = min(proto_size, int(cx + w / 2))
        y_min = max(0, int(cy - h / 2))
        y_max = min(proto_size, int(cy + h / 2))

        bbox_mask = np.zeros((proto_size, proto_size), dtype=np.uint8)
        bbox_mask[y_min:y_max, x_min:x_max] = 255

        return cv2.bitwise_and(binary_mask, bbox_mask)

    def _parse_yolo_output(
        self, outputs: list[np.ndarray], lbox_meta: dict[str, Any]
    ) -> dict[str, Any]:
        """YOLOv8-seg tensör çıktılarını çözümler, maskeleri ve lezyon şiddetini hesaplar."""
        box_tensor = None
        proto_tensor = None

        for out in outputs:
            if out.ndim == 3:
                box_tensor = out[0]  # [38, 8400]
            elif out.ndim == 4:
                proto_tensor = out[0]  # [32, 160, 160]

        if box_tensor is None or proto_tensor is None:
            raise ValueError("YOLOv8-seg model çıktı tensörleri geçersiz.")

        proto_size = cfg.pipeline_config.get("proto_size", 160)
        th = cfg.thresholds
        leaf_th = th.get("leaf_confidence", 0.30)
        lesion_th = th.get("lesion_confidence", 0.22)

        num_predictions = box_tensor.shape[1]

        leaf_candidates = []
        lesion_candidates = []

        for i in range(num_predictions):
            leaf_score = float(box_tensor[4, i])
            lesion_score = float(box_tensor[5, i])

            if leaf_score > leaf_th:
                leaf_candidates.append((i, leaf_score))
            if lesion_score > lesion_th:
                lesion_candidates.append((i, lesion_score))

        leaf_candidates.sort(key=lambda x: x[1], reverse=True)
        lesion_candidates.sort(key=lambda x: x[1], reverse=True)

        leaf_mask_160 = np.zeros((proto_size, proto_size), dtype=np.uint8)
        lesion_mask_160 = np.zeros((proto_size, proto_size), dtype=np.uint8)

        # En güçlü 3 yaprak adayını birleştir
        for idx, _ in leaf_candidates[:3]:
            coeffs = box_tensor[6:38, idx]
            cx, cy, w, h = box_tensor[0:4, idx] / 4.0
            m = self._compute_proto_mask(proto_tensor, coeffs, cx, cy, w, h, proto_size)
            leaf_mask_160 = cv2.bitwise_or(leaf_mask_160, m)

        # En güçlü 15 lezyon odak adayını birleştir
        has_lesion = len(lesion_candidates) > 0
        for idx, _ in lesion_candidates[:15]:
            coeffs = box_tensor[6:38, idx]
            cx, cy, w, h = box_tensor[0:4, idx] / 4.0
            m = self._compute_proto_mask(proto_tensor, coeffs, cx, cy, w, h, proto_size)
            lesion_mask_160 = cv2.bitwise_or(lesion_mask_160, m)

        # 1. Aşama: Birleşim
        raw_union = cv2.bitwise_or(leaf_mask_160, lesion_mask_160)

        # 2. Aşama: Topolojik Delik Kapatma
        hole_filled = fill_mask_holes(raw_union)

        # 3. Aşama: 5x5 Morfolojik Genişletme
        dilated_mask = binary_dilation(hole_filled, radius=2, iterations=1)

        # Maskeleri Orijinal Görüntü Boyutuna Geri Ölçekleme
        orig_w = lbox_meta["orig_w"]
        orig_h = lbox_meta["orig_h"]
        pad_x = lbox_meta["pad_x"]
        pad_y = lbox_meta["pad_y"]
        scaled_w = lbox_meta["scaled_w"]
        scaled_h = lbox_meta["scaled_h"]
        target_size = lbox_meta["target_size"]

        # 160x160 -> 640x640
        dilated_640 = cv2.resize(
            dilated_mask,
            (target_size, target_size),
            interpolation=cv2.INTER_NEAREST,
        )
        lesion_640 = cv2.resize(
            lesion_mask_160,
            (target_size, target_size),
            interpolation=cv2.INTER_NEAREST,
        )

        # Unpad ve Orijinal Boyuta Dönüşüm
        crop_dilated = dilated_640[pad_y : pad_y + scaled_h, pad_x : pad_x + scaled_w]
        crop_lesion = lesion_640[pad_y : pad_y + scaled_h, pad_x : pad_x + scaled_w]

        final_leaf_mask = cv2.resize(
            crop_dilated, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST
        )
        final_lesion_mask = cv2.resize(
            crop_lesion, (orig_w, orig_h), interpolation=cv2.INTER_NEAREST
        )

        # Poligon ve Şiddet Hesabı
        leaf_poly, leaf_area = extract_polygon_and_area(final_leaf_mask)
        lesion_poly, lesion_area = (
            extract_polygon_and_area(final_lesion_mask) if has_lesion else ([], 0.0)
        )
        severity_ratio = calculate_severity(leaf_area, lesion_area)

        return {
            "has_lesion": has_lesion,
            "leaf_confidence": (
                round(leaf_candidates[0][1] * 100, 1) if leaf_candidates else 0.0
            ),
            "lesion_confidence": (
                round(lesion_candidates[0][1] * 100, 1) if lesion_candidates else 0.0
            ),
            "severity_ratio": severity_ratio,
            "leaf_mask": final_leaf_mask,
            "lesion_mask": final_lesion_mask,
            "leaf_polygon": leaf_poly,
            "lesion_polygon": lesion_poly,
        }

    def _execute_efficientnet(
        self, isolated_leaf: np.ndarray, yolo_res: dict[str, Any]
    ) -> dict[str, Any]:
        """İzole edilmiş yaprağı EfficientNet ile sınıflandırır ve akıllı füzyon uygular."""
        if self.classifier_session is None:
            raise RuntimeError("EfficientNet oturumu aktif değil.")

        # 224x224 Normalize Giriş Tensörü
        tensor = preprocess_for_classifier(isolated_leaf, target_size=224)
        input_name = self.classifier_session.get_inputs()[0].name

        outputs = self.classifier_session.run(None, {input_name: tensor})
        logits = outputs[0][0]  # [3]

        # Sayısal kararlılık için Softmax
        exp_logits = np.exp(logits - np.max(logits))
        probs = (exp_logits / np.sum(exp_logits)) * 100.0

        p_healthy = float(probs[0])
        p_mite = float(probs[1])
        p_peacock = float(probs[2])

        # =========================================================================
        # AKILLI FÜZYON MANTIĞI (Multi-Detection Fusion)
        # =========================================================================
        th = cfg.thresholds
        fusion_lesion_th = th.get("fusion_lesion_conf", 35.0)
        fusion_sev_th = th.get("fusion_severity_ratio", 0.50)

        if yolo_res["has_lesion"] and (
            yolo_res["severity_ratio"] >= fusion_sev_th
            or yolo_res["lesion_confidence"] >= fusion_lesion_th
        ):
            lesion_conf = yolo_res["lesion_confidence"]
            p_peacock = max(p_peacock, lesion_conf)
            remaining = max(0.1, 100.0 - p_peacock)
            sub_sum = (p_healthy + p_mite) or 1.0
            p_healthy = (p_healthy / sub_sum) * remaining
            p_mite = (p_mite / sub_sum) * remaining

        total_p = (p_healthy + p_mite + p_peacock) or 1.0
        p_healthy = round((p_healthy / total_p) * 100.0, 1)
        p_mite = round((p_mite / total_p) * 100.0, 1)
        p_peacock = round((p_peacock / total_p) * 100.0, 1)

        # Kazanan Sınıfı Belirle
        classes_cfg = cfg.classes
        presc_cfg = cfg.prescriptions

        if p_peacock >= p_mite and p_peacock >= p_healthy:
            winning_type = "peacock"
            winning_conf = p_peacock
        elif p_mite >= p_peacock and p_mite >= p_healthy:
            winning_type = "mite"
            winning_conf = p_mite
        else:
            winning_type = "healthy"
            winning_conf = p_healthy

        winning_title = classes_cfg.get(winning_type, winning_type)
        prescription = presc_cfg.get(winning_type, {}).get(
            "advice", "Standart bakım takvimine devam ediniz."
        )

        return {
            "disease": winning_title,
            "type": winning_type,
            "confidence": winning_conf,
            "prescription": prescription,
            "probabilities": {
                "peacock": p_peacock,
                "mite": p_mite,
                "healthy": p_healthy,
            },
        }

    def diagnose(self, image: np.ndarray) -> dict[str, Any]:
        """Tek bir görüntü üzerinde tam teşhis döngüsünü koşturur."""
        if self.yolo_session is None:
            raise RuntimeError("YOLOv8-seg oturumu aktif değil.")

        # 1. Letterbox dönüşümü
        lbox_img, lbox_meta = letterbox_image(image, target_size=640)

        # 2. YOLOv8s-seg Çıkarımı
        yolo_input_tensor = self._preprocess_yolo_tensor(lbox_img)
        input_name = self.yolo_session.get_inputs()[0].name
        yolo_outputs = self.yolo_session.run(None, {input_name: yolo_input_tensor})

        # 3. Maske ve Lezyon Analizi
        yolo_res = self._parse_yolo_output(yolo_outputs, lbox_meta)

        # 4. Zemin İzolasyonu RGB(0,0,0)
        isolated_leaf = isolate_background(image, yolo_res["leaf_mask"])

        # 5. EfficientNet Sınıflandırma & Füzyon
        eff_res = self._execute_efficientnet(isolated_leaf, yolo_res)

        # 6. Nihai Birleşik Sonuç
        final_result = {
            **eff_res,
            "severity": yolo_res["severity_ratio"],
            "leaf_confidence": yolo_res["leaf_confidence"],
            "lesion_confidence": yolo_res["lesion_confidence"],
            "leaf_polygon": yolo_res["leaf_polygon"],
            "lesion_polygon": yolo_res["lesion_polygon"],
            "isolated_leaf": isolated_leaf,
            "leaf_mask": yolo_res["leaf_mask"],
            "lesion_mask": yolo_res["lesion_mask"],
        }

        return final_result


# Kolay kullanım için hazır tekil örnek
pipeline = OliveDiagnosisPipeline()


if __name__ == "__main__":
    print("=" * 60)
    print("Argon-bilig Tam Pipeline Çıkarım Testi")
    print("=" * 60)

    # Sentetik yaprak görüntüsü ile test
    test_img = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.ellipse(test_img, (320, 240), (180, 70), 30, 0, 360, (35, 130, 45), -1)

    result = pipeline.diagnose(test_img)

    print(f"\n[+] Teşhis Sonucu : {result['disease']}")
    print(f"[+] Kazanan Tür   : {result['type']} (%{result['confidence']})")
    print(f"[+] Lezyon Şiddeti: %{result['severity']}")
    print(f"[+] Olasılıklar   : {result['probabilities']}")
    print(f"[+] Reçete        : {result['prescription']}")
    print("=" * 60)
    print("Pipeline testi başarıyla tamamlandı!")
