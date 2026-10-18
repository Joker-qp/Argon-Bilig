/**
 * Argon-bilig — ESP32 & IoT Saha Telemetrisi Servisi
 * Mimari: Altyapı Katmanı / Observer & Polling Heartbeat Pattern
 * Sorumluluk: Firebase REST mikroklima telemetrisi, 90 sn bayatlık denetimi ve soket yönetimi.
 */

import { AppConfig } from "../config/AppConfig.svelte.js";

/**
 * @typedef {Object} Esp32State
 * @property {boolean} isOnline
 * @property {number | null} temperature
 * @property {number | null} humidity
 * @property {boolean} leafWetness
 * @property {string | null} lastSeen
 * @property {string | null} lastSeenIso
 * @property {string | null} errorMessage
 */

class Esp32ServiceOrchestrator {
  /** @type {ReturnType<typeof setTimeout> | null} */
  #pollTimer = null;

  /** @type {AbortController | null} */
  #abortController = null;

  /** @type {Set<(state: Readonly<Esp32State>) => void>} */
  #subscribers = new Set();

  #isExplicitlyStopped = true;
  #consecutiveFailures = 0;
  #maxConsecutiveFailures = 3;

  /** @type {Esp32State} */
  #state = {
    isOnline: false,
    temperature: null,
    humidity: null,
    leafWetness: false,
    lastSeen: null,
    lastSeenIso: null,
    errorMessage: null,
  };

  #pollIntervalMs = 7000;
  #heartbeatTimeoutMs = 90000;
  #requestTimeoutMs = 5000;

  constructor() {}

  /**
   * @param {(state: Readonly<Esp32State>) => void} callback
   * @returns {() => void}
   */
  subscribe(callback) {
    if (typeof callback === "function") {
      this.#subscribers.add(callback);
      callback(this.getState());
    }
    return () => this.#subscribers.delete(callback);
  }

  /**
   * @returns {Readonly<Esp32State>}
   */
  getState() {
    return Object.freeze({ ...this.#state });
  }

  startListener() {
    this.stopListener();
    this.#isExplicitlyStopped = false;
    this.#consecutiveFailures = 0;

    let endpointUrl = "";
    try {
      endpointUrl = this.#resolveValidatedEndpoint();
    } catch (configError) {
      const msg =
        configError instanceof Error
          ? configError.message
          : String(configError);
      this.#setOfflineState(msg);
      return;
    }

    this.#executePollCycle(endpointUrl);
  }

  stopListener() {
    this.#isExplicitlyStopped = true;

    if (this.#pollTimer) {
      clearTimeout(this.#pollTimer);
      this.#pollTimer = null;
    }

    if (this.#abortController) {
      this.#abortController.abort(new Error("LISTENER_STOPPED"));
      this.#abortController = null;
    }
  }

  /**
   * @param {string} endpointUrl
   */
  #scheduleNextCycle(endpointUrl) {
    if (this.#isExplicitlyStopped) return;

    this.#pollTimer = setTimeout(() => {
      this.#executePollCycle(endpointUrl);
    }, this.#pollIntervalMs);
  }

  /**
   * @param {string} endpointUrl
   */
  async #executePollCycle(endpointUrl) {
    if (this.#isExplicitlyStopped) return;

    try {
      await this.#fetchTelemetry(endpointUrl);
    } finally {
      this.#scheduleNextCycle(endpointUrl);
    }
  }

  /**
   * @param {string} endpointUrl
   */
  async #fetchTelemetry(endpointUrl) {
    if (this.#abortController) {
      this.#abortController.abort(new Error("CYCLE_SUPERSEDED"));
    }

    this.#abortController = new AbortController();
    const signal = this.#abortController.signal;

    /** @type {ReturnType<typeof setTimeout> | null} */
    let timeoutId = null;

    try {
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          const timeoutErr = new Error("REQUEST_TIMEOUT");
          this.#abortController?.abort(timeoutErr);
          reject(timeoutErr);
        }, this.#requestTimeoutMs);
      });

      const fetchPromise = fetch(endpointUrl, {
        signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      const response = /** @type {Response} */ (
        await Promise.race([fetchPromise, timeoutPromise])
      );

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} (${response.statusText || "Sunucu Hatası"})`,
        );
      }

      const rawData = await response.json();

      if (!rawData || typeof rawData !== "object" || Array.isArray(rawData)) {
        throw new Error(
          "Geçerli telemetri paketi bulunamadı (Düğüm boş veya geçersiz format).",
        );
      }

      this.#consecutiveFailures = 0;
      this.#validateAndCommitTelemetry(
        /** @type {Record<string, unknown>} */ (rawData),
      );
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isExplicitStop =
        this.#isExplicitlyStopped || errMsg === "LISTENER_STOPPED";
      const isCycleSuperseded = errMsg === "CYCLE_SUPERSEDED";

      if (isExplicitStop || isCycleSuperseded) {
        return;
      }

      this.#handleFetchFailure(error);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * @param {Record<string, unknown>} data
   */
  #validateAndCommitTelemetry(data) {
    const temp = Number(data.temperature ?? data.temp);
    const hum = Number(data.humidity ?? data.hum);
    const wetness = Boolean(data.leafWetness ?? data.wetness ?? false);

    if (!Number.isFinite(temp) || !Number.isFinite(hum)) {
      this.#setOfflineState(
        "Bozuk sensör verisi: Sıcaklık veya nem sayısal değil.",
      );
      return;
    }

    if (temp < -25 || temp > 65 || hum < 0 || hum > 100) {
      this.#setOfflineState(
        "Sensör okumaları fiziksel sınırların dışında (-25°C..65°C / %0..%100).",
      );
      return;
    }

    const rawTimestamp = data.timestamp ?? data.lastSeen ?? data.time;

    if (
      rawTimestamp === undefined ||
      rawTimestamp === null ||
      rawTimestamp === ""
    ) {
      this.#setOfflineState(
        "Telemetri paketi reddedildi: Zaman damgası (timestamp) eksik; veri tazeliği doğrulanamıyor.",
      );
      return;
    }

    let readingTimeMs = NaN;
    if (typeof rawTimestamp === "number") {
      readingTimeMs = rawTimestamp < 1e11 ? rawTimestamp * 1000 : rawTimestamp;
    } else if (typeof rawTimestamp === "string") {
      readingTimeMs = Date.parse(rawTimestamp);
    }

    if (!Number.isFinite(readingTimeMs)) {
      this.#setOfflineState(
        "Telemetri reddedildi: Geçersiz zaman damgası formatı.",
      );
      return;
    }

    const nowMs = Date.now();
    const ageMs = nowMs - readingTimeMs;

    if (ageMs > this.#heartbeatTimeoutMs) {
      this.#setOfflineState(
        `Veri bayat: Son sensör verisi ${Math.round(ageMs / 1000)} sn önce üretilmiş.`,
      );
      return;
    }

    if (ageMs < -120000) {
      this.#setOfflineState(
        "Donanım saat senkronizasyonu hatalı (Gelecek zaman damgası alındı).",
      );
      return;
    }

    const validDate = new Date(readingTimeMs);
    this.#state = {
      isOnline: true,
      temperature: Number(temp.toFixed(1)),
      humidity: Number(hum.toFixed(1)),
      leafWetness: wetness,
      lastSeen: validDate.toLocaleTimeString("tr-TR"),
      lastSeenIso: validDate.toISOString(),
      errorMessage: null,
    };

    this.#syncWithAppConfig(this.getState(), true);
    this.#broadcast();
  }

  /**
   * @param {unknown} error
   */
  #handleFetchFailure(error) {
    this.#consecutiveFailures++;
    const errMsg = error instanceof Error ? error.message : String(error);
    const isTimeout = errMsg === "REQUEST_TIMEOUT";
    const reason = isTimeout
      ? "İstasyon zaman aşımı (Cihaz yanıt vermiyor)"
      : `Bağlantı hatası: ${errMsg}`;

    const hasRecentValidData =
      this.#state.temperature !== null &&
      this.#state.lastSeenIso &&
      Date.now() - new Date(this.#state.lastSeenIso).getTime() <
        this.#heartbeatTimeoutMs;

    if (
      hasRecentValidData &&
      this.#consecutiveFailures < this.#maxConsecutiveFailures
    ) {
      this.#state = {
        ...this.#state,
        isOnline: true,
        errorMessage: `${reason} (Yeniden deneniyor: ${this.#consecutiveFailures}/${this.#maxConsecutiveFailures})`,
      };
      this.#broadcast();
    } else {
      this.#setOfflineState(reason);
    }
  }

  /**
   * @param {string} reason
   */
  #setOfflineState(reason) {
    this.#state = {
      isOnline: false,
      temperature: null,
      humidity: null,
      leafWetness: false,
      lastSeen: null,
      lastSeenIso: null,
      errorMessage: String(reason || "İstasyon çevrimdışı"),
    };

    this.#syncWithAppConfig(null, false);
    this.#broadcast();
  }

  /**
   * @param {Readonly<Esp32State> | null} telemetryPayload
   * @param {boolean} isActive
   */
  #syncWithAppConfig(telemetryPayload, isActive) {
    try {
      if (typeof AppConfig?.updateTelemetry === "function") {
        AppConfig.updateTelemetry(telemetryPayload, isActive);
      }
    } catch (err) {
      console.warn(
        "[Esp32Service] AppConfig.updateTelemetry senkronizasyon uyarısı:",
        err,
      );
    }
  }

  /**
   * @returns {string}
   */
  #resolveValidatedEndpoint() {
    /** @type {{ firebaseUrl?: string, nodePath?: string }} */
    let hardwareConfig = {};

    if (typeof AppConfig?.getHardwareConfig === "function") {
      hardwareConfig = AppConfig.getHardwareConfig() || {};
    }

    const rawBaseUrl = (hardwareConfig.firebaseUrl || "").trim();
    if (!rawBaseUrl) {
      throw new Error("ESP32 / Firebase URL yapılandırılmadı.");
    }

    /** @type {URL} */
    let parsedUrl;
    try {
      parsedUrl = new URL(rawBaseUrl);
    } catch {
      throw new Error("Geçersiz Firebase URL formatı (RFC 3986 uyumsuz).");
    }

    if (parsedUrl.protocol !== "https:") {
      throw new Error(
        "Güvenlik ihlali: IoT telemetri bağlantısı yalnızca HTTPS protokolünü destekler.",
      );
    }

    const rawNodePath = String(
      hardwareConfig.nodePath || "esp32_station",
    ).trim();
    const sanitizedNodePath = rawNodePath
      .replace(/^[./]+|[./]+$/g, "")
      .replace(/[^\w-]/g, "");

    if (!sanitizedNodePath) {
      throw new Error("Geçersiz telemetri düğüm yolu (nodePath).");
    }

    const cleanOriginAndPath = `${parsedUrl.origin}${parsedUrl.pathname.replace(/\/+$/, "")}`;
    return `${cleanOriginAndPath}/${sanitizedNodePath}.json`;
  }

  #broadcast() {
    const frozenState = this.getState();
    this.#subscribers.forEach((callback) => {
      try {
        callback(frozenState);
      } catch (err) {
        console.error("[Esp32Service] Abone bildirim hatası:", err);
      }
    });
  }
}

export const Esp32Service = new Esp32ServiceOrchestrator();
