"""Argon-bilig — ESP32 & IoT Saha Telemetrisi Servisi

Sorumluluk: Firebase REST mikroklima telemetrisini okur, 90 sn bayatlık ve
fiziksel sınır denetimi yapar; donanım yokken test yapabilmek için sentetik
simülasyon sağlar.
"""

import time
from datetime import UTC, datetime
from typing import Any

import requests

from config.config_manager import cfg


class Esp32TelemetryService:
    """ESP32 saha istasyonu veri okuyucu ve doğrulayıcı."""

    def __init__(self, heartbeat_timeout_sec: int = 90):
        self.heartbeat_timeout_sec = heartbeat_timeout_sec
        self._consecutive_failures = 0
        self._max_failures = 3

    def get_telemetry(
        self,
        simulate: bool = False,
        sim_temp: float = 17.5,
        sim_hum: float = 88.0,
        sim_wetness: bool = True,
    ) -> dict[str, Any]:
        """İstasyondan canlı telemetri çeker;

        simülasyon aktifse veya cihaz yoksa kontrollü yapay veri üretir.
        """
        # 1. Simülasyon Modu (Test Laboratuvarı İçin)
        if simulate:
            return self._generate_simulated_state(sim_temp, sim_hum, sim_wetness)

        # 2. Firebase URL Yapılandırmasını Denetle
        station_cfg = cfg.config.get("station", {})
        firebase_url = station_cfg.get("firebase_url", "").strip()
        node_path = station_cfg.get("node_path", "esp32_station").strip()

        if not firebase_url:
            return self._set_offline_state(
                "ESP32 / Firebase URL yapılandırılmadı (Simülasyon modunu açabilirsiniz)."
            )

        # Temiz Endpoint Oluştur: https://<db>.firebaseio.com/esp32_station.json
        clean_url = firebase_url.rstrip("/")
        endpoint = f"{clean_url}/{node_path}.json"

        try:
            response = requests.get(
                endpoint, headers={"Accept": "application/json"}, timeout=5
            )
            response.raise_for_status()
            raw_data = response.json()

            if not raw_data or not isinstance(raw_data, dict):
                return self._set_offline_state(
                    "Geçersiz veri: Telemetri düğümü boş veya hatalı format."
                )

            return self._validate_and_commit(raw_data)

        except Exception as e:  # noqa: BLE001
            self._consecutive_failures += 1
            return self._set_offline_state(f"İstasyon bağlantı hatası: {e!s}")

    def _validate_and_commit(self, data: dict[str, Any]) -> dict[str, Any]:
        """Fiziksel limitleri ve 90 sn veri tazeliğini doğrular."""
        # Sıcaklık ve nem çözümleme
        temp_val = data.get("temperature", data.get("temp"))
        hum_val = data.get("humidity", data.get("hum"))
        wetness = bool(
            data.get(
                "leafWetness", data.get("wetness", data.get("leaf_wetness", False))
            )
        )

        try:
            temp = float(temp_val)
            hum = float(hum_val)
        except (TypeError, ValueError):
            return self._set_offline_state(
                "Bozuk veri: Sıcaklık veya nem sayısal değil."
            )

        # Fiziksel sınır kontrolü (-25°C..65°C / %0..%100)
        if not (-25.0 <= temp <= 65.0) or not (0.0 <= hum <= 100.0):
            return self._set_offline_state(
                "Sensör okumaları fiziksel sınırların dışında (-25°C..65°C / %0..%100)."
            )

        # Zaman Damgası (Timestamp) Tazelik Denetimi
        raw_ts = data.get("timestamp", data.get("lastSeen", data.get("time")))
        if raw_ts is None:
            return self._set_offline_state(
                "Zaman damgası eksik; veri tazeliği doğrulanamıyor."
            )

        reading_time_sec = 0.0
        try:
            if isinstance(raw_ts, (int, float)):
                reading_time_sec = raw_ts / 1000.0 if raw_ts > 1e11 else float(raw_ts)
            elif isinstance(raw_ts, str):
                dt = datetime.fromisoformat(raw_ts.replace("Z", "+00:00"))
                reading_time_sec = dt.timestamp()
        except Exception:  # noqa: BLE001
            return self._set_offline_state("Geçersiz zaman damgası formatı alındı.")

        now_sec = time.time()
        age_sec = now_sec - reading_time_sec

        # 90 Saniyeden eskiyse bayat kabul et
        if age_sec > self.heartbeat_timeout_sec:
            return self._set_offline_state(
                f"Veri bayat: Son sensör verisi {int(age_sec)} sn önce üretilmiş."
            )

        # 120 saniyeden fazla gelecekteyse cihaz saati bozuktur
        if age_sec < -120.0:
            return self._set_offline_state(
                "Donanım saat senkronizasyonu hatalı (Gelecek zaman damgası)."
            )

        self._consecutive_failures = 0
        valid_date = datetime.fromtimestamp(reading_time_sec, tz=UTC)

        return {
            "is_online": True,
            "temperature": round(temp, 1),
            "humidity": round(hum, 1),
            "leaf_wetness": wetness,
            "last_seen": valid_date.strftime("%H:%M:%S"),
            "last_seen_iso": valid_date.isoformat(),
            "error_message": None,
            "is_simulated": False,
        }

    def _generate_simulated_state(
        self, temp: float, hum: float, wetness: bool
    ) -> dict[str, Any]:
        """Test Laboratuvarı için kontrollü sentetik sensör verisi üretir."""
        now = datetime.now(UTC)
        return {
            "is_online": True,
            "temperature": round(float(temp), 1),
            "humidity": round(float(hum), 1),
            "leaf_wetness": bool(wetness),
            "last_seen": now.strftime("%H:%M:%S (Simüle)"),
            "last_seen_iso": now.isoformat(),
            "error_message": None,
            "is_simulated": True,
        }

    def _set_offline_state(self, reason: str) -> dict[str, Any]:
        """İstasyon çevrimdışı olduğunda güvenli durum döndürür."""
        return {
            "is_online": False,
            "temperature": None,
            "humidity": None,
            "leaf_wetness": False,
            "last_seen": None,
            "last_seen_iso": None,
            "error_message": reason,
            "is_simulated": False,
        }


# Kolay erişim için hazır nesne
esp32_service = Esp32TelemetryService()


if __name__ == "__main__":
    print("=" * 60)
    print("Argon-bilig ESP32 Telemetri Servisi Testi")
    print("=" * 60)

    # 1. Gerçek Bağlantı Denetimi (URL tanımlı değilken)
    real_state = esp32_service.get_telemetry(simulate=False)
    print(f"[*] Gerçek İstasyon Durumu : Çevrimdışı={not real_state['is_online']}")
    print(f"[*] Mesaj                   : {real_state['error_message']}")

    # 2. Sentetik Simülasyon Testi
    sim_state = esp32_service.get_telemetry(
        simulate=True, sim_temp=16.8, sim_hum=92.0, sim_wetness=True
    )
    print("\n[*] Simülasyon Testi:")
    print(f"[+] Çevrimiçi mi?           : {sim_state['is_online']}")
    print(f"[+] Sıcaklık                : {sim_state['temperature']} °C")
    print(f"[+] Bağıl Nem               : %{sim_state['humidity']}")
    print(f"[+] Yaprak Islaklığı        : {sim_state['leaf_wetness']}")
    print(f"[+] Son Görülme             : {sim_state['last_seen']}")
    print("=" * 60)
    print("ESP32 telemetri katmanı hazır!")
