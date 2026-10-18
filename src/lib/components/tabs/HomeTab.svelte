<script>
  import { onDestroy } from "svelte";

  /**
   * @typedef {Object} Props
   * @property {(tab: "diagnose" | "map") => void} [onNavigate]
   */

  /** @type {Props} */
  let { onNavigate } = $props();

  // Video Durumu ve Bellek Yönetimi
  let videoSrc = $state("/assets/demo_analysis.mp4");
  let currentBlobUrl = $state("");
  /** @type {HTMLInputElement} */
  let fileInput;

  /**
   * Yerel video seçildiğinde Blob URL oluşturur ve önceki belleği serbest bırakır
   * @param {Event} event
   */
  function handleLocalVideoSelect(event) {
    const target = /** @type {HTMLInputElement} */ (event.target);
    const files = target.files;

    if (files && files[0]) {
      if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
      }
      currentBlobUrl = URL.createObjectURL(files[0]);
      videoSrc = currentBlobUrl;
    }
  }

  onDestroy(() => {
    if (currentBlobUrl) {
      URL.revokeObjectURL(currentBlobUrl);
    }
  });
</script>

<div class="space-y-16 py-4">
  <!-- 1. Hero Bölümü -->
  <section class="text-center max-w-3xl mx-auto space-y-4">
    <div
      class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-lime-500/10 border border-lime-500/20 text-lime-400 text-xs font-semibold"
    >
      <span>🌿</span>
      <span>YOLOv8s-seg & EfficientNet-B0 Çift Kademeli Mimari</span>
    </div>

    <h1
      class="text-4xl sm:text-5xl font-black text-white tracking-tight leading-tight"
    >
      Gemlik Zeytininde Erken Teşhis ve İkili Risk Erken Uyarı Motoru
    </h1>

    <p class="text-base sm:text-lg text-slate-400 font-normal leading-relaxed">
      Halkalı Leke (<i class="text-slate-300">Spilocaea oleagina</i>) lezyon
      segmentasyonu, RGB(0,0,0) zemin izolasyonu ve Zeytin Pas Akarı (<i
        class="text-slate-300">Aceria oleae</i
      >) morfolojik sınıflandırmasıyla çiftçiye bilimsel zirai reçete.
    </p>

    <div class="pt-2 flex flex-wrap justify-center gap-3">
      <button
        type="button"
        onclick={() => onNavigate?.("diagnose")}
        class="px-6 py-3 rounded-xl bg-lime-600 hover:bg-lime-500 text-white font-semibold shadow-lg shadow-lime-950 transition flex items-center gap-2 text-sm"
      >
        <span>🔬</span> Teşhis Laboratuvarını Aç
      </button>
      <button
        type="button"
        onclick={() => onNavigate?.("map")}
        class="px-6 py-3 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white transition flex items-center gap-2 text-sm"
      >
        <span>🗺️</span> İkili Tehdit Haritası
      </button>
    </div>
  </section>

  <!-- 2. Sinematik HUD Video & 4 Adımlı Boru Hattı Kartları -->
  <section
    class="rounded-3xl p-6 sm:p-8 bg-slate-900/60 border border-slate-800/80 backdrop-blur shadow-2xl"
  >
    <div
      class="flex flex-col md:flex-row items-center justify-between mb-6 pb-4 border-b border-slate-800 gap-4"
    >
      <div>
        <h2 class="text-2xl font-bold text-white tracking-tight">
          Sistem Nasıl Çalışıyor?
        </h2>
        <p class="text-xs sm:text-sm text-slate-400">
          12 Saniyelik Sinematik Tanıtım & Çift Kademeli Çıkarım Boru Hattı
        </p>
      </div>
      <div class="flex items-center gap-2">
        <span
          class="text-xs px-3 py-1 rounded-lg bg-lime-950/60 text-lime-400 font-semibold border border-lime-800/50"
        >
          Hedef: Gemlik Zeytini
        </span>
        <span
          class="text-xs px-3 py-1 rounded-lg bg-slate-800 text-slate-300 font-medium border border-slate-700"
        >
          ⚡ ONNX Wasm Multi-Thread
        </span>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
      <!-- Video Oynatıcı -->
      <div
        class="lg:col-span-7 aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl relative flex flex-col justify-center items-center border border-slate-800 group"
      >
        <video
          src={videoSrc}
          class="w-full h-full object-cover"
          controls
          autoplay
          loop
          muted
          playsinline
        >
          <track kind="captions" />
          Tarayıcınız HTML5 video etiketini desteklemiyor.
        </video>

        <!-- Yerel MP4 Seçim Butonu -->
        <div
          class="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition duration-300"
        >
          <input
            bind:this={fileInput}
            type="file"
            accept="video/mp4,video/*"
            onchange={handleLocalVideoSelect}
            class="hidden"
          />
          <button
            type="button"
            onclick={() => fileInput.click()}
            class="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-900 text-white text-xs font-semibold backdrop-blur border border-slate-700 transition flex items-center gap-1.5 shadow-lg focus:outline-none focus:ring-2 focus:ring-lime-500"
          >
            <span>🎬</span> Kendi MP4 Videonu Seç
          </button>
        </div>
      </div>

      <!-- 4 Kademeli Açıklama Listesi -->
      <div class="lg:col-span-5 space-y-3">
        <div
          class="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex gap-3.5 items-start"
        >
          <span
            class="w-7 h-7 rounded-lg bg-lime-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            >1</span
          >
          <div>
            <h4 class="text-xs font-bold text-slate-100">
              Ham Görüntü Girişi & Letterbox
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Kamera veya galeriden gelen görüntü en-boy oranı korunarak
              RGB(114,114,114) dolgu ile 640x640 tensörüne dönüştürülür.
            </p>
          </div>
        </div>

        <div
          class="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex gap-3.5 items-start"
        >
          <span
            class="w-7 h-7 rounded-lg bg-lime-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            >2</span
          >
          <div>
            <h4 class="text-xs font-bold text-slate-100">
              YOLOv8s-seg Segmentasyonu
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Organik yaprak sınırı ve Halkalı Leke lezyonları piksel düzeyinde
              ayrıştırılarak Gauss Shoelace formülüyle <b class="text-slate-200"
                >Hastalık Şiddeti (%)</b
              > hesaplanır.
            </p>
          </div>
        </div>

        <div
          class="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex gap-3.5 items-start"
        >
          <span
            class="w-7 h-7 rounded-lg bg-lime-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            >3</span
          >
          <div>
            <h4 class="text-xs font-bold text-slate-100">
              Zemin İzolasyonu (RGB 0,0,0)
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              Yaprak dokusu korunarak arka plan tamamen saf siyaha boyanır;
              mantıksal VEYA (<code class="text-lime-400 text-[10px]"
                >leaf | lesion</code
              >) ile deliksiz bütünlük sağlanır.
            </p>
          </div>
        </div>

        <div
          class="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex gap-3.5 items-start"
        >
          <span
            class="w-7 h-7 rounded-lg bg-lime-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5"
            >4</span
          >
          <div>
            <h4 class="text-xs font-bold text-slate-100">
              EfficientNet-B0 & Zirai Reçete
            </h4>
            <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
              İzole yaprak 224x224 tensörle taranarak <b class="text-slate-200"
                >Pas Akarı</b
              >
              veya <b class="text-slate-200">Sağlıklı</b> teşhisi kesinleştirilir,
              Bakanlık onaylı etken madde reçetesi üretilir.
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- 3. Doğrulanmış Model Başarımı -->
  <section class="space-y-6">
    <div class="text-center max-w-xl mx-auto">
      <h3 class="text-2xl font-bold text-white tracking-tight">
        Doğrulanmış Model Başarımı
      </h3>
      <p class="text-xs sm:text-sm text-slate-400 mt-1">
        Roboflow ve PyTorch eğitiminde elde edilen bağımsız test seti metrikleri
      </p>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl text-center"
      >
        <span
          class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1"
          >Yaprak Maske mAP50</span
        >
        <span class="text-3xl font-black text-lime-400 font-mono">%99.4</span>
        <span class="text-[11px] text-slate-500 block mt-1"
          >YOLOv8s-seg İzolasyonu</span
        >
      </div>

      <div
        class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl text-center"
      >
        <span
          class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1"
          >Leke Tespit mAP50</span
        >
        <span class="text-3xl font-black text-amber-400 font-mono">%81.6</span>
        <span class="text-[11px] text-slate-500 block mt-1"
          >%91 Hassasiyet (Precision)</span
        >
      </div>

      <div
        class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl text-center"
      >
        <span
          class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1"
          >Pas Akarı Başarımı</span
        >
        <span class="text-3xl font-black text-sky-400 font-mono">%100</span>
        <span class="text-[11px] text-slate-500 block mt-1"
          >Tam Duyarlılık (Recall)</span
        >
      </div>

      <div
        class="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl text-center"
      >
        <span
          class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1"
          >Genel Val Doğruluğu</span
        >
        <span class="text-3xl font-black text-emerald-400 font-mono"
          >%98.99</span
        >
        <span class="text-[11px] text-slate-500 block mt-1"
          >EfficientNet-B0 Doğrulaması</span
        >
      </div>
    </div>
  </section>
</div>
