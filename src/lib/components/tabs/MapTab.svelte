<script>
  import MapViewer from "../ui/MapViewer.svelte";
  import { AppConfig } from "../../config/AppConfig.svelte.js";

  /**
   * @typedef {Object} Props
   * @property {{ lat: number, lon: number, name?: string }} [location]
   * @property {any} [weatherData]
   * @property {any} [riskAssessment]
   * @property {any} [incubationTimeline]
   * @property {any} [annualArchive]
   * @property {(lat: number, lon: number, name: string) => void} [onLocationChange]
   * @property {() => Promise<void>} [onRefresh]
   */

  /** @type {Props} */
  let {
    location = $bindable({
      lat: 40.4286,
      lon: 29.1556,
      name: "Gemlik Havzası, Bursa",
    }),
    weatherData = null,
    riskAssessment = null,
    incubationTimeline = null,
    annualArchive = null,
    onLocationChange,
    onRefresh,
  } = $props();

  let isLocating = $state(false);

  /**
   * TS2339 Çözümü: Telemetriyi tip güvenliğiyle biçimlendiren yardımcı fonksiyonlar
   */
  function getEspTemp() {
    const t = /** @type {any} */ (AppConfig.hardware.lastTelemetry);
    if (
      t &&
      typeof t.temperature === "number" &&
      Number.isFinite(t.temperature)
    ) {
      return `${t.temperature} °C`;
    }
    return "Bağlantı Yok";
  }

  function getEspHum() {
    const t = /** @type {any} */ (AppConfig.hardware.lastTelemetry);
    if (t && typeof t.humidity === "number" && Number.isFinite(t.humidity)) {
      return `%${t.humidity}`;
    }
    return "Bağlantı Yok";
  }

  function handleGetLocation() {
    if (!navigator.geolocation) {
      alert("Tarayıcınız coğrafi konum servisini desteklemiyor.");
      return;
    }

    isLocating = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(4));
        const lon = Number(pos.coords.longitude.toFixed(4));
        const name = "Mevcut Konumum";

        location = { lat, lon, name };
        AppConfig.setUserLocation(lat, lon, name);

        if (onLocationChange) onLocationChange(lat, lon, name);
        if (onRefresh) await onRefresh();
        isLocating = false;
      },
      (err) => {
        console.warn("[MapTab] Geolocation hatası:", err);
        alert("Konum alınamadı. Lütfen tarayıcı izinlerinizi kontrol edin.");
        isLocating = false;
      },
      { timeout: 10000, enableHighAccuracy: true },
    );
  }

  let chillingProgress = $derived(() => {
    const hours = annualArchive?.chillingHoursEstimate || 0;
    const target = AppConfig.phenology?.chillingTargetHours || 500;
    return Math.min(100, Math.round((hours / target) * 100));
  });

  let chillingBadge = $derived(() => {
    const hours = annualArchive?.chillingHoursEstimate || 0;
    const target = AppConfig.phenology?.chillingTargetHours || 500;
    if (hours >= target) {
      return {
        text: "Soğuklama İhtiyacı Karşılandı",
        class: "bg-emerald-950 text-emerald-400 border border-emerald-800",
      };
    }
    if (hours >= target * 0.7) {
      return {
        text: "Yeterli Seviyeye Yakın",
        class: "bg-amber-950 text-amber-400 border border-amber-800",
      };
    }
    return {
      text: "Yetersiz Soğuklama Riski",
      class: "bg-red-950 text-red-400 border border-red-800",
    };
  });
</script>

<div class="space-y-10 py-4 max-w-7xl mx-auto">
  <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
    <div>
      <h2 class="text-3xl font-bold text-white tracking-tight">
        İkili Hastalık Risk Haritası ve İklim Takibi
      </h2>
      <p class="text-slate-400 text-xs sm:text-sm mt-1">
        Halkalı Leke ve Zeytin Pas Akarı enfeksiyon ihtimallerini mikroklima ve
        IoT sensörleriyle canlı izleyin.
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <div
        class="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-200 flex items-center gap-2 shadow-sm"
      >
        <span class="text-emerald-400">📍</span>
        <span>{location.name || "Gemlik Havzası, Bursa"}</span>
      </div>

      <button
        type="button"
        onclick={handleGetLocation}
        disabled={isLocating}
        class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition flex items-center gap-2 shadow-lg shadow-emerald-950"
      >
        <span>{isLocating ? "⏳" : "🎯"}</span>
        <span>{isLocating ? "Konum Alınıyor..." : "Konumumu Al"}</span>
      </button>
    </div>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
    <div class="lg:col-span-8 flex flex-col space-y-2">
      <div
        class="h-[520px] rounded-3xl overflow-hidden shadow-2xl border border-slate-800 bg-slate-950"
      >
        <MapViewer
          bind:location
          riskData={riskAssessment}
          telemetry={AppConfig.hardware.lastTelemetry}
          onLocationChange={async (lat, lon, name) => {
            AppConfig.setUserLocation(lat, lon, name);
            location = { lat, lon, name };
            if (onLocationChange) onLocationChange(lat, lon, name);
            if (onRefresh) await onRefresh();
          }}
        />
      </div>
      <div
        class="flex items-center justify-between px-2 text-[11px] text-slate-500"
      >
        <span
          >💡 İpucu: Haritaya tıklayarak veya yaprak pinini sürükleyerek bahçe
          koordinatını değiştirebilirsiniz.</span
        >
        <span class="font-mono text-slate-400"
          >{location.lat.toFixed(3)}°N, {location.lon.toFixed(3)}°E</span
        >
      </div>
    </div>

    <div class="lg:col-span-4 space-y-4">
      <div
        class="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            Halkalı Leke Tehdidi
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-xs font-bold {riskAssessment
              ?.peacock?.badgeClass || 'bg-slate-800 text-slate-400'}"
          >
            %{riskAssessment?.peacock?.score ?? "--"}
          </span>
        </div>
        <span class="text-lg font-black text-white block">
          {riskAssessment?.peacock?.title || "Değerlendiriliyor..."}
        </span>
        <p class="text-[11px] text-slate-400 leading-relaxed">
          {riskAssessment?.peacock?.description ||
            "Mantar sporlarının çimlenmesi için mikroklima analiz ediliyor."}
        </p>
      </div>

      <div
        class="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5"
          >
            <span class="w-2 h-2 rounded-full bg-sky-400"></span>
            Pas Akarı Tehdidi
          </span>
          <span
            class="px-2 py-0.5 rounded-full text-xs font-bold {riskAssessment
              ?.mite?.badgeClass || 'bg-slate-800 text-slate-400'}"
          >
            %{riskAssessment?.mite?.score ?? "--"}
          </span>
        </div>
        <span class="text-lg font-black text-white block">
          {riskAssessment?.mite?.title || "Değerlendiriliyor..."}
        </span>
        <p class="text-[11px] text-slate-400 leading-relaxed">
          {riskAssessment?.mite?.description ||
            "Sıcaklık ve kuru nem değerleri taze sürgünlerde zararlı popülasyonu için taranıyor."}
        </p>
      </div>

      <div
        class="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-bold text-slate-400 uppercase tracking-wider"
            >Meteoroloji İstasyonu</span
          >
          <span
            class="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider"
          >
            {weatherData?.provider || "OPEN-METEO"}
          </span>
        </div>

        {#if weatherData?.fallbackTriggered}
          <div
            class="p-2 rounded-lg bg-amber-950/60 border border-amber-800/80 text-[10px] text-amber-300 leading-snug flex items-start gap-1.5"
          >
            <span>⚠️</span>
            <span
              ><b>{weatherData.originalRequestedProvider?.toUpperCase()}</b>
              yanıt vermedi ({weatherData.failureReason}). Sistem
              <b>Open-Meteo</b> servisine geçti.</span
            >
          </div>
        {/if}

        <div class="grid grid-cols-2 gap-2 text-xs pt-1">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
            <span class="text-slate-500 block text-[10px]">Hava Sıcaklığı</span>
            <span class="font-bold text-white text-sm"
              >{weatherData?.current?.temperature?.toFixed(1) ?? "--.-"} °C</span
            >
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
            <span class="text-slate-500 block text-[10px]">Bağıl Nem</span>
            <span class="font-bold text-white text-sm"
              >%{weatherData?.current?.humidity?.toFixed(0) ?? "--"}</span
            >
          </div>
        </div>
      </div>

      <!-- ESP32 Canlı Sensör Telemetrisi (TS2339 Hatasından Arındırıldı) -->
      <div
        class="p-4 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-2"
      >
        <div class="flex items-center justify-between">
          <span
            class="text-xs font-bold text-slate-400 uppercase tracking-wider"
            >Saha İstasyonu (ESP32)</span
          >
          <span
            class="w-2.5 h-2.5 rounded-full {AppConfig.hardware.isOnline
              ? 'bg-emerald-400 animate-pulse'
              : 'bg-slate-600'}"
          ></span>
        </div>
        <div class="grid grid-cols-2 gap-2 pt-1">
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
            <span class="text-[10px] text-slate-500 block"
              >Sensör Sıcaklığı</span
            >
            <span class="text-base font-bold text-white">
              {getEspTemp()}
            </span>
          </div>
          <div class="bg-slate-950 p-2.5 rounded-xl border border-slate-800/80">
            <span class="text-[10px] text-slate-500 block">Sensör Nemi</span>
            <span class="text-base font-bold text-white">
              {getEspHum()}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <section
    class="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6"
  >
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4"
    >
      <div>
        <div
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-bold mb-1"
        >
          <span>⏳</span> 60 Günlük Biyolojik İnkübasyon Penceresi
        </div>
        <h3 class="text-xl font-bold text-white">
          Geçmiş 30 Gün Yağış/Nem Odakları ve Gelecek 16 Gün İkili Risk Tahmini
        </h3>
        <p class="text-xs text-slate-400 mt-0.5">
          Halkalı Leke kuluçka dönemi analizi ve Pas Akarı için kritik kuru-ılık
          günler.
        </p>
      </div>

      <div class="flex items-center gap-2 self-start sm:self-auto">
        <div
          class="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-center"
        >
          <span class="text-[10px] text-slate-500 block"
            >Geçmiş Yağış (-30g)</span
          >
          <span class="text-xs font-black text-slate-200"
            >{incubationTimeline?.summaryStats?.pastRainSum ?? "--"} mm</span
          >
        </div>
        <div
          class="px-3 py-1.5 rounded-xl bg-red-950/40 border border-red-800/50 text-center"
        >
          <span class="text-[10px] text-red-400 block">Kritik Gün (-30g)</span>
          <span class="text-xs font-black text-red-400"
            >{incubationTimeline?.summaryStats?.pastRiskDaysCount ?? "--"} Gün</span
          >
        </div>
        <div
          class="px-3 py-1.5 rounded-xl bg-sky-950/40 border border-sky-800/50 text-center"
        >
          <span class="text-[10px] text-sky-400 block"
            >Beklenen Yağış (+16g)</span
          >
          <span class="text-xs font-black text-sky-400"
            >{incubationTimeline?.summaryStats?.futureRainSum ?? "--"} mm</span
          >
        </div>
      </div>
    </div>

    <div
      class="flex items-stretch gap-3 overflow-x-auto pb-4 pt-1 snap-x scrollbar-thin"
    >
      {#if !incubationTimeline?.dailyPoints || incubationTimeline.dailyPoints.length === 0}
        <div
          class="w-full text-center py-8 text-xs text-slate-500 flex items-center justify-center gap-2"
        >
          <span
            class="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"
          ></span>
          İnkübasyon zaman verileri yükleniyor...
        </div>
      {:else}
        {#each incubationTimeline.dailyPoints as day}
          <div
            class="snap-start shrink-0 w-32 p-3 rounded-2xl border text-center space-y-2 flex flex-col justify-between {day.isToday
              ? 'bg-emerald-950/30 border-emerald-500 shadow-lg shadow-emerald-950/50'
              : day.isPast
                ? 'bg-slate-950/60 border-slate-800/80'
                : 'bg-slate-900 border-slate-800'}"
          >
            <div>
              <span
                class="text-[10px] font-bold block {day.isToday
                  ? 'text-emerald-400'
                  : 'text-slate-400'}"
              >
                {day.date}
                {day.isToday ? "(Bugün)" : ""}
              </span>
              <span class="text-xs font-extrabold text-white block mt-0.5"
                >{day.tMean}°C</span
              >
              <span class="text-[10px] text-slate-500">%{day.humidity} Nem</span
              >
            </div>

            <div class="pt-1 border-t border-slate-800/80">
              <span class="text-[10px] text-sky-400 block font-mono"
                >🌧️ {day.rain} mm</span
              >
              <span
                class="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold {day.riskLevel ===
                'critical'
                  ? 'bg-red-950 text-red-400 border border-red-800'
                  : day.riskLevel === 'high'
                    ? 'bg-orange-950 text-orange-400 border border-orange-800'
                    : day.riskLevel === 'moderate'
                      ? 'bg-amber-950 text-amber-400 border border-amber-800'
                      : 'bg-slate-800 text-slate-400'}"
              >
                %{day.riskScore} Risk
              </span>
            </div>
          </div>
        {/each}
      {/if}
    </div>
  </section>

  <section
    class="bg-slate-900/90 rounded-3xl border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6"
  >
    <div
      class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4"
    >
      <div>
        <div
          class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold mb-1"
        >
          <span>❄️</span> ERA5 Reanalysis Tarihsel İklim & Fenoloji
        </div>
        <h3 class="text-xl font-bold text-white">
          Son 365 Gün İklim Geçmişi ve Kış Soğuklama İhtiyacı
        </h3>
        <p class="text-xs text-slate-400 mt-0.5">
          Seçili çeşit ({AppConfig.cultivar.name}) için çiçeklenme verimini
          belirleyen soğuklama birikimi (&lt;7.2°C) ve yıllık yağış.
        </p>
      </div>

      <span
        class="px-3.5 py-1.5 rounded-full text-xs font-bold self-start sm:self-auto {chillingBadge()
          .class}"
      >
        {chillingBadge().text}
      </span>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div
        class="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-3"
      >
        <div class="flex justify-between items-center text-xs">
          <span class="font-bold text-slate-300">Kış Soğuklama Birikimi</span>
          <span class="text-slate-500"
            >Hedef: {AppConfig.phenology?.chillingTargetHours || 500} Saat</span
          >
        </div>
        <div class="flex items-baseline gap-1.5">
          <span class="text-3xl font-black text-white font-mono"
            >{annualArchive?.chillingHoursEstimate ?? "---"}</span
          >
          <span class="text-xs font-semibold text-slate-400"
            >saat (&lt;7.2°C)</span
          >
        </div>
        <div class="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            class="h-full bg-sky-500 rounded-full transition-all duration-700"
            style="width: {chillingProgress()}%"
          ></div>
        </div>
      </div>

      <div
        class="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
      >
        <span class="font-bold text-slate-300 text-xs block"
          >Yıllık Kümülatif Yağış</span
        >
        <div class="flex items-baseline gap-1.5">
          <span class="text-3xl font-black text-emerald-400 font-mono"
            >{annualArchive?.totalRainfallMm ?? "---"}</span
          >
          <span class="text-xs font-semibold text-slate-400">mm / yıl</span>
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Optimum dane tutumu için yıllık asgari 500-600 mm yağış gereklidir.
        </p>
      </div>

      <div
        class="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-2"
      >
        <span class="font-bold text-slate-300 text-xs block"
          >Yıllık Mantar Patlama Günleri</span
        >
        <div class="flex items-baseline gap-1.5">
          <span class="text-3xl font-black text-red-400 font-mono"
            >{annualArchive?.highRiskDaysCount ?? "---"}</span
          >
          <span class="text-xs font-semibold text-slate-400"
            >yüksek riskli gün</span
          >
        </div>
        <p class="text-[11px] text-slate-400 leading-snug">
          Geçtiğimiz 1 yılda spor çimlenmesi için kritik nem ve sıcaklık
          koşullarının birleştiği gün sayısı.
        </p>
      </div>
    </div>

    <div class="space-y-3 pt-2">
      <span
        class="text-xs font-bold uppercase tracking-wider text-slate-400 block"
      >
        12 Aylık Sıcaklık ve Yağış Profili
      </span>

      {#if !annualArchive?.monthlySummaries || annualArchive.monthlySummaries.length === 0}
        <div
          class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-xs text-slate-500"
        >
          İklim arşivi verileri yükleniyor...
        </div>
      {:else}
        <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
          {#each annualArchive.monthlySummaries as m}
            <div
              class="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-center space-y-1"
            >
              <span class="text-[11px] font-bold text-slate-300 block"
                >{m.month}</span
              >
              <span class="text-xs font-extrabold text-emerald-400 block"
                >{m.avgTemp}°C</span
              >
              <div
                class="text-[10px] text-slate-400 pt-1 border-t border-slate-800"
              >
                <span>🌧️ {m.totalRain} mm</span>
                <span class="block text-red-400 font-medium"
                  >⚠️ {m.riskDays} gün</span
                >
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </section>
</div>
