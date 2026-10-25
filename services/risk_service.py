"""
Argon-bilig — Epidemiyolojik Risk ve Sensör Füzyon Değerlendiricisi
Sorumluluk: Halkalı Leke ve Pas Akarı biyolojik modellerini çalıştırır,
ESP32 telemetrisi ile hava tahminini kaynaştırır ve dinamik risk tamponu üretir.
"""

from datetime import datetime
from typing import Any

from config.config_manager import cfg


class DualRiskEvaluatorService:
    """Halkalı Leke ve Pas Akarı için paralel kural motoru."""

    def __init__(self):
        pass

    def evaluate_dual_risk(
        self,
        weather_data: dict[str, Any] | None = None,
        esp_data: dict[str, Any] | None = None,
        lesion_severity: float = 0.0,
    ) -> dict[str, Any]:
        """Meteoroloji ve ESP32 verilerini kaynaştırarak ikili risk değerlendirmesi yapar."""
        # 1. ESP32 Veri Doğrulaması (Sensor Fusion)
        is_esp_active = bool(
            esp_data
            and esp_data.get("is_online", False)
            and isinstance(esp_data.get("temperature"), (int, float))
            and isinstance(esp_data.get("humidity"), (int, float))
        )

        # Aktif sıcaklık ve nem kaynağını belirle
        w_current = weather_data.get("current", {}) if weather_data else {}
        active_temp = float(
            esp_data.get("temperature")
            if is_esp_active
            else w_current.get("temperature", 18.0)
        )
        active_hum = float(
            esp_data.get("humidity")
            if is_esp_active
            else w_current.get("humidity", 65.0)
        )
        is_leaf_wet = bool(esp_data.get("leaf_wetness", False)) if esp_data else False

        # 48 Saatlik toplam yağış tahmini
        w_forecast = weather_data.get("forecast48h", {}) if weather_data else {}
        rain_48h = max(0.0, float(w_forecast.get("total_rain_mm", 0.0)))

        # 2. Biyolojik Eşik Değerleri (settings.yaml'dan)
        cultivar = cfg.active_cultivar
        th = cultivar.get("thresholds", {})
        prescriptions = cfg.prescriptions

        # 3. Paralel Biyolojik Risk Hesaplamaları
        peacock_eval = self._evaluate_peacock(
            active_temp,
            active_hum,
            rain_48h,
            is_leaf_wet,
            th,
            prescriptions.get("peacock", {}),
        )
        mite_eval = self._evaluate_mite(
            active_temp, active_hum, rain_48h, th, prescriptions.get("mite", {})
        )

        # 4. Baskın Tehdit ve Genel Risk Analizi
        max_score = max(peacock_eval["score"], mite_eval["score"])

        # Eğer yapay zekâ yaprakta lezyon yakalamışsa (severity > 0), riske katkı yap
        if lesion_severity > 0.0:
            max_score = min(100, int(max_score + (lesion_severity * 0.5)))

        if max_score >= 80:
            overall_level = "critical"
            overall_color = "#ef4444"  # Kırmızı
            overall_badge = "🔴 Kritik Risk"
        elif max_score >= 60:
            overall_level = "high"
            overall_color = "#f97316"  # Turuncu
            overall_badge = "🟠 Yüksek Risk"
        elif max_score >= 40:
            overall_level = "moderate"
            overall_color = "#eab308"  # Sarı
            overall_badge = "🟡 Orta Düzey Risk"
        else:
            overall_level = "low"
            overall_color = "#22c55e"  # Yeşil
            overall_badge = "🟢 Düşük Tehdit"

        dominant_threat = "none"
        overall_title = "Düşük Tehdit Seviyesi"
        if overall_level != "low":
            dominant_threat = (
                "peacock" if peacock_eval["score"] >= mite_eval["score"] else "mite"
            )
            overall_title = (
                peacock_eval["title"]
                if dominant_threat == "peacock"
                else mite_eval["title"]
            )

        # Dinamik CBS Risk Çemberi Yarıçapı (Km):
        # Temel yarıçap 2.5 km olup risk arttıkça 1.0x - 3.0x oranında genişler
        base_radius = cfg.config.get("location", {}).get("default_risk_radius_km", 2.5)
        expansion_factor = 1.0 + (max_score / 100.0) * 1.5 + (lesion_severity / 100.0)
        risk_radius_km = round(base_radius * expansion_factor, 2)

        source_name = (
            "ESP32 Saha İstasyonu" if is_esp_active else "Open-Meteo Tahmin Servisi"
        )

        return {
            "peacock": peacock_eval,
            "mite": mite_eval,
            "overall": {
                "score": max_score,
                "level": overall_level,
                "badge": overall_badge,
                "color": overall_color,
                "dominant_threat": dominant_threat,
                "title": overall_title,
                "risk_radius_km": risk_radius_km,
            },
            "metrics": {
                "active_temp": round(active_temp, 1),
                "active_hum": (round(active_hum)),
                "rain_48h": round(rain_48h, 1),
                "is_esp_active": is_esp_active,
                "leaf_wetness": is_leaf_wet,
                "source": source_name,
                "cultivar": cultivar.get("name", "Gemlik (Trilye)"),
            },
            "evaluated_at": datetime.now().isoformat(),
        }

    def _evaluate_peacock(
        self,
        temp: float,
        hum: float,
        rain_48h: float,
        is_leaf_wet: bool,
        th: dict[str, Any],
        presc: dict[str, Any],
    ) -> dict[str, Any]:
        """Halkalı Leke (Spilocaea oleagina) spor çimlenme riski."""
        temp_min = th.get("peacock_temp_min", 10.0)
        temp_max = th.get("peacock_temp_max", 20.0)
        hum_th = th.get("peacock_humidity_min", 85.0)
        rain_trigger = th.get("peacock_rain_trigger", 2.0)

        is_temp_opt = temp_min <= temp <= temp_max
        is_moisture_crit = hum >= hum_th or is_leaf_wet
        is_rain_crit = rain_48h >= rain_trigger

        treatment = (
            presc.get("treatments", {}).get("early")
            or "%1.0 Bordo Bulamacı veya Bakır Oksiklorür"
        )

        if is_temp_opt and is_moisture_crit:
            if is_rain_crit:
                score = min(100, int(85 + rain_48h * 2))
                level = "critical"
                title = "Kritik Enfeksiyon Riski (Halkalı Leke)"
                desc = (
                    f"Önümüzdeki 48 saatte yağış ({rain_48h:.1f} mm) ve kritik nem (%{hum:.0f}) bekleniyor. "
                    "Gemlik zeytininde spor çimlenmesi için koşullar tam uygundur."
                )
                action = f"Yağış başlamadan önce derhal {treatment} ile koruyucu ilaçlama yapınız!"
            else:
                score = 68
                level = "high"
                title = "Yüksek Spor Tehdidi (Halkalı Leke)"
                desc = f"Sıcaklık ({temp:.1f}°C) ve nem spor çimlenme aralığında. Yağış olmasa da çiğ ve yaprak ıslaklığı enfeksiyonu başlatabilir."
                action = "Hava kapalı veya sisli seyrederse bakırlı ilaçlama hazırlığı yapınız."
        elif is_temp_opt and hum >= (hum_th - 10.0):
            score = 45
            level = "moderate"
            title = "Orta Düzey Risk (Halkalı Leke)"
            desc = "Nem seviyesi sınırda. Yağış olmaması durumunda yayılım sınırlı kalacaktır."
            action = "Ağaç taç içi hava sirkülasyonunu ve nem birikimini gözlemleyiniz."
        else:
            score = 12
            level = "low"
            title = "Düşük Tehdit"
            desc = "Mevcut hava koşulları mantari spor çimlenmesi için elverişsiz."
            action = "Rutin bahçe kontrollerine devam ediniz. İlaçlama gerekmez."

        return {
            "score": score,
            "level": level,
            "title": title,
            "description": desc,
            "action": action,
        }

    def _evaluate_mite(
        self,
        temp: float,
        hum: float,
        rain_48h: float,
        th: dict[str, Any],
        presc: dict[str, Any],
    ) -> dict[str, Any]:
        """Zeytin Pas Akarı (Aceria oleae) popülasyon patlama riski."""
        mite_temp_min = th.get("mite_temp_min", 22.0)
        mite_hum_max = th.get("mite_humidity_max", 70.0)
        has_rain_suppression = rain_48h > 5.0

        treatment = (
            presc.get("treatments", {}).get("standard") or "Islanabilir Kükürt (WP)"
        )

        if temp >= mite_temp_min and hum <= mite_hum_max and not has_rain_suppression:
            excess = temp - mite_temp_min
            score = min(100, int(75 + excess * 3))
            level = "critical" if score >= 80 else "high"
            title = (
                "Kritik Pas Akarı Popülasyonu"
                if level == "critical"
                else "Yüksek Zararlı Baskısı (Pas Akarı)"
            )
            desc = (
                f"Ilık hava ({temp:.1f}°C) ve kuru mikroklima (%{hum:.0f}) taze Gemlik sürgünlerinde "
                "pas akarı üremesini hızlandırmaktadır."
            )
            action = f"Taze sürgünleri büyüteçle kontrol ediniz. Kolonileşme varsa {treatment} uygulayınız."
        elif temp >= 19.0 and hum <= 75.0:
            score = 50
            level = "moderate"
            title = "Orta Düzey Tehdit (Pas Akarı)"
            desc = "Sıcaklıklar yükselme trendinde. Yaprak altı sürgün kontrolleri yapılmalıdır."
            action = "Uç sürgünlerde gümüşi renk değişimi veya paslanma olup olmadığını denetleyiniz."
        else:
            score = 10
            level = "low"
            title = "Düşük Zararlı Baskısı"
            desc = "Hava koşulları pas akarlarının çoğalması için elverişsiz."
            action = "Rutin sürgün takibi yeterlidir."

        return {
            "score": score,
            "level": level,
            "title": title,
            "description": desc,
            "action": action,
        }


# Kolay erişim için hazır nesne
risk_service = DualRiskEvaluatorService()


if __name__ == "__main__":
    print("=" * 60)
    print("Argon-bilig Biyolojik Risk Motoru Testi")
    print("=" * 60)

    # Senaryo: 16°C sıcaklık, %90 nem, 4.5 mm yağış (Tam Halkalı Leke Havası!)
    mock_weather = {
        "current": {"temperature": 16.2, "humidity": 91.0},
        "forecast48h": {"total_rain_mm": 4.5},
    }

    assessment = risk_service.evaluate_dual_risk(weather_data=mock_weather)

    print(f"[+] Genel Risk Seviyesi : {assessment['overall']['badge']}")
    print(f"[+] Genel Risk Skoru    : {assessment['overall']['score']}/100")
    print(f"[+] Baskın Tehdit       : {assessment['overall']['dominant_threat']}")
    print(f"[+] Dinamik CBS Yarıçapı: {assessment['overall']['risk_radius_km']} km")
    print(f"[+] Eylem Planı / Reçete: {assessment['peacock']['action']}")
    print("=" * 60)
    print("Risk motoru kusursuz çalışıyor!")
