/**
 * Argon-bilig — HistoricalArchiveService.js
 * Mimari: Clean Architecture / Defensive Domain Service & LRU Bounded Cache
 * Sorumluluk: 60 günlük inkübasyon zaman şeridi (-30/+16 gün), ERA5 365 günlük soğuklama ve iklim arşivi.
 */

import { AppConfig } from "../config/AppConfig.svelte.js";

// ============================================================================
// HATA SINIFI VE SABİTLER (ERROR TYPES & CONSTANTS)
// ============================================================================

export class HistoricalArchiveError extends Error {
  /**
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(message, cause = null) {
    super(message);
    this.name = "HistoricalArchiveError";
    this.cause = cause;
  }
}

const NETWORK_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 Dakika
const CACHE_MAX_ENTRIES = 100; // Bellek sızıntısını (OOM) önleyen LRU tavanı
const ERA5_REANALYSIS_LAG_DAYS = 5; // Open-Meteo ERA5 arşivinin kesin veri gecikmesi

// ============================================================================
// DTO VE TİP TANIMLARI (JSDOC CONTRACTS)
// ============================================================================

/**
 * @typedef {Object} IncubationDayPoint
 * @property {string} date
 * @property {boolean} isPast
 * @property {boolean} isToday
 * @property {number} tMax
 * @property {number} tMin
 * @property {number} tMean
 * @property {number} rain
 * @property {number} humidity
 * @property {number} riskScore
 * @property {string} riskLevel
 */

/**
 * @typedef {Object} IncubationSummaryStats
 * @property {number} pastRainSum
 * @property {number} pastRiskDaysCount
 * @property {number} futureRainSum
 * @property {number} totalObservedDays
 */

/**
 * @typedef {Object} IncubationTimelineDTO
 * @property {IncubationDayPoint[]} dailyPoints
 * @property {IncubationSummaryStats} summaryStats
 * @property {string} generatedAt
 */

/**
 * @typedef {Object} MonthlyClimateSummary
 * @property {string} month
 * @property {number} avgTemp
 * @property {number} totalRain
 * @property {number} riskDays
 */

/**
 * @typedef {Object} AnnualArchiveDTO
 * @property {number} totalRainfallMm
 * @property {number} chillingHoursEstimate
 * @property {number} highRiskDaysCount
 * @property {MonthlyClimateSummary[]} monthlySummaries
 * @property {string} generatedAt
 */

// ============================================================================
// YARDIMCI VE SAVUNMACI MATEMATİKSEL FONKSİYONLAR
// ============================================================================

/**
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    /** @type {any} */
    const val = /** @type {any} */ (obj)[key];
    if (val !== null && typeof val === "object" && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return Object.freeze(obj);
}

/**
 * @param {number | string} lat
 * @param {number | string} lon
 * @returns {{ lat: number, lon: number, cacheKey: string }}
 */
function validateAndNormalizeCoordinates(lat, lon) {
  const latitude = typeof lat === "number" ? lat : Number(lat);
  const longitude = typeof lon === "number" ? lon : Number(lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    throw new TypeError(
      `[HistoricalArchive] Geçersiz koordinat girdisi: lat=${lat}, lon=${lon}. ` +
        `Enlem [-90, 90], boylam [-180, 180] aralığında geçerli bir sayı olmalıdır.`,
    );
  }

  return {
    lat: Number(latitude.toFixed(4)),
    lon: Number(longitude.toFixed(4)),
    cacheKey: `${latitude.toFixed(3)}_${longitude.toFixed(3)}`,
  };
}

/**
 * Kış Soğuklama İhtiyacı Hesabı (Chilling Hours)
 * Formül: Soğuklama Saati = Σ 1_{0°C < Tmin <= 7.2°C} * 7 saat
 * @param {number} tMin
 * @returns {number}
 */
function calculateDailyChillingHours(tMin) {
  if (!Number.isFinite(tMin)) return 0;
  return tMin > 0 && tMin <= 7.2 ? 7 : 0;
}

/**
 * Halkalı Leke (Spilocaea oleagina) Çimlenme Kriteri
 * @param {{ tMean: number, hum: number, rain: number, thresholds?: Record<string, any> }} params
 * @returns {{ riskScore: number, riskLevel: string, isRiskDay: boolean }}
 */
function evaluateDailyPeacockRisk({ tMean, hum, rain, thresholds }) {
  const tempMin = thresholds?.peacockTempMin ?? 10;
  const tempMax = thresholds?.peacockTempMax ?? 20;
  const humThreshold = thresholds?.peacockHumidity ?? 85;
  const rainMin =
    thresholds?.peacockRainTrigger ?? thresholds?.peacockRainMin ?? 2.0;

  const isOptimumTemp = tMean >= tempMin && tMean <= tempMax;

  let riskScore = 12;

  if (isOptimumTemp) {
    if (hum >= humThreshold) {
      if (rain >= rainMin) {
        riskScore = Math.min(100, Math.round(85 + Math.min(13, rain * 2)));
      } else {
        riskScore = 68;
      }
    } else if (hum >= 75) {
      riskScore = 45;
    }
  }

  let riskLevel = "low";
  if (riskScore >= 80) {
    riskLevel = "critical";
  } else if (riskScore >= 65) {
    riskLevel = "high";
  } else if (riskScore >= 45) {
    riskLevel = "moderate";
  }

  return {
    riskScore,
    riskLevel,
    isRiskDay: riskScore >= 65,
  };
}

// ============================================================================
// DTO FABRİKALARI (DATA TRANSFER OBJECTS)
// ============================================================================

/**
 * @param {{ dailyPoints: IncubationDayPoint[], summaryStats: IncubationSummaryStats }} params
 * @returns {Readonly<IncubationTimelineDTO>}
 */
function createIncubationTimelineDTO({ dailyPoints, summaryStats }) {
  return deepFreeze({
    dailyPoints: Array.isArray(dailyPoints) ? dailyPoints : [],
    summaryStats: {
      pastRainSum: Number((summaryStats?.pastRainSum ?? 0).toFixed(1)),
      pastRiskDaysCount: Math.round(summaryStats?.pastRiskDaysCount ?? 0),
      futureRainSum: Number((summaryStats?.futureRainSum ?? 0).toFixed(1)),
      totalObservedDays: Math.round(summaryStats?.totalObservedDays ?? 0),
    },
    generatedAt: new Date().toISOString(),
  });
}

/**
 * @param {{ totalRainfallMm: number, chillingHoursEstimate: number, highRiskDaysCount: number, monthlySummaries: MonthlyClimateSummary[] }} params
 * @returns {Readonly<AnnualArchiveDTO>}
 */
function createAnnualArchiveDTO({
  totalRainfallMm,
  chillingHoursEstimate,
  highRiskDaysCount,
  monthlySummaries,
}) {
  return deepFreeze({
    totalRainfallMm: Number((totalRainfallMm || 0).toFixed(1)),
    chillingHoursEstimate: Math.round(chillingHoursEstimate || 0),
    highRiskDaysCount: Math.round(highRiskDaysCount || 0),
    monthlySummaries: Array.isArray(monthlySummaries) ? monthlySummaries : [],
    generatedAt: new Date().toISOString(),
  });
}

// ============================================================================
// BELLEK KORUMALI LRU ÖNBELLEK (BOUNDED LRU CACHE)
// ============================================================================

class BoundedCache {
  /** @type {Map<string, { data: any, timestamp: number }>} */
  #map = new Map();
  #maxSize;
  #ttlMs;

  /**
   * @param {number} [maxSize=CACHE_MAX_ENTRIES]
   * @param {number} [ttlMs=CACHE_TTL_MS]
   */
  constructor(maxSize = CACHE_MAX_ENTRIES, ttlMs = CACHE_TTL_MS) {
    this.#maxSize = maxSize;
    this.#ttlMs = ttlMs;
  }

  /**
   * @param {string} key
   * @returns {any | null}
   */
  get(key) {
    const entry = this.#map.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.#ttlMs) {
      this.#map.delete(key);
      return null;
    }

    this.#map.delete(key);
    this.#map.set(key, entry);
    return entry.data;
  }

  /**
   * @param {string} key
   * @param {any} data
   */
  set(key, data) {
    if (this.#map.has(key)) {
      this.#map.delete(key);
    } else if (this.#map.size >= this.#maxSize) {
      const oldestKey = this.#map.keys().next().value;
      if (oldestKey !== undefined) {
        this.#map.delete(oldestKey);
      }
    }
    this.#map.set(key, { data, timestamp: Date.now() });
  }

  clear() {
    this.#map.clear();
  }
}

// ============================================================================
// ANA SERVİS MOTORU (SERVICE ENGINE)
// ============================================================================

class HistoricalArchiveServiceEngine {
  #cache = {
    timeline: new BoundedCache(),
    annual: new BoundedCache(),
  };

  /**
   * @returns {{ thresholds: Record<string, any> }}
   */
  #resolveAppConfigContext() {
    /** @type {Record<string, any>} */
    let thresholds = {
      peacockTempMin: 10,
      peacockTempMax: 20,
      peacockHumidity: 85,
      peacockRainTrigger: 2.0,
      peacockRainMin: 2.0,
      miteTempMin: 22,
      miteHumidityMax: 70,
    };

    try {
      if (typeof AppConfig?.getThresholds === "function") {
        const cfgThresholds = AppConfig.getThresholds();
        if (cfgThresholds && typeof cfgThresholds === "object") {
          thresholds = { ...thresholds, ...cfgThresholds };
        }
      }
    } catch (configErr) {
      const msg =
        configErr instanceof Error ? configErr.message : String(configErr);
      console.warn(
        "[HistoricalArchive] AppConfig çözümlenemedi, standart agronomik eşikler devrede:",
        msg,
      );
    }

    return { thresholds };
  }

  /**
   * Geçmiş 30 gün ve gelecek 16 günlük inkübasyon zaman çizelgesini modeller.
   * @param {number | string} rawLat
   * @param {number | string} rawLon
   * @returns {Promise<Readonly<IncubationTimelineDTO>>}
   */
  async getIncubationTimeline(rawLat, rawLon) {
    const { lat, lon, cacheKey } = validateAndNormalizeCoordinates(
      rawLat,
      rawLon,
    );

    const cachedData = this.#cache.timeline.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", lat.toString());
      url.searchParams.set("longitude", lon.toString());
      url.searchParams.set("past_days", "30");
      url.searchParams.set("forecast_days", "16");
      url.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean",
      );
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new HistoricalArchiveError(
          `İnkübasyon zaman çizelgesi API yanıt hatası: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      if (
        data.error ||
        !data.daily ||
        !Array.isArray(data.daily.time) ||
        data.daily.time.length === 0
      ) {
        throw new HistoricalArchiveError(
          `Geçersiz Open-Meteo verisi: ${data.reason || "Günlük veri dizisi boş döndü."}`,
        );
      }

      const daily = data.daily;
      const dates = daily.time;
      const tMaxList = daily.temperature_2m_max || [];
      const tMinList = daily.temperature_2m_min || [];
      const tMeanList = daily.temperature_2m_mean || [];
      const rainList = daily.precipitation_sum || [];
      const humList = daily.relative_humidity_2m_mean || [];

      const localNowTimestamp =
        Date.now() + (Number(data.utc_offset_seconds) || 0) * 1000;
      const localTodayStr = new Date(localNowTimestamp)
        .toISOString()
        .split("T")[0];

      const { thresholds } = this.#resolveAppConfigContext();

      let pastRainSum = 0;
      let pastRiskDaysCount = 0;
      let futureRainSum = 0;

      /** @type {IncubationDayPoint[]} */
      const dailyPoints = dates.map(
        (/** @type {string} */ dateStr, /** @type {number} */ idx) => {
          const isPast = dateStr < localTodayStr;
          const isToday = dateStr === localTodayStr;

          const tMax = Number(tMaxList[idx] ?? 0);
          const tMin = Number(tMinList[idx] ?? 0);
          const tMean = Number(tMeanList[idx] ?? (tMax + tMin) / 2);
          const rain = Math.max(0, Number(rainList[idx] ?? 0));
          const hum = Math.max(0, Math.min(100, Number(humList[idx] ?? 0)));

          const { riskScore, riskLevel, isRiskDay } = evaluateDailyPeacockRisk({
            tMean,
            hum,
            rain,
            thresholds,
          });

          if (isPast) {
            pastRainSum += rain;
            if (isRiskDay) pastRiskDaysCount++;
          } else {
            futureRainSum += rain;
          }

          return {
            date: dateStr,
            isPast,
            isToday,
            tMax: Number(tMax.toFixed(1)),
            tMin: Number(tMin.toFixed(1)),
            tMean: Number(tMean.toFixed(1)),
            rain: Number(rain.toFixed(1)),
            humidity: Math.round(hum),
            riskScore,
            riskLevel,
          };
        },
      );

      const summaryStats = {
        pastRainSum,
        pastRiskDaysCount,
        futureRainSum,
        totalObservedDays: dailyPoints.length,
      };

      const timelineDTO = createIncubationTimelineDTO({
        dailyPoints,
        summaryStats,
      });

      this.#cache.timeline.set(cacheKey, timelineDTO);
      return timelineDTO;
    } catch (err) {
      if (err instanceof HistoricalArchiveError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new HistoricalArchiveError(
        `İnkübasyon zaman çizelgesi çözümlenirken sistem hatası oluştu: ${msg}`,
        err,
      );
    }
  }

  /**
   * Son 1 yıllık iklim arşivini (ERA5 Reanalysis) çeker ve analiz eder.
   * @param {number | string} rawLat
   * @param {number | string} rawLon
   * @returns {Promise<Readonly<AnnualArchiveDTO>>}
   */
  async getAnnualClimateArchive(rawLat, rawLon) {
    const { lat, lon, cacheKey } = validateAndNormalizeCoordinates(
      rawLat,
      rawLon,
    );

    const cachedData = this.#cache.annual.get(cacheKey);
    if (cachedData) {
      return cachedData;
    }

    try {
      const endDateObj = new Date(
        Date.now() - ERA5_REANALYSIS_LAG_DAYS * 24 * 60 * 60 * 1000,
      );
      const startDateObj = new Date(endDateObj);
      startDateObj.setFullYear(startDateObj.getFullYear() - 1);

      /** @param {Date} d */
      const formatDate = (d) => d.toISOString().split("T")[0];
      const startDate = formatDate(startDateObj);
      const endDate = formatDate(endDateObj);

      const url = new URL("https://archive-api.open-meteo.com/v1/archive");
      url.searchParams.set("latitude", lat.toString());
      url.searchParams.set("longitude", lon.toString());
      url.searchParams.set("start_date", startDate);
      url.searchParams.set("end_date", endDate);
      url.searchParams.set(
        "daily",
        "temperature_2m_max,temperature_2m_min,temperature_2m_mean,precipitation_sum,relative_humidity_2m_mean",
      );
      url.searchParams.set("timezone", "auto");

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new HistoricalArchiveError(
          `1 Yıllık iklim arşivi API yanıt hatası: HTTP ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      if (
        data.error ||
        !data.daily ||
        !Array.isArray(data.daily.time) ||
        data.daily.time.length === 0
      ) {
        throw new HistoricalArchiveError(
          `Geçersiz Open-Meteo arşiv verisi: ${data.reason || "Arşiv veri dizisi boş döndü."}`,
        );
      }

      const daily = data.daily;
      const dates = daily.time;
      const tMins = daily.temperature_2m_min || [];
      const tMeans = daily.temperature_2m_mean || [];
      const rains = daily.precipitation_sum || [];
      const hums = daily.relative_humidity_2m_mean || [];

      const { thresholds } = this.#resolveAppConfigContext();

      let totalRainfallMm = 0;
      let chillingHoursAccumulator = 0;
      let highRiskDaysCount = 0;

      /** @type {Map<string, { monthKey: string, validTempDays: number, tempSum: number, rainSum: number, riskDays: number }>} */
      const monthBuckets = new Map();

      dates.forEach(
        (/** @type {string} */ dateStr, /** @type {number} */ idx) => {
          const monthKey = dateStr.slice(0, 7);

          const rawTMean = tMeans[idx];
          const rawTMin = tMins[idx];
          const rawRain = rains[idx];
          const rawHum = hums[idx];

          const hasValidMean = rawTMean !== null && !isNaN(rawTMean);
          const hasValidMin = rawTMin !== null && !isNaN(rawTMin);

          const tMean = hasValidMean ? Number(rawTMean) : 0;
          const tMin = hasValidMin ? Number(rawTMin) : 0;
          const rain =
            rawRain !== null && !isNaN(rawRain)
              ? Math.max(0, Number(rawRain))
              : 0;
          const hum =
            rawHum !== null && !isNaN(rawHum)
              ? Math.max(0, Math.min(100, Number(rawHum)))
              : 0;

          totalRainfallMm += rain;

          if (hasValidMin) {
            chillingHoursAccumulator += calculateDailyChillingHours(tMin);
          }

          const { isRiskDay } = evaluateDailyPeacockRisk({
            tMean,
            hum,
            rain,
            thresholds,
          });

          if (isRiskDay) {
            highRiskDaysCount++;
          }

          let bucket = monthBuckets.get(monthKey);
          if (!bucket) {
            bucket = {
              monthKey,
              validTempDays: 0,
              tempSum: 0,
              rainSum: 0,
              riskDays: 0,
            };
            monthBuckets.set(monthKey, bucket);
          }

          if (hasValidMean) {
            bucket.tempSum += tMean;
            bucket.validTempDays += 1;
          }
          bucket.rainSum += rain;
          if (isRiskDay) {
            bucket.riskDays += 1;
          }
        },
      );

      const monthlySummaries = Array.from(monthBuckets.values()).map((b) => ({
        month: b.monthKey,
        avgTemp:
          b.validTempDays > 0
            ? Number((b.tempSum / b.validTempDays).toFixed(1))
            : 0,
        totalRain: Number(b.rainSum.toFixed(1)),
        riskDays: b.riskDays,
      }));

      const annualDTO = createAnnualArchiveDTO({
        totalRainfallMm,
        chillingHoursEstimate: chillingHoursAccumulator,
        highRiskDaysCount,
        monthlySummaries,
      });

      this.#cache.annual.set(cacheKey, annualDTO);
      return annualDTO;
    } catch (err) {
      if (err instanceof HistoricalArchiveError) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new HistoricalArchiveError(
        `1 Yıllık iklim arşivi çözümlenirken sistem hatası oluştu: ${msg}`,
        err,
      );
    }
  }

  clearCache() {
    this.#cache.timeline.clear();
    this.#cache.annual.clear();
  }
}

// ============================================================================
// SINGLETON SERVİS DIŞA AKTARIMI (EXPORT)
// ============================================================================

export const HistoricalArchiveService = new HistoricalArchiveServiceEngine();
