/**
 * Argon-bilig — Meteoroloji Veri Orkestratörü
 * Mimari: Strategy Pattern (Liskov Substitution Uyumlu), Circuit Breaker & DTO Factory
 * Sorumluluk: 48 saatlik yağış/nem integrasyonu, API anahtar çözümü ve önbellekleme.
 */

import { AppConfig, WEATHER_PROVIDERS } from "../config/AppConfig.svelte.js";

/** @typedef {import("../config/AppConfig.svelte.js").WeatherProvider} WeatherProvider */

/**
 * @typedef {Object} MeteorologicalDTO
 * @property {string} provider
 * @property {{ temperature: number, humidity: number, precipitation: number }} current
 * @property {{ totalRainMm: number, hourlyRain: number[], hourlyTemps: number[], hourlyHumidity: number[] }} forecast48h
 * @property {{ tempMax: number | null, tempMin: number | null }} daily
 * @property {string} cityName
 * @property {string} fetchedAt
 * @property {boolean} [fallbackTriggered]
 * @property {string} [originalRequestedProvider]
 * @property {string} [failureReason]
 */

/**
 * @typedef {Object} DTOParams
 * @property {string} provider
 * @property {number} currentTemp
 * @property {number} currentHumidity
 * @property {number} [currentPrecipitation]
 * @property {number} [totalRain48h]
 * @property {number[]} [hourlyRain]
 * @property {number[]} [hourlyTemps]
 * @property {number[]} [hourlyHumidity]
 * @property {number | null} [tempMax]
 * @property {number | null} [tempMin]
 * @property {string} [cityName]
 * @property {boolean} [fallbackTriggered]
 * @property {string} [originalRequestedProvider]
 * @property {string} [failureReason]
 */

/**
 * Birörnek Strateji Arayüzü (Liskov Substitution Principle)
 * @typedef {Object} IWeatherStrategy
 * @property {(lat: number, lon: number, apiKey?: string) => Promise<Readonly<MeteorologicalDTO>>} fetchForecast
 */

/**
 * Katmanlar arası immutability için nesneyi derinlemesine dondurur.
 * @template T
 * @param {T} obj
 * @returns {Readonly<T>}
 */
function deepFreeze(obj) {
  if (obj === null || typeof obj !== "object") return obj;
  for (const name of Object.getOwnPropertyNames(obj)) {
    /** @type {any} */
    const value = /** @type {any} */ (obj)[name];
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return Object.freeze(obj);
}

/**
 * @param {DTOParams} params
 * @returns {Readonly<MeteorologicalDTO>}
 */
function createMeteorologicalDTO({
  provider,
  currentTemp,
  currentHumidity,
  currentPrecipitation = 0,
  totalRain48h = 0,
  hourlyRain = [],
  hourlyTemps = [],
  hourlyHumidity = [],
  tempMax = null,
  tempMin = null,
  cityName = "",
  fallbackTriggered = false,
  originalRequestedProvider = undefined,
  failureReason = undefined,
}) {
  /** @type {MeteorologicalDTO} */
  const dto = {
    provider: String(provider),
    current: {
      temperature: Number(currentTemp) || 0,
      humidity: Number(currentHumidity) || 0,
      precipitation: Number(currentPrecipitation) || 0,
    },
    forecast48h: {
      totalRainMm: Number(Number(totalRain48h).toFixed(2)) || 0,
      hourlyRain: Array.isArray(hourlyRain) ? hourlyRain.map(Number) : [],
      hourlyTemps: Array.isArray(hourlyTemps) ? hourlyTemps.map(Number) : [],
      hourlyHumidity: Array.isArray(hourlyHumidity)
        ? hourlyHumidity.map(Number)
        : [],
    },
    daily: {
      tempMax:
        tempMax !== null && Number.isFinite(tempMax) ? Number(tempMax) : null,
      tempMin:
        tempMin !== null && Number.isFinite(tempMin) ? Number(tempMin) : null,
    },
    cityName: String(cityName),
    fetchedAt: new Date().toISOString(),
  };

  if (fallbackTriggered) {
    dto.fallbackTriggered = true;
    if (originalRequestedProvider) {
      dto.originalRequestedProvider = String(originalRequestedProvider);
    }
    if (failureReason) {
      dto.failureReason = String(failureReason);
    }
  }

  return deepFreeze(dto);
}

/** @implements {IWeatherStrategy} */
class OpenMeteoStrategy {
  /**
   * @param {number} lat
   * @param {number} lon
   * @param {string} [_apiKey=""] - Arayüz uyumu için tanımlı, Open-Meteo için opsiyonel
   * @returns {Promise<Readonly<MeteorologicalDTO>>}
   */
  async fetchForecast(lat, lon, _apiKey = "") {
    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lon));
    url.searchParams.set(
      "current",
      "temperature_2m,relative_humidity_2m,precipitation,weather_code",
    );
    url.searchParams.set(
      "hourly",
      "temperature_2m,relative_humidity_2m,precipitation_probability,precipitation",
    );
    url.searchParams.set(
      "daily",
      "temperature_2m_max,temperature_2m_min,precipitation_sum",
    );
    url.searchParams.set("forecast_days", "3");
    url.searchParams.set("timezone", "auto");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(
        `Open-Meteo API Hatası: HTTP ${response.status} (${response.statusText})`,
      );
    }

    const data = await response.json();

    const hourlyTimes = data.hourly?.time || [];
    const currentTimeIso = data.current?.time;
    let startIndex = hourlyTimes.indexOf(currentTimeIso);

    if (startIndex === -1) {
      const now = new Date();
      startIndex = hourlyTimes.findIndex(
        (/** @type {string} */ t) => new Date(t) >= now,
      );
      if (startIndex === -1) startIndex = 0;
    }

    const endIndex = startIndex + 48;
    const rainSeries48h = (data.hourly?.precipitation || [])
      .slice(startIndex, endIndex)
      .map((/** @type {unknown} */ val) => Number(val) || 0);

    let totalRain48h = 0;
    for (const rain of rainSeries48h) {
      totalRain48h += rain;
    }

    return createMeteorologicalDTO({
      provider: WEATHER_PROVIDERS.OPEN_METEO,
      currentTemp: data.current?.temperature_2m ?? 0,
      currentHumidity: data.current?.relative_humidity_2m ?? 0,
      currentPrecipitation: data.current?.precipitation ?? 0,
      totalRain48h: totalRain48h,
      hourlyRain: rainSeries48h,
      hourlyTemps: (data.hourly?.temperature_2m || [])
        .slice(startIndex, endIndex)
        .map((/** @type {unknown} */ val) => Number(val) || 0),
      hourlyHumidity: (data.hourly?.relative_humidity_2m || [])
        .slice(startIndex, endIndex)
        .map((/** @type {unknown} */ val) => Number(val) || 0),
      tempMax: data.daily?.temperature_2m_max?.[0] ?? null,
      tempMin: data.daily?.temperature_2m_min?.[0] ?? null,
      cityName: data.timezone || "Yerel İstasyon",
    });
  }
}

/** @implements {IWeatherStrategy} */
class OpenWeatherStrategy {
  /**
   * @param {number} lat
   * @param {number} lon
   * @param {string} [apiKey=""]
   * @returns {Promise<Readonly<MeteorologicalDTO>>}
   */
  async fetchForecast(lat, lon, apiKey = "") {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error(
        "OpenWeatherMap API Anahtarı eksik! Lütfen Ayarlar panelinden anahtarınızı girin.",
      );
    }

    const url = new URL("https://api.openweathermap.org/data/2.5/forecast");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("appid", apiKey.trim());
    url.searchParams.set("units", "metric");
    url.searchParams.set("lang", "tr");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error(
          "Geçersiz OpenWeatherMap API Anahtarı! Lütfen anahtarınızı kontrol edin (HTTP 401).",
        );
      }
      throw new Error(
        `OpenWeatherMap API Hatası: HTTP ${response.status} (${response.statusText})`,
      );
    }

    const data = await response.json();
    const list = data.list || [];

    const steps48h = list.slice(0, 16);
    let totalRain48h = 0;
    /** @type {number[]} */
    const hourlyRainApproximation = [];
    /** @type {number[]} */
    const hourlyTemps = [];
    /** @type {number[]} */
    const hourlyHumidity = [];

    steps48h.forEach((/** @type {any} */ item) => {
      const rain3h = Number(item.rain?.["3h"] || 0);
      totalRain48h += rain3h;

      const hourlyShare = Number((rain3h / 3).toFixed(2));
      hourlyRainApproximation.push(hourlyShare, hourlyShare, hourlyShare);
      hourlyTemps.push(
        item.main?.temp ?? 0,
        item.main?.temp ?? 0,
        item.main?.temp ?? 0,
      );
      hourlyHumidity.push(
        item.main?.humidity ?? 0,
        item.main?.humidity ?? 0,
        item.main?.humidity ?? 0,
      );
    });

    const first24hSteps = list.slice(0, 8);
    let dailyTempMax = null;
    let dailyTempMin = null;

    if (first24hSteps.length > 0) {
      dailyTempMax = Math.max(
        ...first24hSteps.map((/** @type {any} */ i) =>
          Number(i.main?.temp_max ?? i.main?.temp),
        ),
      );
      dailyTempMin = Math.min(
        ...first24hSteps.map((/** @type {any} */ i) =>
          Number(i.main?.temp_min ?? i.main?.temp),
        ),
      );
    }

    const currentItem = list[0] || {};

    return createMeteorologicalDTO({
      provider: WEATHER_PROVIDERS.OPENWEATHER,
      currentTemp: currentItem.main?.temp ?? 0,
      currentHumidity: currentItem.main?.humidity ?? 0,
      currentPrecipitation: currentItem.rain?.["3h"]
        ? Number((currentItem.rain["3h"] / 3).toFixed(2))
        : 0,
      totalRain48h: totalRain48h,
      hourlyRain: hourlyRainApproximation.slice(0, 48),
      hourlyTemps: hourlyTemps.slice(0, 48),
      hourlyHumidity: hourlyHumidity.slice(0, 48),
      tempMax: dailyTempMax,
      tempMin: dailyTempMin,
      cityName: data.city?.name || "Bölge İstasyonu",
    });
  }
}

/** @implements {IWeatherStrategy} */
class WeatherApiStrategy {
  /**
   * @param {number} lat
   * @param {number} lon
   * @param {string} [apiKey=""]
   * @returns {Promise<Readonly<MeteorologicalDTO>>}
   */
  async fetchForecast(lat, lon, apiKey = "") {
    if (!apiKey || apiKey.trim() === "") {
      throw new Error(
        "WeatherAPI.com Anahtarı eksik! Lütfen Ayarlar panelinden anahtarınızı girin.",
      );
    }

    const url = new URL("https://api.weatherapi.com/v1/forecast.json");
    url.searchParams.set("key", apiKey.trim());
    url.searchParams.set("q", `${lat},${lon}`);
    url.searchParams.set("days", "3");
    url.searchParams.set("aqi", "no");
    url.searchParams.set("alerts", "no");

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Geçersiz veya Yetkisiz WeatherAPI Anahtarı! Kontrol ediniz (HTTP ${response.status}).`,
        );
      }
      throw new Error(
        `WeatherAPI Hatası: HTTP ${response.status} (${response.statusText})`,
      );
    }

    const data = await response.json();
    const forecastDays = data.forecast?.forecastday || [];

    /** @type {any[]} */
    let allHours = [];
    forecastDays.forEach((/** @type {any} */ day) => {
      if (Array.isArray(day.hour)) {
        allHours = allHours.concat(day.hour);
      }
    });

    const nowEpoch =
      data.location?.localtime_epoch || Math.floor(Date.now() / 1000);
    let startIndex = allHours.findIndex(
      (/** @type {any} */ h) => Number(h.time_epoch) >= nowEpoch - 1800,
    );
    if (startIndex === -1 || startIndex + 48 > allHours.length) {
      startIndex = 0;
    }

    const hours48 = allHours.slice(startIndex, startIndex + 48);
    const hourlyRain = hours48.map((/** @type {any} */ h) =>
      Number(h.precip_mm || 0),
    );

    let totalRain48h = 0;
    for (const rain of hourlyRain) {
      totalRain48h += rain;
    }

    return createMeteorologicalDTO({
      provider: WEATHER_PROVIDERS.WEATHERAPI,
      currentTemp: data.current?.temp_c ?? 0,
      currentHumidity: data.current?.humidity ?? 0,
      currentPrecipitation: data.current?.precip_mm ?? 0,
      totalRain48h: totalRain48h,
      hourlyRain: hourlyRain,
      hourlyTemps: hours48.map((/** @type {any} */ h) => Number(h.temp_c || 0)),
      hourlyHumidity: hours48.map((/** @type {any} */ h) =>
        Number(h.humidity || 0),
      ),
      tempMax: forecastDays[0]?.day?.maxtemp_c ?? null,
      tempMin: forecastDays[0]?.day?.mintemp_c ?? null,
      cityName: data.location?.name || "Bölge İstasyonu",
    });
  }
}

class WeatherServiceOrchestrator {
  /** @type {Record<WeatherProvider, IWeatherStrategy>} */
  #strategies = {
    "open-meteo": new OpenMeteoStrategy(),
    openweather: new OpenWeatherStrategy(),
    weatherapi: new WeatherApiStrategy(),
  };

  /** @type {{ data: Readonly<MeteorologicalDTO> | null, lastFetchedKey: string, timestamp: number, ttlMs: number }} */
  #cache = {
    data: null,
    lastFetchedKey: "",
    timestamp: 0,
    ttlMs: 10 * 60 * 1000,
  };

  /**
   * @param {number | string} lat
   * @param {number | string} lon
   * @param {boolean} [forceRefresh=false]
   * @returns {Promise<Readonly<MeteorologicalDTO>>}
   */
  async getForecast(lat, lon, forceRefresh = false) {
    const numLat = Number(lat);
    const numLon = Number(lon);

    if (!Number.isFinite(numLat) || !Number.isFinite(numLon)) {
      throw new Error(`Geçersiz koordinat sağlandı: lat=${lat}, lon=${lon}`);
    }

    const weatherConfig = AppConfig.getWeatherConfig();
    /** @type {WeatherProvider} */
    const provider = weatherConfig.provider || WEATHER_PROVIDERS.OPEN_METEO;
    const apiKey = AppConfig.getRawWeatherApiKey() || "";

    const cacheKey = `${provider}_${numLat.toFixed(3)}_${numLon.toFixed(3)}`;
    const now = Date.now();

    if (
      !forceRefresh &&
      this.#cache.data &&
      this.#cache.lastFetchedKey === cacheKey &&
      now - this.#cache.timestamp < this.#cache.ttlMs
    ) {
      return this.#cache.data;
    }

    const strategy =
      this.#strategies[provider] ||
      this.#strategies[WEATHER_PROVIDERS.OPEN_METEO];

    try {
      const forecastData = await strategy.fetchForecast(numLat, numLon, apiKey);
      this.#cache.data = forecastData;
      this.#cache.lastFetchedKey = cacheKey;
      this.#cache.timestamp = now;
      return forecastData;
    } catch (primaryError) {
      const primaryMessage =
        primaryError instanceof Error
          ? primaryError.message
          : String(primaryError);

      console.warn(
        `[WeatherService] ${provider} çağrısı başarısız oldu:`,
        primaryMessage,
      );

      // Ana sağlayıcı Open-Meteo değilse otonom fallback devreye alınır
      if (provider !== WEATHER_PROVIDERS.OPEN_METEO) {
        try {
          const fallbackData = await this.#strategies[
            "open-meteo"
          ].fetchForecast(numLat, numLon, "");

          const enrichedFallback = createMeteorologicalDTO({
            provider: fallbackData.provider,
            currentTemp: fallbackData.current.temperature,
            currentHumidity: fallbackData.current.humidity,
            currentPrecipitation: fallbackData.current.precipitation,
            totalRain48h: fallbackData.forecast48h.totalRainMm,
            hourlyRain: fallbackData.forecast48h.hourlyRain,
            hourlyTemps: fallbackData.forecast48h.hourlyTemps,
            hourlyHumidity: fallbackData.forecast48h.hourlyHumidity,
            tempMax: fallbackData.daily.tempMax,
            tempMin: fallbackData.daily.tempMin,
            cityName: fallbackData.cityName,
            fallbackTriggered: true,
            originalRequestedProvider: provider,
            failureReason: primaryMessage,
          });

          this.#cache.data = enrichedFallback;
          this.#cache.lastFetchedKey = cacheKey;
          this.#cache.timestamp = now;
          return enrichedFallback;
        } catch (fallbackError) {
          const fallbackMessage =
            fallbackError instanceof Error
              ? fallbackError.message
              : String(fallbackError);

          console.error(
            `[WeatherService] Yedek sağlayıcı (Open-Meteo) çağrısı da başarısız oldu:`,
            fallbackMessage,
          );
          throw new Error(
            `Birincil sağlayıcı (${provider}) hatası: [${primaryMessage}] | ` +
              `Yedek sağlayıcı (Open-Meteo) hatası: [${fallbackMessage}]`,
          );
        }
      }

      throw primaryError;
    }
  }

  clearCache() {
    this.#cache.data = null;
    this.#cache.lastFetchedKey = "";
    this.#cache.timestamp = 0;
  }
}

export const WeatherService = new WeatherServiceOrchestrator();
