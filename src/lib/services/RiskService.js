/**
 * Argon-bilig — RiskService.js
 * Mimari Katman: Etki Alanı Servisleri (Domain Logic)
 * Tasarım Deseni: Rule Engine & Sensor Fusion Dual Evaluator
 * Sorumluluk: Halkalı Leke ve Pas Akarı epidemiyolojik modellemesi, anlık reçete ve anti-spam bildirimleri.
 */

import { AppConfig } from "../config/AppConfig.svelte.js";

/** @typedef {import("../config/AppConfig.svelte.js").Thresholds} Thresholds */
/** @typedef {import("./WeatherService.js").MeteorologicalDTO} MeteorologicalDTO */
/** @typedef {import("./Esp32Service.js").Esp32State} Esp32State */

/**
 * @typedef {"low" | "moderate" | "high" | "critical"} RiskLevel
 */

/**
 * @typedef {Object} RiskSubAssessment
 * @property {number} score
 * @property {RiskLevel} level
 * @property {string} title
 * @property {string} badgeClass
 * @property {string} description
 * @property {string} action
 */

/**
 * @typedef {Object} OverallRiskAssessment
 * @property {number} score
 * @property {RiskLevel} level
 * @property {string} badgeClass
 * @property {"none" | "peacock" | "mite"} dominantThreat
 * @property {string} title
 */

/**
 * @typedef {Object} RiskMetrics
 * @property {number} activeTemp
 * @property {number} activeHum
 * @property {number} rain48h
 * @property {boolean} isEspActive
 * @property {boolean} leafWetness
 * @property {string} source
 * @property {string} cultivar
 */

/**
 * @typedef {Object} DualRiskAssessmentDTO
 * @property {RiskSubAssessment} peacock
 * @property {RiskSubAssessment} mite
 * @property {OverallRiskAssessment} overall
 * @property {RiskMetrics} metrics
 * @property {string} evaluatedAt
 */

/**
 * DualRiskAssessmentDTO Fabrika Fonksiyonu
 * İmmutable (dondurulmuş) veri sözleşmesini garanti eder.
 * @param {{ peacock: RiskSubAssessment, mite: RiskSubAssessment, overall: OverallRiskAssessment, metrics: RiskMetrics }} params
 * @returns {Readonly<DualRiskAssessmentDTO>}
 */
function createDualRiskDTO({ peacock, mite, overall, metrics }) {
  return Object.freeze({
    peacock: Object.freeze({ ...peacock }),
    mite: Object.freeze({ ...mite }),
    overall: Object.freeze({ ...overall }),
    metrics: Object.freeze({ ...metrics }),
    evaluatedAt: new Date().toISOString(),
  });
}

class DualRiskEvaluatorService {
  #lastNotificationTimestamp = 0;
  #notificationCooldownMs = 30 * 60 * 1000; // 30 Dakika Anti-Spam Soğuma Süresi

  /**
   * İkili Epidemiyolojik Risk Değerlendirmesini Yürütür
   * @param {MeteorologicalDTO | null | undefined} weatherData
   * @param {Esp32State | null | undefined} espData
   * @returns {Readonly<DualRiskAssessmentDTO>}
   */
  evaluateDualRisk(weatherData, espData) {
    if (!weatherData || !weatherData.current) {
      return this.#getEmptyDualState(
        "Meteorolojik tahmin verisi bekleniyor...",
      );
    }

    // 1. ESP32 Telemetri Veri Bütünlüğü Doğrulaması (Crash Prevention)
    const isEspActive = Boolean(
      espData &&
      espData.isOnline &&
      typeof espData.temperature === "number" &&
      Number.isFinite(espData.temperature) &&
      typeof espData.humidity === "number" &&
      Number.isFinite(espData.humidity),
    );

    const activeTemp =
      isEspActive && espData && typeof espData.temperature === "number"
        ? espData.temperature
        : Number(weatherData.current.temperature ?? 0);

    const activeHum =
      isEspActive && espData && typeof espData.humidity === "number"
        ? espData.humidity
        : Number(weatherData.current.humidity ?? 0);

    const isLeafWet =
      isEspActive && espData ? Boolean(espData.leafWetness) : false;
    const rain48h = Math.max(
      0,
      Number(weatherData.forecast48h?.totalRainMm ?? 0),
    );

    // 2. Yapılandırma ve Biyolojik Eşikleri Çözümleme
    const thresholds = AppConfig.getThresholds();
    const specs = AppConfig.getGemlikSpecs();

    // 3. Paralel Biyolojik Risk Hesaplamaları
    const peacockEval = this.#evaluatePeacockRisk(
      activeTemp,
      activeHum,
      rain48h,
      isLeafWet,
      thresholds,
      specs,
    );

    const miteEval = this.#evaluateMiteRisk(
      activeTemp,
      activeHum,
      rain48h,
      thresholds,
      specs,
    );

    // 4. Baskın Tehdit ve Genel Risk Seviyesi Analizi
    const maxScore = Math.max(peacockEval.score, miteEval.score);

    /** @type {RiskLevel} */
    let overallLevel = "low";
    let overallBadge = "bg-emerald-100 text-emerald-700";
    /** @type {"none" | "peacock" | "mite"} */
    let dominantThreat = "none";
    let overallTitle = "Düşük Tehdit Seviyesi";

    if (maxScore >= 80) {
      overallLevel = "critical";
      overallBadge = "bg-red-100 text-red-700 animate-pulse";
    } else if (maxScore >= 60) {
      overallLevel = "high";
      overallBadge = "bg-orange-100 text-orange-700";
    } else if (maxScore >= 40) {
      overallLevel = "moderate";
      overallBadge = "bg-amber-100 text-amber-700";
    }

    if (overallLevel !== "low") {
      dominantThreat = peacockEval.score >= miteEval.score ? "peacock" : "mite";
      overallTitle =
        dominantThreat === "peacock" ? peacockEval.title : miteEval.title;
    }

    // 5. Anti-Spam Sistem Bildirimi Tetikleyicisi (%80 Eşik Kuralı)
    if (maxScore >= 80 && dominantThreat !== "none") {
      const alertTitle =
        dominantThreat === "peacock"
          ? "Argon-bilig: Kritik Halkalı Leke Riski!"
          : "Argon-bilig: Kritik Pas Akarı Tehdidi!";
      const alertDesc =
        dominantThreat === "peacock" ? peacockEval.action : miteEval.action;
      this.#dispatchNotification(alertTitle, alertDesc);
    }

    return createDualRiskDTO({
      peacock: peacockEval,
      mite: miteEval,
      overall: {
        score: maxScore,
        level: overallLevel,
        badgeClass: overallBadge,
        dominantThreat: dominantThreat,
        title: overallTitle,
      },
      metrics: {
        activeTemp: Number(activeTemp.toFixed(1)),
        activeHum: Number(activeHum.toFixed(0)),
        rain48h: Number(rain48h.toFixed(1)),
        isEspActive: isEspActive,
        leafWetness: isLeafWet,
        source: isEspActive
          ? "ESP32 Saha İstasyonu"
          : `${(weatherData.provider || "Meteoroloji").toUpperCase()} Servisi`,
        cultivar: "Gemlik (Trilye)",
      },
    });
  }

  /**
   * Halkalı Leke (Spilocaea oleagina) Çimlenme Riski
   * @param {number} temp
   * @param {number} hum
   * @param {number} rain48h
   * @param {boolean} isLeafWet
   * @param {Record<string, any>} thresholds
   * @param {Record<string, any>} specs
   * @returns {RiskSubAssessment}
   */
  #evaluatePeacockRisk(temp, hum, rain48h, isLeafWet, thresholds, specs) {
    const tempMin = thresholds?.peacockTempMin ?? 10;
    const tempMax = thresholds?.peacockTempMax ?? 20;
    const humThreshold = thresholds?.peacockHumidity ?? 85;
    const rainTrigger = thresholds?.peacockRainTrigger ?? 2.0;

    const isTempOptimum = temp >= tempMin && temp <= tempMax;
    const isMoistureCritical = hum >= humThreshold || isLeafWet;
    const isRainCritical = rain48h >= rainTrigger;

    let score = 12;
    /** @type {RiskLevel} */
    let level = "low";
    let title = "Düşük Tehdit";
    let badgeClass = "bg-emerald-100 text-emerald-700";
    let description =
      "Hava koşulları spor gelişimi ve enfeksiyon için elverişsiz.";
    let action =
      "Rutin bahçe kontrollerine devam ediniz. Acil bir ilaçlama gerekmez.";

    if (isTempOptimum && isMoistureCritical) {
      if (isRainCritical) {
        score = 85 + Math.min(13, rain48h * 2);
        level = "critical";
        title = "Kritik Enfeksiyon Riski (Halkalı Leke)";
        badgeClass = "bg-red-100 text-red-700 animate-pulse";
        description = `Önümüzdeki 48 saatte yağış bekleniyor (${rain48h.toFixed(1)} mm) ve nem kritik eşiğin üzerinde (%${hum.toFixed(0)}). Gemlik zeytini yapraklarında spor çimlenmesi için koşullar tam uygundur.`;

        const treatment =
          specs?.targetDiseases?.peacockSpot?.treatments?.early ||
          "Bakır Sülfat / Bordo Bulamacı";
        action = `Yağış başlamadan önce acil olarak ${treatment} ile kaplama ilaçlama yapınız!`;
      } else {
        score = 68;
        level = "high";
        title = "Yüksek Spor Tehdidi (Halkalı Leke)";
        badgeClass = "bg-orange-100 text-orange-700";
        description = `Sıcaklık (${temp.toFixed(1)}°C) ve rutubet spor çimlenme aralığındadır. Yağış olmasa da yaprak ıslaklığı enfeksiyonu başlatabilir.`;
        action =
          "Hava kapalı seyrederse koruyucu bakırlı ilaçlama hazırlığı yapınız.";
      }
    } else if (isTempOptimum && hum >= humThreshold - 10) {
      score = 45;
      level = "moderate";
      title = "Orta Düzey Risk (Halkalı Leke)";
      badgeClass = "bg-amber-100 text-amber-700";
      description =
        "Nem seviyeleri sınırda. Yağış olmaması durumunda yayılım sınırlı kalacaktır.";
      action = "İç taç dallarında hava sirkülasyonunu gözlemleyin.";
    }

    return {
      score: Math.min(100, Math.round(score)),
      level,
      title,
      badgeClass,
      description,
      action,
    };
  }

  /**
   * Zeytin Pas Akarı (Aceria oleae) Kolonizasyon Riski
   * @param {number} temp
   * @param {number} hum
   * @param {number} rain48h
   * @param {Record<string, any>} thresholds
   * @param {Record<string, any>} specs
   * @returns {RiskSubAssessment}
   */
  #evaluateMiteRisk(temp, hum, rain48h, thresholds, specs) {
    const miteTempMin = thresholds?.miteTempMin ?? 22;
    const miteHumMax = thresholds?.miteHumidityMax ?? 70;
    const hasRainSuppression = rain48h > 5.0;

    let score = 10;
    /** @type {RiskLevel} */
    let level = "low";
    let title = "Düşük Zararlı Baskısı";
    let badgeClass = "bg-emerald-100 text-emerald-700";
    let description =
      "Hava koşulları pas akarlarının sürgünlerde çoğalması için elverişsiz.";
    let action = "Rutin sürgün gelişim takibi yeterlidir.";

    if (temp >= miteTempMin && hum <= miteHumMax && !hasRainSuppression) {
      const tempExcess = temp - miteTempMin;
      score = Math.min(100, 75 + tempExcess * 3);
      level = score >= 80 ? "critical" : "high";
      title =
        level === "critical"
          ? "Kritik Pas Akarı Popülasyonu"
          : "Yüksek Zararlı Baskısı (Pas Akarı)";
      badgeClass =
        level === "critical"
          ? "bg-red-100 text-red-700 animate-pulse"
          : "bg-orange-100 text-orange-700";
      description = `Ilık hava (${temp.toFixed(1)}°C) ve kuru mikroklimalar (%${hum.toFixed(0)}) Gemlik taze sürgünlerinde pas akarı popülasyonunu hızla patlatabilir.`;

      const treatment =
        specs?.targetDiseases?.rustMite?.treatments?.standard ||
        "Kükürt veya ruhsatlı akarisit";
      action = `Taze sürgünlerin alt yüzeylerini büyüteçle inceleyiniz. Koloni tespit edilirse ${treatment} uygulayınız.`;
    } else if (temp >= 19 && hum <= 75) {
      score = 50;
      level = "moderate";
      title = "Orta Düzey Tehdit (Pas Akarı)";
      badgeClass = "bg-amber-100 text-amber-700";
      description =
        "Sıcaklıklar yükselme eğiliminde. Kuru günlerde yaprak altı taraması yapılmalıdır.";
      action =
        "Uç sürgünlerde kıvrılma veya gümüşi renk değişimi olup olmadığını kontrol ediniz.";
    }

    return {
      score: Math.min(100, Math.round(score)),
      level,
      title,
      badgeClass,
      description,
      action,
    };
  }

  /**
   * @param {string} message
   * @returns {Readonly<DualRiskAssessmentDTO>}
   */
  #getEmptyDualState(message) {
    /** @type {RiskSubAssessment} */
    const emptySub = {
      score: 0,
      level: "low",
      title: "Veri Bekleniyor",
      badgeClass: "bg-slate-100 text-slate-600",
      description: message,
      action: "Sensör ve meteoroloji verileri senkronize ediliyor.",
    };

    return createDualRiskDTO({
      peacock: emptySub,
      mite: emptySub,
      overall: {
        score: 0,
        level: "low",
        badgeClass: "bg-slate-100 text-slate-600",
        dominantThreat: "none",
        title: "Hesaplanıyor...",
      },
      metrics: {
        activeTemp: 0,
        activeHum: 0,
        rain48h: 0,
        isEspActive: false,
        leafWetness: false,
        source: "Belirsiz",
        cultivar: "Gemlik (Trilye)",
      },
    });
  }

  /**
   * @param {string} title
   * @param {string} body
   */
  #dispatchNotification(title, body) {
    const now = Date.now();
    if (now - this.#lastNotificationTimestamp < this.#notificationCooldownMs) {
      return;
    }

    if (
      typeof window !== "undefined" &&
      "Notification" in window &&
      Notification.permission === "granted"
    ) {
      try {
        new Notification(title, {
          body: body,
          icon: "/favicon.ico",
        });
        this.#lastNotificationTimestamp = now;
      } catch (err) {
        console.warn("[RiskService] Bildirim gönderilemedi:", err);
      }
    }
  }
}

export const RiskService = new DualRiskEvaluatorService();
