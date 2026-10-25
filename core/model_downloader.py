"""
Argon-bilig — Model İndirici ve Donanım Yöneticisi
Sorumluluk: ONNX modellerini Hugging Face Hub üzerinden otomatik indirir,
yerel önbelleği yönetir ve GPU (CUDA) / CPU donanım kontrolünü gerçekleştirir.
"""

from pathlib import Path

import onnxruntime as ort
from huggingface_hub import hf_hub_download

from config.config_manager import cfg


def check_execution_providers() -> tuple[list[str], str]:
    """CachyOS / Linux üzerindeki kullanılabilir ONNX sağlayıcılarını denetler.

    CUDA mevcutsa GPU modunu, değilse CPU modunu döndürür.
    """
    available = ort.get_available_providers()
    configured = cfg.execution_providers

    # CUDA destekleniyor mu ve konfigürasyonda istenmiş mi?
    if "CUDAExecutionProvider" in available and "CUDAExecutionProvider" in configured:
        active_providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
        status_msg = "GPU Aktif: CUDAExecutionProvider devrede."
    else:
        active_providers = ["CPUExecutionProvider"]
        status_msg = "CPU Modu: CUDA bulunamadı veya CPU tercih edildi (CPUExecutionProvider devrede)."

    return active_providers, status_msg


def ensure_models_downloaded() -> dict[str, Path]:
    """YOLOv8-seg ve EfficientNet modellerinin yerelde var olduğunu doğrular;

    yoksa Hugging Face Hub üzerinden otomatik indirir.
    """
    hf_cfg = cfg.huggingface_config
    repo_id = hf_cfg.get("repo_id", "JoQert/argon-bilig-olive-models")
    yolo_file = hf_cfg.get("yolo_filename", "yolov8_seg.onnx")
    clf_file = hf_cfg.get("classifier_filename", "efficientnet.onnx")

    base_dir = Path(__file__).resolve().parent.parent
    local_dir = base_dir / hf_cfg.get("local_dir", "models")
    local_dir.mkdir(parents=True, exist_ok=True)

    yolo_path = local_dir / yolo_file
    clf_path = local_dir / clf_file

    # 1. YOLOv8s-seg Model Denetimi / İndirme
    if not yolo_path.exists():
        print(f"[ModelDownloader] '{yolo_file}' indiriliyor ({repo_id})...")
        hf_hub_download(
            repo_id=repo_id,
            filename=yolo_file,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
        )
        print(f"[ModelDownloader] '{yolo_file}' başarıyla indirildi.")
    else:
        print(f"[ModelDownloader] '{yolo_file}' yerel diskte mevcut.")

    # 2. EfficientNet-B0 Model Denetimi / İndirme
    if not clf_path.exists():
        print(f"[ModelDownloader] '{clf_file}' indiriliyor ({repo_id})...")
        hf_hub_download(
            repo_id=repo_id,
            filename=clf_file,
            local_dir=str(local_dir),
            local_dir_use_symlinks=False,
        )
        print(f"[ModelDownloader] '{clf_file}' başarıyla indirildi.")
    else:
        print(f"[ModelDownloader] '{clf_file}' yerel diskte mevcut.")

    return {
        "yolo": yolo_path,
        "classifier": clf_path,
    }


if __name__ == "__main__":
    print("=" * 60)
    print("Argon-bilig Model & Donanım Denetimi")
    print("=" * 60)

    providers, msg = check_execution_providers()
    print(f"[*] Donanım Durumu: {msg}")
    print(f"[*] Sağlayıcı Listesi: {providers}")

    print("\n[*] Model kontrolü başlatılıyor...")
    model_paths = ensure_models_downloaded()
    print(f"[+] YOLO Yolu: {model_paths['yolo']}")
    print(f"[+] Sınıflandırıcı Yolu: {model_paths['classifier']}")
    print("=" * 60)
    print("Kurulum testi başarılı!")
