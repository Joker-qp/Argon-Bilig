"""Argon-bilig — Meteoroloji Veri Orkestratörü (Koordinat Duyarlı Cache)

Sorumluluk: Her coğrafi koordinat (lat, lon) için bağımsız Open-Meteo tahmini
alır ve koordinat bazlı önbellekler.
"""

import time
from datetime import UTC, datetime
from typing import Any

import requests

from config.config_manager import cfg


class WeatherServiceOrchestrator:
    """Ağ hatalarına karşı dayanıklı, koordinat duyarlı önbellekli meteoroloji servisi."""

    def __init__(self, cache_ttl_sec: int = 600):
        self.cache_ttl_sec = cache_ttl_sec  # 10 Dakika
        # Her koordinat için ayrı önbellek sözlüğü: {"lat_lon": {"data": ..., "time": ...}}
        self._geo_cache: dict[str, dict[str, Any]] = {}

    def get_forecast(
        self,
        lat: float | None = None,
        lon: float | None = None,
        force_refresh: bool = False,
    ) -> dict[str, Any]:
        """Tıklanan her yeni koordinat için dinamik hava tahmini çeker."""
        loc_cfg = cfg.config.get("location", {})
        target_lat = (
            round(float(lat), 4)
            if lat is not None
            else float(loc_cfg.get("latitude", 40.4286))
        )
        target_lon = (
            round(float(lon), 4)
            if lon is not None
            else float(loc_cfg.get("longitude", 29.1556))
        )

        # Koordinata özel önbellek anahtarı (örn: "40.43_29.16")
        cache_key = f"{target_lat:.2f}_{target_lon:.2f}"
        now = time.time()

        # Bu koordinat için önbellekte taze veri var mı?
        if not force_refresh and cache_key in self._geo_cache:
            entry = self._geo_cache[cache_key]
            if (now - entry["time"]) < self.cache_ttl_sec:
                return entry["data"]

        try:
            # Yeni koordinat için Open-Meteo'dan anlık veri çek
            forecast = self._fetch_open_meteo(target_lat, target_lon)
            self._geo_cache[cache_key] = {"data": forecast, "time": now}
            return forecast
        except Exception as e:  # noqa: BLE001
            print(
                f"[WeatherService] ({target_lat}, {target_lon}) için Open-Meteo çağrısı başarısız: {e}"
            )
            # Varsa eski veriyi döndür
            if cache_key in self._geo_cache:
                return self._geo_cache[cache_key]["data"]
            return self._create_fallback_dto(target_lat, target_lon, str(e))

    def _fetch_open_meteo(self, lat: float, lon: float) -> dict[str, Any]:
        """Open-Meteo API üzerinden tıklanan noktanın 48 saatlik verilerini toplar."""
        url = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": lat,
            "longitude": lon,
            "current": "temperature_2m,relative_humidity_2m,precipitation,weather_code",
            "hourly": "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation",
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
            "forecast_days": 3,
            "timezone": "auto",
        }

        response = requests.get(url, params=params, timeout=8)
        response.raise_for_status()
        data = response.json()

        current_data = data.get("current", {})
        current_temp = float(current_data.get("temperature_2m", 18.0))
        current_hum = float(current_data.get("relative_humidity_2m", 65.0))
        current_precip = float(current_data.get("precipitation", 0.0))

        hourly = data.get("hourly", {})
        hourly_times = hourly.get("time", [])
        current_time_str = current_data.get("time")

        start_idx = 0
        if current_time_str in hourly_times:
            start_idx = hourly_times.index(current_time_str)

        end_idx = min(len(hourly_times), start_idx + 48)

        hourly_rain_raw = hourly.get("precipitation", [])[start_idx:end_idx]
        hourly_temps_raw = hourly.get("temperature_2m", [])[start_idx:end_idx]
        hourly_hum_raw = hourly.get("relative_humidity_2m", [])[start_idx:end_idx]

        hourly_rain = [float(x or 0.0) for x in hourly_rain_raw]
        hourly_temps = [float(x or 0.0) for x in hourly_temps_raw]
        hourly_hum = [float(x or 0.0) for x in hourly_hum_raw]

        total_rain_48h = round(sum(hourly_rain), 2)

        daily = data.get("daily", {})
        daily_max = (
            daily.get("temperature_2m_max", [None])[0]
            if daily.get("temperature_2m_max")
            else None
        )
        daily_min = (
            daily.get("temperature_2m_min", [None])[0]
            if daily.get("temperature_2m_min")
            else None
        )

        return {
            "provider": "open-meteo",
            "current": {
                "temperature": round(current_temp, 1),
                "humidity": round(current_hum, 0),
                "precipitation": round(current_precip, 2),
            },
            "forecast48h": {
                "total_rain_mm": total_rain_48h,
                "hourly_rain": hourly_rain,
                "hourly_temps": hourly_temps,
                "hourly_humidity": hourly_hum,
            },
            "daily": {"temp_max": daily_max, "temp_min": daily_min},
            "city_name": f"Koordinat: {lat:.3f}°N, {lon:.3f}°E",
            "fetched_at": datetime.now(UTC).isoformat(),
            "fallback_triggered": False,
        }

    def _create_fallback_dto(
        self, lat: float, lon: float, error_msg: str
    ) -> dict[str, Any]:
        return {
            "provider": "offline-fallback",
            "current": {
                "temperature": 18.0,
                "humidity": 65.0,
                "precipitation": 0.0,
            },
            "forecast48h": {
                "total_rain_mm": 0.0,
                "hourly_rain": [0.0] * 48,
                "hourly_temps": [18.0] * 48,
                "hourly_humidity": [65.0] * 48,
            },
            "daily": {"temp_max": 22.0, "temp_min": 14.0},
            "city_name": f"Çevrimdışı ({lat:.2f}°, {lon:.2f}°)",
            "fetched_at": datetime.now(UTC).isoformat(),
            "fallback_triggered": True,
            "failure_reason": error_msg,
        }


weather_service = WeatherServiceOrchestrator()
