<script>
  import { ModelPipeline } from "../../ai/ModelPipeline.svelte.js";

  // Svelte 5 Reaktif Durumları: 0 = Beklemede (Idle), 1..4 = Analiz Aşamaları
  /** @type {0 | 1 | 2 | 3 | 4} */
  let currentStep = $state(0);
  let isRunning = $state(false);

  // Tekil Aktif Tuval ve Girdi Referansları
  /** @type {HTMLCanvasElement} */
  let activeCanvas;
  /** @type {HTMLInputElement} */
  let fileInput;
  /** @type {HTMLInputElement} */
  let cameraInput;

  // HUD Telemetri Değerleri
  let origResolution = $state("--x--");
  let leafConfidence = $state(0);
  let severityRatio = $state(0);
  let lesionCount = $state(0);

  /** @type {import('../../ai/ModelPipeline.svelte.js').DiagnosisResult | null} */
  let diagnosisResult = $state(null);

  /**
   * Laboratuvarı başlangıç durumuna sıfırlar
   */
  function resetLab() {
    currentStep = 0;
    isRunning = false;
    diagnosisResult = null;
    origResolution = "--x--";
    leafConfidence = 0;
    severityRatio = 0;
    lesionCount = 0;

    if (activeCanvas) {
      const ctx = activeCanvas.getContext("2d");
      ctx?.clearRect(0, 0, activeCanvas.width, activeCanvas.height);
    }
  }

  /**
   * Tek Ekranda Sinematik ve Kesintisiz Analiz Akışı
   * @param {File} file
   */
  async function startAnalysisFlow(file) {
    if (!file.type.startsWith("image/")) {
      alert("Lütfen geçerli bir yaprak fotoğrafı seçin (JPG, PNG, WEBP).");
      return;
    }

    if (
      !ModelPipeline.status.isYoloReady ||
      !ModelPipeline.status.isClassifierReady
    ) {
      alert(
        "ONNX modelleri henüz hazır değil. Lütfen modellerin yüklenmesini bekleyin.",
      );
      return;
    }

    isRunning = true;
    diagnosisResult = null;

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;

    await new Promise((res) => (img.onload = res));

    const origW = img.naturalWidth;
    const origH = img.naturalHeight;
    origResolution = `${origW}x${origH}`;

    // 640x640 Hedefine Göre Ölçekleme Ölçüleri
    const target = 640;
    const scale = Math.min(target / origW, target / origH);
    const scaledW = Math.floor(origW * scale);
    const scaledH = Math.floor(origH * scale);

    activeCanvas.width = scaledW;
    activeCanvas.height = scaledH;

    const ctx = activeCanvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    // =========================================================================
    // ADIM 1: Görüntü Alındı & Tuvale Odaklandı (Görsel Yüklenince Başlar)
    // =========================================================================
    currentStep = 1;
    ctx.drawImage(img, 0, 0, scaledW, scaledH);
    await sleep(650);

    // =========================================================================
    // ADIM 2: YOLOv8s-seg Analizi & Lazer Taraması
    // =========================================================================
    currentStep = 2;

    const offscreenStep1 = document.createElement("canvas");
    offscreenStep1.width = scaledW;
    offscreenStep1.height = scaledH;
    const offCtx1 = offscreenStep1.getContext("2d");
    offCtx1?.drawImage(img, 0, 0, scaledW, scaledH);

    const offscreenStep3 = document.createElement("canvas");
    offscreenStep3.width = scaledW;
    offscreenStep3.height = scaledH;

    // ModelPipeline çıkarımını tetikle
    const finalDiag = await ModelPipeline.processLeafImage(img, {
      step1: offscreenStep1,
      step2: activeCanvas,
      step3: offscreenStep3,
    });

    leafConfidence = finalDiag.leafConfidence;
    severityRatio = finalDiag.severity;
    lesionCount = finalDiag.lesionConfidence > 0 ? 1 : 0;

    await sleep(400);

    // =========================================================================
    // ADIM 3: Zemin İzolasyonu RGB(0,0,0) — [SİYAH EKRAN HATASI ÇÖZÜLDÜ]
    // =========================================================================
    currentStep = 3;

    ctx.clearRect(0, 0, scaledW, scaledH);
    ctx.drawImage(offscreenStep3, 0, 0, scaledW, scaledH);

    await sleep(700);

    // =========================================================================
    // ADIM 4: Nihai Teşhis & Zirai Reçete (İzole Yaprak Tuvalde Sabit Kalır)
    // =========================================================================
    currentStep = 4;
    diagnosisResult = finalDiag;
    isRunning = false;

    URL.revokeObjectURL(objectUrl);
  }

  /**
   * @param {Event} e
   */
  function handleInputFile(e) {
    const target = /** @type {HTMLInputElement} */ (e.target);
    if (target.files && target.files[0]) {
      startAnalysisFlow(target.files[0]);
    }
  }

  /**
   * @param {number} ms
   */
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
</script>

<div class="max-w-6xl mx-auto py-4 space-y-6">
  <!-- Ana Kart: Dark Slate & Cam Efekti -->
  <div
    class="rounded-3xl bg-slate-900/90 border border-slate-800 p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden"
  >
    <!-- Üst Başlık -->
    <div
      class="text-center pb-6 border-b border-slate-800 flex flex-col items-center"
    >
      <div
        class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-2"
      >
        <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        Çift Kademeli ONNX Wasm Teşhis Motoru
      </div>
      <h2
        class="text-xl sm:text-2xl font-black text-white tracking-tight uppercase"
      >
        GEMLİK ZEYTİNİ — BİLGİSAYARLI GÖRÜ TEŞHİS LABORATUVARI
      </h2>
      <p class="text-xs text-slate-400 mt-1">
        YOLOv8s-seg piksel segmentasyonu ve EfficientNet-B0 derin sınıflandırma
        analizörü
      </p>
    </div>

    <!-- 2'li Sahne -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center pt-6">
      <!-- SOL: TEK TUVAL -->
      <div class="lg:col-span-7 flex flex-col items-center justify-center">
        <div
          class="relative aspect-square w-full max-w-[480px] bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center"
        >
          <canvas bind:this={activeCanvas} class="w-full h-full object-contain"
          ></canvas>

          <!-- Görsel Yokken Beliren Karşılama Katmanı -->
          {#if currentStep === 0}
            <div
              class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/95 text-center p-6"
            >
              <div
                class="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl shadow-inner"
              >
                🌿
              </div>
              <div>
                <p class="text-sm font-semibold text-white">
                  Yaprak Fotoğrafı Bekleniyor
                </p>
                <p class="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  Galerinizden bir görsel seçerek veya fotoğraf çekerek otomatik
                  analizi başlatın.
                </p>
              </div>
            </div>
          {/if}

          <!-- Adım Rozeti (Sol Üst) -->
          <div
            class="absolute top-3 left-3 px-3 py-1 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-700 text-xs font-mono font-semibold shadow-lg flex items-center gap-1.5"
          >
            {#if currentStep === 0}
              <span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
              <span class="text-slate-400">BEKLEMEDE</span>
            {:else}
              <span
                class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"
              ></span>
              <span class="text-emerald-400">ADIM {currentStep} / 4</span>
            {/if}
          </div>
        </div>

        <!-- Butonlar -->
        <div class="flex gap-3 pt-4 w-full max-w-[480px] justify-center">
          <input
            bind:this={fileInput}
            type="file"
            accept="image/*"
            onchange={handleInputFile}
            class="hidden"
          />
          <input
            bind:this={cameraInput}
            type="file"
            accept="image/*"
            capture="environment"
            onchange={handleInputFile}
            class="hidden"
          />

          {#if currentStep === 4}
            <button
              type="button"
              onclick={resetLab}
              class="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition flex items-center justify-center gap-2"
            >
              <span>🔄</span> Yeni Analiz Başlat
            </button>
          {:else}
            <button
              type="button"
              disabled={isRunning}
              onclick={() => fileInput.click()}
              class="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-sm"
            >
              <span>🖼️</span> Galeriden Seç
            </button>
            <button
              type="button"
              disabled={isRunning}
              onclick={() => cameraInput.click()}
              class="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition disabled:opacity-50 shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2"
            >
              <span>📷</span> Fotoğraf Çek
            </button>
          {/if}
        </div>
      </div>

      <!-- SAĞ: CANLI HUD PANELİ -->
      <div class="lg:col-span-5 h-full">
        <div
          class="p-6 rounded-2xl bg-slate-950/80 border border-slate-800 text-slate-200 shadow-2xl flex flex-col justify-between min-h-[480px] space-y-4"
        >
          <div>
            <!-- Üst Başlık Şeridi -->
            <div
              class="flex items-center justify-between pb-3 border-b border-slate-800"
            >
              <span
                class="text-xs font-semibold uppercase tracking-wider text-slate-400"
              >
                {currentStep === 0 ? "SİSTEM DURUMU" : "ANALİZ AKIŞI"}
              </span>
              <span
                class="text-[11px] px-2.5 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/80 font-mono"
              >
                {ModelPipeline.status.isYoloReady &&
                ModelPipeline.status.isClassifierReady
                  ? "WASM MOTORU AKTİF"
                  : "MODELLER BEKLENİYOR"}
              </span>
            </div>

            <!-- GÖRSEL YÜKLENMEDEN ÖNCEKİ BEKLEME (IDLE) DURUMU -->
            {#if currentStep === 0}
              <div class="space-y-5 pt-3">
                <div>
                  <h3
                    class="text-xl font-bold text-white flex items-center gap-2"
                  >
                    <span class="text-emerald-400">⚡</span> Sistem Hazır
                  </h3>
                  <p class="text-xs text-slate-400 mt-1 leading-relaxed">
                    YOLOv8s-seg ve EfficientNet-B0 modelleri WebAssembly
                    hafızasına derlendi. Teşhisi başlatmak için bir yaprak
                    fotoğrafı bekleniyor.
                  </p>
                </div>

                <!-- Teşhis İpuçları Kartı -->
                <div
                  class="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2 text-xs"
                >
                  <span class="font-semibold text-slate-200 block"
                    >📸 Optimum Teşhis İçin İpuçları:</span
                  >
                  <ul
                    class="space-y-1.5 text-slate-400 text-[11px] list-disc list-inside"
                  >
                    <li>
                      Yaprağı düz bir zemine koyup tek başına fotoğraflayın.
                    </li>
                    <li>
                      Varsa dairesel lezyon ve sararma halkalarının net
                      odaklandığından emin olun.
                    </li>
                    <li>Aşırı parlama veya gölgeli ışıktan kaçının.</li>
                  </ul>
                </div>

                <!-- Model Özellikleri Tablosu -->
                <div
                  class="space-y-2 pt-2 border-t border-slate-800/80 text-xs"
                >
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">1. YOLOv8s-seg:</span>
                    <span
                      class="text-emerald-400 font-mono text-[11px] font-semibold"
                      >Segmentasyon (640x640)</span
                    >
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">2. EfficientNet-B0:</span>
                    <span
                      class="text-emerald-400 font-mono text-[11px] font-semibold"
                      >Sınıflandırma (224x224)</span
                    >
                  </div>
                  <div class="flex justify-between items-center">
                    <span class="text-slate-400">Hedef Çeşit:</span>
                    <span class="text-slate-300 font-mono text-[11px]"
                      >{ModelPipeline.status.isYoloReady
                        ? "Gemlik (Trilye)"
                        : "Yükleniyor"}</span
                    >
                  </div>
                </div>

                <div
                  class="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400 flex items-center gap-2 mt-2"
                >
                  <span class="text-emerald-400">👈</span>
                  <span
                    >Analizi başlatmak için soldaki butonlardan bir görsel
                    yükleyin.</span
                  >
                </div>
              </div>
            {:else if currentStep === 1}
              <!-- ADIM 1: GİRDİ ALINDI -->
              <div class="space-y-4 pt-3">
                <h3
                  class="text-xl font-bold text-white flex items-center gap-2"
                >
                  <span class="text-emerald-400">01.</span> Görüntü Alındı & Odaklandı
                </h3>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Ham yaprak görüntüsü yüklendi. En-boy oranı korunarak 640x640
                  letterbox tensör matrisine dönüştürülüyor.
                </p>

                <div
                  class="space-y-2.5 pt-4 border-t border-slate-800/80 text-xs"
                >
                  <div class="flex justify-between">
                    <span class="text-slate-400">Giriş Çözünürlüğü:</span>
                    <span class="text-emerald-400 font-mono font-bold"
                      >{origResolution}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">Hedef Mahsul:</span>
                    <span class="text-white font-medium"
                      >Olea europaea cv. Gemlik</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">Tensör Boyutu:</span>
                    <span class="text-slate-300 font-mono"
                      >640x640 (RGB 114 Dolgu)</span
                    >
                  </div>
                </div>

                <div
                  class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-teal-300 animate-pulse mt-4 flex items-center gap-2"
                >
                  <span class="w-2 h-2 rounded-full bg-teal-400"></span>
                  Durum: YOLOv8s-seg segmentasyon modeli hazırlanıyor...
                </div>
              </div>
            {:else if currentStep === 2}
              <!-- ADIM 2: YOLOV8 SEGMENTASYON -->
              <div class="space-y-4 pt-3">
                <h3
                  class="text-xl font-bold text-white flex items-center gap-2"
                >
                  <span class="text-emerald-400">02.</span> YOLOv8s-seg Segmentasyon
                </h3>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Lazer tarama hattı devrede. 84 noktalı organik yaprak konturu
                  ve lezyon poligonları haritalanıyor.
                </p>

                <div
                  class="space-y-2.5 pt-4 border-t border-slate-800/80 text-xs"
                >
                  <div class="flex justify-between">
                    <span class="text-slate-400">Yaprak Güven Oranı:</span>
                    <span class="text-emerald-400 font-mono font-bold"
                      >%{leafConfidence.toFixed(1)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400"
                      >Leke Şiddeti (Gauss Shoelace):</span
                    >
                    <span class="text-red-400 font-mono font-bold"
                      >%{severityRatio.toFixed(1)}</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">Poligon Algoritması:</span>
                    <span class="text-slate-300"
                      >84 Radyal Işın (Ray Casting)</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400">Lezyon Durumu:</span>
                    <span class="text-teal-300"
                      >{lesionCount > 0
                        ? "Aktif Odak Tespit Edildi"
                        : "Lezyon Görülmedi"}</span
                    >
                  </div>
                </div>

                <div class="space-y-1.5 pt-2">
                  <span
                    class="text-[10px] text-slate-400 uppercase tracking-wider"
                    >HUD Lazer Taraması: Aktif</span
                  >
                  <div
                    class="w-full h-2 bg-slate-900 rounded-full overflow-hidden border border-slate-800"
                  >
                    <div
                      class="h-full bg-emerald-500 animate-pulse"
                      style="width: 100%"
                    ></div>
                  </div>
                </div>
              </div>
            {:else if currentStep === 3}
              <!-- ADIM 3: ZEMİN İZOLASYONU -->
              <div class="space-y-4 pt-3">
                <h3
                  class="text-xl font-bold text-white flex items-center gap-2"
                >
                  <span class="text-emerald-400">03.</span> Zemin İzolasyonu RGB(0,0,0)
                </h3>
                <p class="text-xs text-slate-400 leading-relaxed">
                  Arka plan ortam gürültüsü temizlendi. Zemin saf siyah
                  RGB(0,0,0) yapılarak lezyonlar izole edildi.
                </p>

                <div
                  class="space-y-2.5 pt-4 border-t border-slate-800/80 text-xs"
                >
                  <div class="flex justify-between">
                    <span class="text-slate-400">Masa / Zemin Gürültüsü:</span>
                    <span class="text-emerald-400 font-medium"
                      >Tamamen Temizlendi</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400"
                      >İç Delik Kapatma (Flood-Fill):</span
                    >
                    <span class="text-teal-300 font-mono font-bold"
                      >%100 Deliksiz Bütün</span
                    >
                  </div>
                  <div class="flex justify-between">
                    <span class="text-slate-400"
                      >Morfolojik Genişletme (Dilation):</span
                    >
                    <span class="text-slate-300 font-mono"
                      >5x5 Disk (+8px Koruma)</span
                    >
                  </div>
                </div>

                <div
                  class="p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-emerald-400 mt-4 flex items-center gap-2"
                >
                  <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"
                  ></span>
                  Durum: 2. Kademe EfficientNet-B0 sınıflandırıcısına aktarılıyor...
                </div>
              </div>
            {:else if currentStep === 4 && diagnosisResult}
              <!-- ADIM 4: NİHAİ TEŞHİS & ZİRAİ REÇETE -->
              <div class="space-y-3.5 pt-2">
                <div
                  class="p-4 rounded-xl bg-slate-900 border border-emerald-500/40 space-y-1 shadow-lg"
                >
                  <span
                    class="text-[10px] text-emerald-400 uppercase tracking-widest font-bold block"
                    >NİHAİ TEŞHİS RAPORU</span
                  >
                  <h4 class="text-lg font-bold text-white">
                    {diagnosisResult.disease}
                  </h4>
                  <div
                    class="flex justify-between text-xs pt-1 border-t border-slate-800 mt-2"
                  >
                    <span class="text-slate-400"
                      >Doğrulama Güveni: <b class="text-emerald-400 font-mono"
                        >%{diagnosisResult.confidence.toFixed(1)}</b
                      ></span
                    >
                    <span class="text-slate-400"
                      >Lezyon Şiddeti: <b class="text-red-400 font-mono"
                        >%{diagnosisResult.severity.toFixed(1)}</b
                      ></span
                    >
                  </div>
                </div>

                <!-- 3 Sınıflı Olasılık Dağılımı -->
                <div class="space-y-2 text-xs pt-1">
                  <div>
                    <div class="flex justify-between pb-1">
                      <span class="text-red-400 font-medium">Halkalı Leke:</span
                      >
                      <span class="text-slate-300 font-mono"
                        >%{diagnosisResult.probabilities.peacock.toFixed(
                          1,
                        )}</span
                      >
                    </div>
                    <div
                      class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-red-500"
                        style="width: {diagnosisResult.probabilities.peacock}%"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div class="flex justify-between pb-1">
                      <span class="text-amber-400 font-medium">Pas Akarı:</span>
                      <span class="text-slate-300 font-mono"
                        >%{diagnosisResult.probabilities.mite.toFixed(1)}</span
                      >
                    </div>
                    <div
                      class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-amber-500"
                        style="width: {diagnosisResult.probabilities.mite}%"
                      ></div>
                    </div>
                  </div>

                  <div>
                    <div class="flex justify-between pb-1">
                      <span class="text-emerald-400 font-medium"
                        >Sağlıklı Doku:</span
                      >
                      <span class="text-slate-300 font-mono"
                        >%{diagnosisResult.probabilities.healthy.toFixed(
                          1,
                        )}</span
                      >
                    </div>
                    <div
                      class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden"
                    >
                      <div
                        class="h-full bg-emerald-500"
                        style="width: {diagnosisResult.probabilities.healthy}%"
                      ></div>
                    </div>
                  </div>
                </div>

                <!-- Bakanlık Onaylı Reçete -->
                <div
                  class="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs space-y-1"
                >
                  <b class="text-emerald-400 block font-semibold"
                    >📋 T.C. Tarım ve Orman Bakanlığı Reçetesi:</b
                  >
                  <p class="text-slate-300 leading-relaxed text-[11px]">
                    {diagnosisResult.prescription}
                  </p>
                </div>
              </div>
            {/if}
          </div>

          <!-- Alt Çubuk -->
          <div
            class="pt-3 border-t border-slate-800/80 flex justify-between items-center text-[10px] text-slate-500"
          >
            <span>MODEL: YOLOv8s-seg + EfficientNet-B0</span>
            <span class="text-emerald-500/80">DONANIM: WASM SIMD</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
