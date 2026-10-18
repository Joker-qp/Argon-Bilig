<script>
  import { onMount, onDestroy } from "svelte";
  import { AppConfig } from "./lib/config/AppConfig.svelte.js";
  import { WeatherService } from "./lib/services/WeatherService.js";
  import { Esp32Service } from "./lib/services/Esp32Service.js";
  import { RiskService } from "./lib/services/RiskService.js";
  import { HistoricalArchiveService } from "./lib/services/HistoricalArchiveService.js";
  import { ModelPipeline } from "./lib/ai/ModelPipeline.svelte.js";

  // Sekmeler ve Modallar
  import HomeTab from "./lib/components/tabs/HomeTab.svelte";
  import DiagnosisLab from "./lib/components/tabs/DiagnosisLab.svelte";
  import MapTab from "./lib/components/tabs/MapTab.svelte";
  import SettingsModal from "./lib/components/modals/SettingsConfigModal.svelte";
  import AdminConfigModal from "./lib/components/modals/AdminModal.svelte";

  // Svelte 5 Reaktif Durumları
  /** @type {"home" | "diagnose" | "map"} */
  let activeTab = $state("home");
  let isSettingsOpen = $state(false);
  let isAdminOpen = $state(false);

  // Servis Veri Depoları
  /** @type {any} */
  let weatherData = $state(null);
  /** @type {any} */
  let riskAssessment = $state(null);
  /** @type {any} */
  let incubationTimeline = $state(null);
  /** @type {any} */
  let annualArchive = $state(null);
  let isInitializing = $state(true);

  /** @type {(() => void) | null} */
  let unsubscribeEsp = null;

  /**
   * Canlı telemetri ve hava durumunu birleştirerek ikili riski hesaplar
   */
  function recalculateRisk() {
    const telemetry = Esp32Service.getState();
    riskAssessment = RiskService.evaluateDualRisk(weatherData, telemetry);
  }

  /**
   * Tüm sistem servislerini koordine eden ana veri tazeleme döngüsü
   * @param {boolean} [forceRefresh=false]
   */
  async function refreshSystemData(forceRefresh = false) {
    const loc = AppConfig.getUserLocation();
    try {
      const [wData, incData, annData] = await Promise.allSettled([
        WeatherService.getForecast(loc.lat, loc.lon, forceRefresh),
        HistoricalArchiveService.getIncubationTimeline(loc.lat, loc.lon),
        HistoricalArchiveService.getAnnualClimateArchive(loc.lat, loc.lon),
      ]);

      if (wData.status === "fulfilled") weatherData = wData.value;
      if (incData.status === "fulfilled") incubationTimeline = incData.value;
      if (annData.status === "fulfilled") annualArchive = annData.value;

      recalculateRisk();
    } catch (err) {
      console.error("[App] Sistem senkronizasyon hatası:", err);
    }
  }

  onMount(async () => {
    // 1. ESP32 Telemetri Dinleyicisini Başlat
    Esp32Service.startListener();
    unsubscribeEsp = Esp32Service.subscribe(() => {
      recalculateRisk();
    });

    // 2. ONNX Çıkarım Motorunu Arka Planda Derle
    ModelPipeline.initialize();

    // 3. Meteoroloji ve İklim Verilerini Yükle
    await refreshSystemData(true);
    isInitializing = false;
  });

  onDestroy(() => {
    if (unsubscribeEsp) {
      unsubscribeEsp();
    }
    Esp32Service.stopListener();
  });
</script>

<div
  class="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-600 selection:text-white"
>
  <!-- Üst Başlık & Navigasyon (Header) -->
  <header
    class="sticky top-0 z-40 bg-slate-900/90 backdrop-blur border-b border-slate-800"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex items-center justify-between h-16">
        <!-- Marka Logosu & Başlık -->
        <button
          type="button"
          onclick={() => (activeTab = "home")}
          class="flex items-center gap-3 text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-xl"
        >
          <div
            class="w-10 h-10 rounded-xl bg-emerald-700 text-white flex items-center justify-center font-bold text-xl shadow-lg shadow-emerald-950/40 border border-emerald-600/50"
          >
            🌱
          </div>
          <div>
            <span
              class="text-xl font-bold tracking-tight text-white block leading-tight"
            >
              Argon<span class="text-emerald-400">-bilig</span>
            </span>
            <span class="text-[11px] block text-slate-400 font-medium">
              Olea europaea cv. Gemlik
            </span>
          </div>
        </button>

        <!-- Sekme Yönlendirme Menüsü -->
        <nav class="hidden md:flex items-center gap-1.5" aria-label="Ana Menü">
          <button
            type="button"
            onclick={() => (activeTab = "home")}
            class="px-4 py-2 rounded-xl text-xs font-semibold transition {activeTab ===
            'home'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🏠 Ana Sayfa
          </button>
          <button
            type="button"
            onclick={() => (activeTab = "diagnose")}
            class="px-4 py-2 rounded-xl text-xs font-semibold transition {activeTab ===
            'diagnose'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🔬 Teşhis Laboratuvarı
          </button>
          <button
            type="button"
            onclick={() => (activeTab = "map")}
            class="px-4 py-2 rounded-xl text-xs font-semibold transition {activeTab ===
            'map'
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'}"
          >
            🗺️ İkili Risk Haritası
          </button>
        </nav>

        <!-- Donanım Durumu & Modallar (⚙️ ve 🔒) -->
        <div class="flex items-center gap-2.5">
          <div
            class="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300"
            title="ESP32 Saha İstasyonu Durumu"
          >
            <span
              class="w-2.5 h-2.5 rounded-full {AppConfig.hardware.isOnline
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-slate-600'}"
            ></span>
            <span
              >{AppConfig.hardware.isOnline
                ? "ESP32 Çevrimiçi"
                : "ESP32 Bağlantısı Yok"}</span
            >
          </div>

          <!-- Standart Ayarlar Butonu (⚙️) -->
          <button
            type="button"
            onclick={() => (isSettingsOpen = true)}
            title="Sistem & API Ayarları"
            class="p-2.5 rounded-xl border border-slate-800 text-slate-400 hover:bg-slate-800 hover:text-white transition focus:outline-none focus:ring-2 focus:ring-emerald-500"
            aria-label="Ayarlar"
          >
            ⚙️
          </button>

          <!-- Yetkili Yönetici Paneli Butonu (🔒) -->
          <button
            type="button"
            onclick={() => (isAdminOpen = true)}
            title="Yönetici Eşik & Parametre Paneli"
            class="p-2.5 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
            aria-label="Yönetici Paneli"
          >
            🔒
          </button>
        </div>
      </div>
    </div>
  </header>

  <!-- Dinamik Sekme Gövdesi -->
  <main class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
    {#if isInitializing}
      <div
        class="h-96 flex flex-col items-center justify-center gap-3 text-slate-400"
      >
        <div
          class="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"
        ></div>
        <span class="text-xs"
          >Argon-bilig Servisleri Senkronize Ediliyor...</span
        >
      </div>
    {:else}
      {#if activeTab === "home"}
        <!-- 1. SEKME: Ana Sayfa & Tanıtım -->
        <HomeTab onNavigate={(tab) => (activeTab = tab)} />
      {:else if activeTab === "diagnose"}
        <!-- 2. SEKME: Tek Tuval Sinematik Teşhis Laboratuvarı -->
        <DiagnosisLab />
      {:else if activeTab === "map"}
        <!-- 3. SEKME: İkili Risk CBS Haritası & İklim Arşivi -->
        <MapTab
          location={AppConfig.getUserLocation()}
          {weatherData}
          {riskAssessment}
          {incubationTimeline}
          {annualArchive}
          onLocationChange={(lat, lon, name) => {
            AppConfig.setUserLocation(lat, lon, name);
            refreshSystemData(true);
          }}
          onRefresh={() => refreshSystemData(true)}
        />
      {/if}
    {/if}
  </main>

  <!-- Modallar -->
  <SettingsModal
    bind:isOpen={isSettingsOpen}
    onSave={() => refreshSystemData(true)}
  />
  <AdminConfigModal
    bind:isOpen={isAdminOpen}
    onSaveAndRecalculate={() => refreshSystemData(true)}
  />
</div>
