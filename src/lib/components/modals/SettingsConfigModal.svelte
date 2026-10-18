<script>
  import {
    AppConfig,
    WEATHER_PROVIDERS,
  } from "../../config/AppConfig.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {boolean} [isOpen]
   * @property {() => Promise<void>} [onSave]
   */

  /** @type {Props} */
  let { isOpen = $bindable(false), onSave } = $props();

  let weatherProvider = $state(AppConfig.weather.provider);
  let weatherApiKey = $state(AppConfig.getRawWeatherApiKey());

  $effect(() => {
    if (isOpen) {
      weatherProvider = AppConfig.weather.provider;
      weatherApiKey = AppConfig.getRawWeatherApiKey();
    }
  });

  async function handleSave() {
    AppConfig.setWeatherConfig(weatherProvider, weatherApiKey);
    if (onSave) {
      await onSave();
    }
    isOpen = false;
  }

  /**
   * @param {"camera" | "location" | "notification"} type
   */
  async function requestPermission(type) {
    try {
      if (type === "camera") {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        alert("✅ Kamera izni onaylandı.");
      } else if (type === "location") {
        navigator.geolocation.getCurrentPosition(
          () => alert("✅ Konum izni onaylandı."),
          () => alert("❌ Konum izni reddedildi."),
        );
      } else if (type === "notification") {
        const perm = await Notification.requestPermission();
        if (perm === "granted") alert("✅ Bildirim izni onaylandı.");
        else alert("❌ Bildirim izni reddedildi.");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      alert(`İzin talebi başarısız: ${msg}`);
    }
  }
</script>

{#if isOpen}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    role="dialog"
    aria-modal="true"
    aria-labelledby="modal-settings-title"
  >
    <div
      class="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl relative"
    >
      <!-- Başlık ve Kapat Butonu -->
      <div
        class="flex items-center justify-between border-b border-slate-800 pb-4"
      >
        <h3
          id="modal-settings-title"
          class="text-xl font-bold text-white flex items-center gap-2"
        >
          <span class="text-emerald-400">⚙️</span> Sistem & API Ayarları
        </h3>
        <button
          type="button"
          onclick={() => (isOpen = false)}
          class="text-slate-400 hover:text-white p-1 rounded-lg transition"
          aria-label="Kapat"
        >
          ✕
        </button>
      </div>

      <div class="space-y-4">
        <!-- Hava Durumu Sağlayıcı Seçimi -->
        <div>
          <label
            for="w-prov"
            class="block text-xs font-semibold text-slate-300 mb-1.5"
          >
            Meteoroloji Servis Sağlayıcısı
          </label>
          <select
            id="w-prov"
            bind:value={weatherProvider}
            class="w-full px-3.5 py-2.5 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value={WEATHER_PROVIDERS.OPEN_METEO}
              >Open-Meteo (Ücretsiz — API Key Gerekmez)</option
            >
            <option value={WEATHER_PROVIDERS.OPENWEATHER}
              >OpenWeatherMap (API Key Gerekir)</option
            >
            <option value={WEATHER_PROVIDERS.WEATHERAPI}
              >WeatherAPI.com (API Key Gerekir)</option
            >
          </select>
        </div>

        {#if weatherProvider !== WEATHER_PROVIDERS.OPEN_METEO}
          <div>
            <label
              for="w-key"
              class="block text-xs font-semibold text-slate-300 mb-1.5"
            >
              API Anahtarı
            </label>
            <input
              id="w-key"
              type="password"
              bind:value={weatherApiKey}
              placeholder="API anahtarınızı yapıştırın"
              class="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-700 rounded-xl text-white font-mono focus:border-emerald-500 focus:outline-none"
            />
          </div>
        {/if}

        <!-- Donanım ve Tarayıcı İzinleri (a11y uyumlu span kullanıldı) -->
        <div class="pt-3 border-t border-slate-800">
          <span class="block text-xs font-semibold text-slate-300 mb-2"
            >Cihaz İzinleri</span
          >
          <div class="grid grid-cols-3 gap-2.5">
            <button
              type="button"
              onclick={() => requestPermission("camera")}
              class="p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 transition text-center"
            >
              <span class="block text-base mb-1">📷</span> Kamera
            </button>
            <button
              type="button"
              onclick={() => requestPermission("location")}
              class="p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 transition text-center"
            >
              <span class="block text-base mb-1">📍</span> Konum
            </button>
            <button
              type="button"
              onclick={() => requestPermission("notification")}
              class="p-3 rounded-xl border border-slate-800 bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-300 transition text-center"
            >
              <span class="block text-base mb-1">🔔</span> Bildirim
            </button>
          </div>
        </div>
      </div>

      <!-- Alt Butonlar -->
      <div class="pt-4 border-t border-slate-800 flex justify-end gap-2">
        <button
          type="button"
          onclick={() => (isOpen = false)}
          class="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:bg-slate-800 transition"
        >
          Vazgeç
        </button>
        <button
          type="button"
          onclick={handleSave}
          class="px-5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition shadow-lg shadow-emerald-950"
        >
          Kaydet
        </button>
      </div>
    </div>
  </div>
{/if}
