<script>
  import {
    AppConfig,
    CULTIVAR_PRESETS,
    WEATHER_PROVIDERS,
  } from "../../config/AppConfig.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {boolean} [isOpen]
   * @property {() => Promise<void>} [onSaveAndRecalculate]
   */

  /** @type {Props} */
  let { isOpen = $bindable(false), onSaveAndRecalculate } = $props();

  // Görünüm Modu: "auth" (Parola Girişi) | "dashboard" (Yetkili Yönetim Masası)
  /** @type {"auth" | "dashboard"} */
  let viewMode = $state("auth");
  let passwordInput = $state("");
  let authError = $state(false);

  /** @type {"cultivar" | "thresholds" | "gis" | "integration"} */
  let activeTab = $state("cultivar");
  let errorMessage = $state("");
  let successNotice = $state(false);
  let isTestingKey = $state(false);

  // 'admin123' parolasının SHA-256 özeti
  const ADMIN_PASSWORD_HASH =
    "240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9";

  /** @type {import('../../config/AppConfig.svelte.js').CultivarPresetKey} */
  let selectedPreset = $state(AppConfig.cultivar.preset);
  let thresholds = $state({ ...AppConfig.thresholds });
  let riskRadiusKm = $state(AppConfig.map.riskRadiusKm);
  let chillingTargetHours = $state(AppConfig.phenology.chillingTargetHours);
  let firebaseUrl = $state(AppConfig.hardware.firebaseUrl);
  let nodePath = $state(AppConfig.hardware.nodePath);
  let pollingIntervalSec = $state(AppConfig.hardware.pollingIntervalSec);
  let weatherProvider = $state(AppConfig.weather.provider);
  let weatherApiKey = $state(AppConfig.getRawWeatherApiKey());

  $effect(() => {
    if (isOpen) {
      viewMode = "auth";
      passwordInput = "";
      authError = false;
      errorMessage = "";
      successNotice = false;
      isTestingKey = false;

      selectedPreset = AppConfig.cultivar.preset;
      thresholds = { ...AppConfig.thresholds };
      riskRadiusKm = AppConfig.map.riskRadiusKm;
      chillingTargetHours = AppConfig.phenology.chillingTargetHours;
      firebaseUrl = AppConfig.hardware.firebaseUrl;
      nodePath = AppConfig.hardware.nodePath;
      pollingIntervalSec = AppConfig.hardware.pollingIntervalSec;
      weatherProvider = AppConfig.weather.provider;
      weatherApiKey = AppConfig.getRawWeatherApiKey();
    }
  });

  async function handleAuthSubmit() {
    const encoder = new TextEncoder();
    const data = encoder.encode(passwordInput);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    if (hashHex === ADMIN_PASSWORD_HASH) {
      authError = false;
      viewMode = "dashboard";
    } else {
      authError = true;
    }
  }

  /**
   * @param {string} presetKey
   */
  function handlePresetChange(presetKey) {
    /** @type {import('../../config/AppConfig.svelte.js').CultivarPresetKey} */
    const key =
      presetKey in CULTIVAR_PRESETS
        ? /** @type {import('../../config/AppConfig.svelte.js').CultivarPresetKey} */ (
            presetKey
          )
        : "custom";

    selectedPreset = key;
    const p = CULTIVAR_PRESETS[key];
    if (p && key !== "custom") {
      thresholds = { ...p.thresholds };
      chillingTargetHours = p.chillingTargetHours;
    }
  }

  function markAsCustom() {
    selectedPreset = "custom";
  }

  async function handleSave() {
    errorMessage = "";

    // Canlı API Anahtarı Doğrulaması
    if (weatherProvider !== WEATHER_PROVIDERS.OPEN_METEO) {
      if (!weatherApiKey || weatherApiKey.trim() === "") {
        errorMessage = "Lütfen seçtiğiniz servis için bir API anahtarı girin.";
        activeTab = "integration";
        return;
      }

      isTestingKey = true;
      try {
        if (weatherProvider === WEATHER_PROVIDERS.OPENWEATHER) {
          const testRes = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=40.43&lon=29.15&appid=${weatherApiKey.trim()}&cnt=1`,
          );
          if (testRes.status === 401) {
            throw new Error(
              "OpenWeatherMap API Anahtarı GEÇERSİZ (HTTP 401 Yetkisiz).",
            );
          }
        } else if (weatherProvider === WEATHER_PROVIDERS.WEATHERAPI) {
          const testRes = await fetch(
            `https://api.weatherapi.com/v1/forecast.json?key=${weatherApiKey.trim()}&q=40.43,29.15&days=1`,
          );
          if (testRes.status === 401 || testRes.status === 403) {
            throw new Error(
              "WeatherAPI.com Anahtarı GEÇERSİZ veya Yetkisiz (HTTP 401/403).",
            );
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errorMessage = `API Doğrulama Hatası: ${msg}`;
        activeTab = "integration";
        isTestingKey = false;
        return;
      } finally {
        isTestingKey = false;
      }
    }

    // Biyolojik Eşik Doğrulamaları
    if (thresholds.peacockTempMin >= thresholds.peacockTempMax) {
      errorMessage =
        "Halkalı Leke: Minimum sıcaklık maksimum sıcaklıktan büyük veya eşit olamaz.";
      activeTab = "thresholds";
      return;
    }
    if (thresholds.peacockHumidity < 0 || thresholds.peacockHumidity > 100) {
      errorMessage = "Halkalı Leke: Bağıl nem %0 ile %100 arasında olmalıdır.";
      activeTab = "thresholds";
      return;
    }
    if (thresholds.miteHumidityMax < 0 || thresholds.miteHumidityMax > 100) {
      errorMessage = "Pas Akarı: Maksimum nem %0 ile %100 arasında olmalıdır.";
      activeTab = "thresholds";
      return;
    }
    if (riskRadiusKm <= 0.1 || riskRadiusKm > 50) {
      errorMessage = "CBS Harita: Yarıçap 0.1 km ile 50 km arasında olmalıdır.";
      activeTab = "gis";
      return;
    }

    // Durumu Kaydet ve Uygula
    AppConfig.cultivar.preset = selectedPreset;
    AppConfig.cultivar.name =
      CULTIVAR_PRESETS[selectedPreset]?.name || "Özel Çeşit";
    AppConfig.thresholds = { ...thresholds };
    AppConfig.map.riskRadiusKm = Number(riskRadiusKm);
    AppConfig.phenology.chillingTargetHours = Math.round(chillingTargetHours);
    AppConfig.setHardwareConfig(firebaseUrl, nodePath, pollingIntervalSec);
    AppConfig.setWeatherConfig(weatherProvider, weatherApiKey);
    AppConfig.saveToStorage();

    successNotice = true;
    if (onSaveAndRecalculate) {
      await onSaveAndRecalculate();
    }

    setTimeout(() => {
      successNotice = false;
      isOpen = false;
    }, 700);
  }

  function handleReset() {
    if (confirm("Tüm ayarlar fabrika varsayılanlarına sıfırlansın mı?")) {
      AppConfig.resetToDefaults();
      handlePresetChange("gemlik");
      riskRadiusKm = 2.5;
      chillingTargetHours = 500;
      firebaseUrl = "";
      nodePath = "esp32_station";
      pollingIntervalSec = 7;
      weatherProvider = WEATHER_PROVIDERS.OPEN_METEO;
      weatherApiKey = "";
      if (onSaveAndRecalculate) onSaveAndRecalculate();
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
  >
    {#if viewMode === "auth"}
      <!-- 1. Aşama: Parola Doğrulama Ekranı -->
      <div
        class="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-center"
      >
        <div
          class="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto text-xl shadow-inner"
        >
          🔒
        </div>
        <div>
          <h3 class="text-lg font-bold text-white">Yönetici Girişi</h3>
          <p class="text-xs text-slate-400 mt-1">
            Çeşit profillerini ve biyolojik risk eşiklerini düzenlemek için
            yetkili parolanızı girin.
          </p>
        </div>

        <form
          onsubmit={(e) => {
            e.preventDefault();
            handleAuthSubmit();
          }}
          class="space-y-3 pt-1"
        >
          <input
            type="password"
            bind:value={passwordInput}
            placeholder="Yönetici Parolası (admin123)"
            class="w-full px-3 py-2 text-sm text-center border border-slate-700 bg-slate-950 text-white rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none tracking-widest font-mono"
          />

          {#if authError}
            <p class="text-xs text-red-400 font-medium">
              Hatalı parola! Lütfen tekrar deneyin.
            </p>
          {/if}

          <div class="flex gap-2 pt-2">
            <button
              type="button"
              onclick={() => (isOpen = false)}
              class="flex-1 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              İptal
            </button>
            <button
              type="submit"
              class="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-950"
            >
              Giriş Yap
            </button>
          </div>
        </form>
      </div>
    {:else}
      <!-- 2. Aşama: Yetkili Yönetim Masası (Dashboard) -->
      <div
        class="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl relative max-h-[90vh] flex flex-col"
      >
        <div
          class="flex items-center justify-between border-b border-slate-800 pb-4"
        >
          <div>
            <h3 class="text-xl font-bold text-white flex items-center gap-2">
              <span class="text-emerald-400">🛡️</span> Yönetici Eşik & Parametre
              Paneli
            </h3>
            <p class="text-xs text-slate-400 mt-0.5">
              Çeşit hazır profilleri, biyolojik tehdit sınırları, CBS etki
              menzili ve IoT telemetri ayarları.
            </p>
          </div>
          <button
            type="button"
            onclick={() => (isOpen = false)}
            class="text-slate-400 hover:text-white p-1 rounded-lg transition"
            aria-label="Kapat"
          >
            ✕
          </button>
        </div>

        <!-- Sekmeler -->
        <div
          class="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto"
        >
          <button
            type="button"
            onclick={() => (activeTab = "cultivar")}
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap {activeTab ===
            'cultivar'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🌿 Çeşit & Hazır Profiller
          </button>
          <button
            type="button"
            onclick={() => (activeTab = "thresholds")}
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap {activeTab ===
            'thresholds'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🦠 Biyolojik Tehdit Eşikleri
          </button>
          <button
            type="button"
            onclick={() => (activeTab = "gis")}
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap {activeTab ===
            'gis'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🗺️ CBS Harita & Fenoloji
          </button>
          <button
            type="button"
            onclick={() => (activeTab = "integration")}
            class="px-3.5 py-1.5 rounded-xl text-xs font-semibold transition whitespace-nowrap {activeTab ===
            'integration'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            📡 IoT & Entegrasyon
          </button>
        </div>

        {#if errorMessage}
          <div
            class="p-3 rounded-xl bg-red-950/60 border border-red-800 text-red-300 text-xs"
          >
            ⚠️ {errorMessage}
          </div>
        {/if}
        {#if successNotice}
          <div
            class="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs animate-pulse"
          >
            ✓ Eşik değerleri güncellendi ve tüm sistem anında yeniden
            hesaplandı!
          </div>
        {/if}

        <div class="flex-1 overflow-y-auto pr-1 space-y-4 scrollbar-thin">
          {#if activeTab === "cultivar"}
            <div class="space-y-4">
              <div>
                <label
                  for="cultivar-preset-select"
                  class="block text-xs font-semibold text-slate-300 mb-1.5"
                >
                  Hedef Zeytin Çeşidi Hazır Profili (Preset)
                </label>
                <select
                  id="cultivar-preset-select"
                  bind:value={selectedPreset}
                  onchange={(e) =>
                    handlePresetChange(
                      /** @type {HTMLSelectElement} */ (e.target).value,
                    )}
                  class="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-slate-100 focus:border-emerald-500 focus:outline-none"
                >
                  <option value="gemlik"
                    >Gemlik (Trilye) — Soğuklama 400-600 saat, T:10-20°C, Nem ≥
                    %85</option
                  >
                  <option value="ayvalik"
                    >Ayvalık (Edremit) — Soğuklama 600-800 saat, T:12-22°C, Nem
                    ≥ %80</option
                  >
                  <option value="memecik"
                    >Memecik — Soğuklama 300-450 saat, T:10-21°C, Nem ≥ %85</option
                  >
                  <option value="custom"
                    >Özel (Manuel Yapılandırma) — Serbest Kullanıcı Tanımlı</option
                  >
                </select>
              </div>

              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2 text-xs"
              >
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Botanik Adı:</span>
                  <span class="text-white font-mono"
                    >{CULTIVAR_PRESETS[selectedPreset]?.scientificName ||
                      "Olea europaea"}</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400">Kış Soğuklama İhtiyacı:</span>
                  <span class="text-emerald-400 font-mono font-bold"
                    >{chillingTargetHours} saat (&lt;7.2°C)</span
                  >
                </div>
                <div class="flex justify-between items-center">
                  <span class="text-slate-400"
                    >Halkalı Leke Tetik Sıcaklığı:</span
                  >
                  <span class="text-slate-200 font-mono"
                    >{thresholds.peacockTempMin}°C - {thresholds.peacockTempMax}°C</span
                  >
                </div>
              </div>
            </div>
          {:else if activeTab === "thresholds"}
            <div class="space-y-4">
              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <span class="text-xs font-bold text-slate-200 block">
                  Halkalı Leke (Spilocaea oleagina) Çimlenme Kriterleri
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      for="th-p-hum"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Kritik Bağıl Nem (%)</label
                    >
                    <input
                      id="th-p-hum"
                      type="number"
                      min="0"
                      max="100"
                      bind:value={thresholds.peacockHumidity}
                      oninput={markAsCustom}
                      class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <span class="block text-[11px] text-slate-400 mb-1"
                      >Sıcaklık Aralığı (°C)</span
                    >
                    <div class="flex items-center gap-1">
                      <input
                        type="number"
                        step="0.5"
                        bind:value={thresholds.peacockTempMin}
                        oninput={markAsCustom}
                        class="w-1/2 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-center text-white focus:border-emerald-500"
                      />
                      <span class="text-slate-600">-</span>
                      <input
                        type="number"
                        step="0.5"
                        bind:value={thresholds.peacockTempMax}
                        oninput={markAsCustom}
                        class="w-1/2 px-2 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-center text-white focus:border-emerald-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      for="th-p-rain"
                      class="block text-[11px] text-slate-400 mb-1"
                      >48s Yağış Eşiği (mm)</label
                    >
                    <input
                      id="th-p-rain"
                      type="number"
                      step="0.1"
                      min="0"
                      bind:value={thresholds.peacockRainTrigger}
                      oninput={markAsCustom}
                      class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <span class="text-xs font-bold text-slate-200 block">
                  Zeytin Pas Akarı (Aceria oleae) Popülasyon Kriterleri
                </span>
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label
                      for="th-m-t"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Alt Sıcaklık (°C)</label
                    >
                    <input
                      id="th-m-t"
                      type="number"
                      step="0.5"
                      bind:value={thresholds.miteTempMin}
                      oninput={markAsCustom}
                      class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label
                      for="th-m-h"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Maks. Kuru Nem (%)</label
                    >
                    <input
                      id="th-m-h"
                      type="number"
                      min="0"
                      max="100"
                      bind:value={thresholds.miteHumidityMax}
                      oninput={markAsCustom}
                      class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label
                      for="th-m-r"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Yağış Baskılama (mm)</label
                    >
                    <input
                      id="th-m-r"
                      type="number"
                      step="0.1"
                      min="0"
                      bind:value={thresholds.miteRainSuppression}
                      oninput={markAsCustom}
                      class="w-full px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-white focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          {:else if activeTab === "gis"}
            <div class="space-y-4">
              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <span class="text-xs font-bold text-slate-200 block"
                  >CBS Epidemiyolojik Risk Çemberi</span
                >
                <div>
                  <div class="flex justify-between text-xs mb-1">
                    <label for="gis-radius-range" class="text-slate-400"
                      >Risk Yayılım Yarıçapı (km):</label
                    >
                    <b class="text-emerald-400 font-mono">{riskRadiusKm} km</b>
                  </div>
                  <input
                    id="gis-radius-range"
                    type="range"
                    min="0.5"
                    max="15.0"
                    step="0.5"
                    bind:value={riskRadiusKm}
                    class="w-full accent-emerald-500 cursor-pointer"
                  />
                </div>
                <p class="text-[11px] text-slate-400">
                  * Harita üzerindeki yeşil/kırmızı risk çemberinin çapı anlık
                  güncellenir.
                </p>
              </div>

              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
              >
                <label
                  for="gis-chilling-hours"
                  class="block text-xs font-bold text-slate-200"
                >
                  Kış Soğuklama İhtiyacı Hedefi (&lt;7.2°C)
                </label>
                <div class="flex items-center gap-3">
                  <input
                    id="gis-chilling-hours"
                    type="number"
                    min="100"
                    max="1500"
                    step="50"
                    bind:value={chillingTargetHours}
                    class="w-40 px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:border-emerald-500"
                  />
                  <span class="text-xs text-slate-400">saat / yıl</span>
                </div>
              </div>
            </div>
          {:else if activeTab === "integration"}
            <div class="space-y-4">
              <div
                class="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <span class="text-xs font-bold text-slate-200 block"
                  >ESP32 & Firebase REST Entegrasyonu</span
                >
                <div>
                  <label
                    for="int-fb-url"
                    class="block text-[11px] text-slate-400 mb-1"
                    >Firebase Realtime DB URL</label
                  >
                  <input
                    id="int-fb-url"
                    type="text"
                    bind:value={firebaseUrl}
                    placeholder="https://projeniz.firebaseio.com"
                    class="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:border-emerald-500"
                  />
                </div>
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      for="int-fb-node"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Düğüm Yolu (Node Path)</label
                    >
                    <input
                      id="int-fb-node"
                      type="text"
                      bind:value={nodePath}
                      placeholder="esp32_station"
                      class="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label
                      for="int-poll-sec"
                      class="block text-[11px] text-slate-400 mb-1"
                      >Yoklama Sıklığı (sn)</label
                    >
                    <input
                      id="int-poll-sec"
                      type="number"
                      min="3"
                      max="120"
                      bind:value={pollingIntervalSec}
                      class="w-full px-3 py-2 text-xs bg-slate-900 border border-slate-700 rounded-xl text-white font-mono focus:border-emerald-500"
                    />
                  </div>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Alt İşlem Butonları -->
        <div
          class="pt-4 border-t border-slate-800 flex items-center justify-between"
        >
          <button
            type="button"
            onclick={handleReset}
            class="px-3.5 py-2 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-950/40 border border-red-900/50 transition"
          >
            ↺ Varsayılanlara Sıfırla
          </button>

          <div class="flex gap-2">
            <button
              type="button"
              onclick={() => (isOpen = false)}
              class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
            >
              Kapat
            </button>
            <button
              type="button"
              disabled={isTestingKey}
              onclick={handleSave}
              class="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition shadow-lg shadow-emerald-950"
            >
              {isTestingKey ? "API Sınanıyor..." : "Kaydet ve Yeniden Hesapla"}
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>
{/if}
