/**
 * Argon-bilig — Merkezi Reaktif Durum, Spesifikasyon ve Yapılandırma Yöneticisi
 * Mimari: Svelte 5 Runes ($state) & Katı Tip Korumalı Presets & AI Metadata
 */

/**
 * @typedef {"gemlik" | "ayvalik" | "memecik" | "custom"} CultivarPresetKey
 */

// Model Sınıflandırma Etiketleri (ModelPipeline için zorunlu)
export const AI_CLASSES = Object.freeze({
  PEACOCK: "Halkalı Leke (Spilocaea oleagina)",
  MITE: "Zeytin Pas Akarı (Aceria oleae)",
  HEALTHY: "Sağlıklı (Healthy)",
});

// Gemlik Zeytini Referans Spesifikasyonları
export const GEMLIK_SPECS = Object.freeze({
  cultivarName: "Gemlik (Trilye)",
  scientificName: "Olea europaea cv. Gemlik",
  targetDiseases: {
    peacockSpot: {
      scientificName: "Spilocaea oleagina",
      commonName: "Zeytin Halkalı Leke Hastalığı",
      modelTask: "YOLOv8s-seg Lezyon Segmentasyonu & Alan Şiddeti (%)",
      verifiedLeafMap50: 99.4,
      verifiedPrecision: 91.0,
      verifiedMap50: 81.6,
      treatments: {
        early: "%1.0 - %1.5 Bordo Bulamacı (Sonbahar/İlkbahar Yağış Öncesi)",
        moderate: "Bakır Oksiklorid (WP) veya Bakır Hidroksit Preparatları",
        severe:
          "Azoxystrobin + Difenoconazole veya Kresoxim-methyl Sistemik Fungusit",
      },
    },
    rustMite: {
      scientificName: "Aceria oleae / Aculus olearius",
      commonName: "Zeytin Pas Akarı",
      modelTask: "EfficientNet-B0 Morfolojik Yaprak Sınıflandırması",
      verifiedRecall: 100.0,
      verifiedAccuracy: 98.99,
      treatments: {
        standard: "Islanabilir Kükürt (WP) (800g/100L su)",
        severe:
          "T.C. Tarım ve Orman Bakanlığı Ruhsatlı Abamectin Etkili Maddeli Akarisit",
      },
    },
  },
  modelArchitecture: {
    stage1:
      "YOLOv8s-seg (640x640) - Yaprak ve Leke Segmentasyonu & Arka Plan Maskeleme",
    stage2:
      "EfficientNet-B0 (224x224) - Arka Plandan Arındırılmış Morfolojik Sınıflandırma",
    modelFiles: {
      yolo: "/models/yolov8_seg.onnx",
      classifier: "/models/efficientnet.onnx",
    },
  },
});

// Hazır Çeşit Profilleri (Agronomik Standartlar)
export const CULTIVAR_PRESETS = Object.freeze({
  gemlik: {
    id: "gemlik",
    name: "Gemlik (Trilye)",
    scientificName: "Olea europaea cv. Gemlik",
    chillingTargetHours: 500,
    thresholds: {
      peacockHumidity: 85,
      peacockTempMin: 10,
      peacockTempMax: 20,
      peacockRainTrigger: 2.0,
      miteTempMin: 22,
      miteHumidityMax: 70,
      miteRainSuppression: 5.0,
    },
  },
  ayvalik: {
    id: "ayvalik",
    name: "Ayvalık (Edremit)",
    scientificName: "Olea europaea cv. Ayvalik",
    chillingTargetHours: 700,
    thresholds: {
      peacockHumidity: 80,
      peacockTempMin: 12,
      peacockTempMax: 22,
      peacockRainTrigger: 2.5,
      miteTempMin: 23,
      miteHumidityMax: 75,
      miteRainSuppression: 6.0,
    },
  },
  memecik: {
    id: "memecik",
    name: "Memecik",
    scientificName: "Olea europaea cv. Memecik",
    chillingTargetHours: 400,
    thresholds: {
      peacockHumidity: 85,
      peacockTempMin: 10,
      peacockTempMax: 21,
      peacockRainTrigger: 2.0,
      miteTempMin: 24,
      miteHumidityMax: 65,
      miteRainSuppression: 4.0,
    },
  },
  custom: {
    id: "custom",
    name: "Özel (Manuel Yapılandırma)",
    scientificName: "Olea europaea (Özel)",
    chillingTargetHours: 500,
    thresholds: {
      peacockHumidity: 85,
      peacockTempMin: 10,
      peacockTempMax: 20,
      peacockRainTrigger: 2.0,
      miteTempMin: 22,
      miteHumidityMax: 70,
      miteRainSuppression: 5.0,
    },
  },
});

export const WEATHER_PROVIDERS = Object.freeze({
  OPEN_METEO: "open-meteo",
  OPENWEATHER: "openweather",
  WEATHERAPI: "weatherapi",
});

export const MAP_CONFIG = Object.freeze({
  esriTopo: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    maxZoom: 19,
    attribution: "Tiles &copy; Esri",
  },
  defaultLocation: {
    lat: 40.4326,
    lon: 29.1578,
    name: "Gemlik Havzası, Bursa",
  },
  defaultZoom: 12,
});

export const DEFAULT_CONFIG = Object.freeze({
  cultivarPreset: /** @type {CultivarPresetKey} */ ("gemlik"),
  cultivarName: "Gemlik (Trilye)",
  map: {
    riskRadiusKm: 2.5,
  },
  phenology: {
    chillingTargetHours: 500,
  },
  thresholds: { ...CULTIVAR_PRESETS.gemlik.thresholds },
  hardware: {
    firebaseUrl: "",
    nodePath: "esp32_station",
    pollingIntervalSec: 7,
    isOnline: false,
    lastTelemetry: null,
  },
  weather: {
    provider: WEATHER_PROVIDERS.OPEN_METEO,
    apiKey: "",
  },
  userLocation: { ...MAP_CONFIG.defaultLocation },
});

export const SimpleCrypto = {
  /** @param {string} text */
  encrypt: (text) => {
    if (!text) return "";
    try {
      return btoa(encodeURIComponent(text));
    } catch {
      return text;
    }
  },
  /** @param {string} cipher */
  decrypt: (cipher) => {
    if (!cipher) return "";
    try {
      return decodeURIComponent(atob(cipher));
    } catch {
      return cipher;
    }
  },
};

class AppConfigManager {
  #storageKey = "argon_bilig_master_config_v3";

  /** @type {{ preset: CultivarPresetKey, name: string }} */
  cultivar = $state({
    preset: "gemlik",
    name: "Gemlik (Trilye)",
  });

  map = $state({ ...DEFAULT_CONFIG.map });
  phenology = $state({ ...DEFAULT_CONFIG.phenology });
  thresholds = $state({ ...DEFAULT_CONFIG.thresholds });
  hardware = $state({ ...DEFAULT_CONFIG.hardware });
  weather = $state({ ...DEFAULT_CONFIG.weather });
  userLocation = $state({ ...DEFAULT_CONFIG.userLocation });

  /** @type {{ yolo: ArrayBuffer | null, classifier: ArrayBuffer | null }} */
  customModelBuffers = $state({ yolo: null, classifier: null });

  constructor() {
    this.loadFromStorage();
  }

  /**
   * @param {string} presetId
   */
  applyCultivarPreset(presetId) {
    /** @type {CultivarPresetKey} */
    const key =
      presetId in CULTIVAR_PRESETS
        ? /** @type {CultivarPresetKey} */ (presetId)
        : "custom";

    const p = CULTIVAR_PRESETS[key];
    this.cultivar.preset = key;
    this.cultivar.name = p.name;
    this.phenology.chillingTargetHours = p.chillingTargetHours;
    this.thresholds = { ...p.thresholds };
    this.saveToStorage();
  }

  getGemlikSpecs() {
    return GEMLIK_SPECS;
  }

  getActiveCultivar() {
    return {
      id: this.cultivar.preset,
      name: this.cultivar.name,
      scientificName:
        CULTIVAR_PRESETS[this.cultivar.preset]?.scientificName ||
        "Olea europaea",
    };
  }

  getWeatherConfig() {
    return {
      provider: this.weather.provider,
      apiKey: SimpleCrypto.encrypt(this.weather.apiKey),
    };
  }

  getRawWeatherApiKey() {
    return this.weather.apiKey;
  }

  /**
   * @param {string} provider
   * @param {string} [apiKey=""]
   */
  setWeatherConfig(provider, apiKey = "") {
    // @ts-ignore
    this.weather.provider = Object.values(WEATHER_PROVIDERS).includes(provider)
      ? provider
      : WEATHER_PROVIDERS.OPEN_METEO;
    this.weather.apiKey = String(apiKey || "").trim();
    this.saveToStorage();
  }

  getThresholds() {
    return { ...this.thresholds };
  }

  /**
   * @param {Record<string, any>} newTh
   */
  setThresholds(newTh = {}) {
    if (newTh.peacockTempMin < newTh.peacockTempMax) {
      this.thresholds = Object.assign({}, this.thresholds, newTh);
      this.saveToStorage();
    }
  }

  getHardwareConfig() {
    const last = this.hardware.lastTelemetry;
    return {
      ...this.hardware,
      lastTelemetry:
        last && typeof last === "object" ? Object.assign({}, last) : null,
    };
  }

  /**
   * @param {string} firebaseUrl
   * @param {string} [nodePath="esp32_station"]
   * @param {number} [pollingIntervalSec=7]
   */
  setHardwareConfig(
    firebaseUrl,
    nodePath = "esp32_station",
    pollingIntervalSec = 7,
  ) {
    let cleanUrl = String(firebaseUrl || "")
      .trim()
      .replace(/\/+$/, "");
    this.hardware.firebaseUrl = cleanUrl;
    this.hardware.nodePath = String(nodePath || "esp32_station").trim();
    this.hardware.pollingIntervalSec = Math.max(
      3,
      Number(pollingIntervalSec) || 7,
    );
    this.saveToStorage();
  }

  /**
   * @param {any} telemetryData
   * @param {boolean} isOnline
   */
  updateTelemetry(telemetryData, isOnline) {
    this.hardware.isOnline = Boolean(isOnline);
    this.hardware.lastTelemetry =
      telemetryData && typeof telemetryData === "object"
        ? Object.assign({}, telemetryData)
        : null;
  }

  getUserLocation() {
    return { ...this.userLocation };
  }

  /**
   * @param {number} lat
   * @param {number} lon
   * @param {string} [name]
   */
  setUserLocation(lat, lon, name = "Zeytin Bahçesi") {
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      this.userLocation = { lat, lon, name };
      this.saveToStorage();
    }
  }

  /**
   * @param {string} type
   * @param {ArrayBuffer} arrayBuffer
   */
  setCustomModelBuffer(type, arrayBuffer) {
    if (type === "yolo" || type === "classifier") {
      this.customModelBuffers[type] = arrayBuffer.slice(0);
    }
  }

  /**
   * @param {string} type
   */
  getCustomModelBuffer(type) {
    return type === "yolo"
      ? this.customModelBuffers.yolo
      : this.customModelBuffers.classifier;
  }

  resetToDefaults() {
    this.cultivar.preset = DEFAULT_CONFIG.cultivarPreset;
    this.cultivar.name = DEFAULT_CONFIG.cultivarName;
    this.map = { ...DEFAULT_CONFIG.map };
    this.phenology = { ...DEFAULT_CONFIG.phenology };
    this.thresholds = { ...DEFAULT_CONFIG.thresholds };
    this.hardware = { ...DEFAULT_CONFIG.hardware };
    this.weather = { ...DEFAULT_CONFIG.weather };
    this.userLocation = { ...DEFAULT_CONFIG.userLocation };
    this.saveToStorage();
  }

  saveToStorage() {
    if (typeof window === "undefined") return;
    try {
      const payload = {
        cultivar: this.cultivar,
        map: this.map,
        phenology: this.phenology,
        thresholds: this.thresholds,
        hardware: {
          firebaseUrl: this.hardware.firebaseUrl,
          nodePath: this.hardware.nodePath,
          pollingIntervalSec: this.hardware.pollingIntervalSec,
        },
        weather: {
          provider: this.weather.provider,
          apiKey: SimpleCrypto.encrypt(this.weather.apiKey),
        },
        userLocation: this.userLocation,
      };
      localStorage.setItem(this.#storageKey, JSON.stringify(payload));
    } catch (e) {
      console.warn("[AppConfig] LocalStorage yazma hatası:", e);
    }
  }

  loadFromStorage() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(this.#storageKey);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.cultivar && typeof data.cultivar === "object") {
        this.cultivar = Object.assign({}, this.cultivar, data.cultivar);
      }
      if (data.map && typeof data.map === "object") {
        this.map = Object.assign({}, this.map, data.map);
      }
      if (data.phenology && typeof data.phenology === "object") {
        this.phenology = Object.assign({}, this.phenology, data.phenology);
      }
      if (data.thresholds && typeof data.thresholds === "object") {
        this.thresholds = Object.assign({}, this.thresholds, data.thresholds);
      }
      if (data.hardware && typeof data.hardware === "object") {
        this.hardware.firebaseUrl = data.hardware.firebaseUrl || "";
        this.hardware.nodePath = data.hardware.nodePath || "esp32_station";
        this.hardware.pollingIntervalSec =
          data.hardware.pollingIntervalSec || 7;
      }
      if (data.weather && typeof data.weather === "object") {
        this.weather.provider =
          data.weather.provider || WEATHER_PROVIDERS.OPEN_METEO;
        this.weather.apiKey = SimpleCrypto.decrypt(data.weather.apiKey);
      }
      if (data.userLocation && typeof data.userLocation === "object") {
        this.userLocation = Object.assign(
          {},
          this.userLocation,
          data.userLocation,
        );
      }
    } catch (e) {
      console.warn("[AppConfig] LocalStorage yükleme hatası:", e);
    }
  }
}

export const AppConfig = new AppConfigManager();
