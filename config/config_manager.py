"""
Argon-bilig — Konfigürasyon ve Bilgi Bankası Yöneticisi
Sorumluluk: settings.yaml dosyasını yükler, tip doğrulaması yapar,
çıkarım hattına sabitleri sağlar ve arayüzden gelen güncellemeleri diske yazar.
"""

from pathlib import Path
from typing import Any, Optional

import yaml


class ConfigManager:
    """settings.yaml dosyasını reaktif ve güvenli yöneten sınıf."""

    _instance: Optional["ConfigManager"] = None

    def __new__(cls, *args, **kwargs):
        # Uygulama genelinde tek bir konfigürasyon nesnesi (Singleton) kullanılır
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, config_path: str | None = None):
        if self._initialized:
            return

        # Proje kök dizinine göre dinamik yol belirleme
        if config_path:
            self.config_path = Path(config_path)
        else:
            base_dir = Path(__file__).resolve().parent.parent
            self.config_path = base_dir / "config" / "settings.yaml"

        self.config: dict[str, Any] = {}
        self.reload()
        self._initialized = True

    def reload(self) -> None:
        """YAML dosyasını diskten yeniden okur."""
        if not self.config_path.exists():
            raise FileNotFoundError(
                f"Konfigürasyon dosyası bulunamadı: {self.config_path.resolve()}"
            )

        with open(self.config_path, "r", encoding="utf-8") as f:
            self.config = yaml.safe_load(f) or {}

    def save(self) -> None:
        """Mevcut bellekteki ayarları settings.yaml dosyasına kaydeder."""
        with open(self.config_path, "w", encoding="utf-8") as f:
            yaml.safe_dump(
                self.config,
                f,
                default_flow_style=False,
                allow_unicode=True,
                sort_keys=False,
            )

    # --- Hugging Face & Model Deposu ---
    @property
    def huggingface_config(self) -> dict[str, Any]:
        return self.config.get("huggingface", {})

    # --- Donanım Sağlayıcıları (GPU/CPU Fallback) ---
    @property
    def execution_providers(self) -> list[str]:
        hw = self.config.get("hardware", {})
        return hw.get("providers", ["CUDAExecutionProvider", "CPUExecutionProvider"])

    # --- Model Çıkarım Parametreleri ---
    @property
    def pipeline_config(self) -> dict[str, Any]:
        return self.config.get("model_pipeline", {})

    @property
    def thresholds(self) -> dict[str, float]:
        return self.pipeline_config.get("thresholds", {})

    # --- Teşhis Sınıfları ---
    @property
    def classes(self) -> dict[str, str]:
        return self.config.get("classes", {})

    # --- Zirai Reçeteler ve Öneriler ---
    @property
    def prescriptions(self) -> dict[str, Any]:
        return self.config.get("prescriptions", {})

    def update_prescription(
        self, disease_key: str, advice: str, treatments: dict | None = None
    ) -> None:
        """Bakanlık reçetesini günceller ve diske kaydeder."""
        if "prescriptions" not in self.config:
            self.config["prescriptions"] = {}

        if disease_key not in self.config["prescriptions"]:
            self.config["prescriptions"][disease_key] = {}

        self.config["prescriptions"][disease_key]["advice"] = advice
        if treatments:
            self.config["prescriptions"][disease_key]["treatments"] = treatments
        self.save()

    # --- Çeşit & İklim Eşikleri ---
    @property
    def active_cultivar(self) -> dict[str, Any]:
        cultivars = self.config.get("cultivars", {})
        active_key = cultivars.get("active", "gemlik")
        presets = cultivars.get("presets", {})
        return presets.get(active_key, presets.get("gemlik", {}))

    def set_active_cultivar(self, preset_key: str) -> None:
        """Aktif zeytin çeşidini değiştirir (Gemlik, Ayvalık vb.)."""
        if "cultivars" in self.config:
            self.config["cultivars"]["active"] = preset_key
            self.save()


# Kolay erişim için hazır singleton nesnesi
cfg = ConfigManager()
