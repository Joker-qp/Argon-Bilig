/**
 * Argon-bilig — Çift Kademeli ONNX Çıkarım Boru Hattı
 * Mimari: Svelte 5 Runes ($state) Tabanlı Reaktif AI Servisi & Computer Vision Engine
 * Sorumluluk: Çoklu tespit füzyonu (Multi-Detection), Topolojik Delik Kapatma (fillMaskHoles),
 * 5x5 Morfolojik Genişletme (binaryDilation), RGB(0,0,0) Zemin İzolasyonu ve EfficientNet-B0.
 */

import * as ort from "onnxruntime-web";
import {
  AppConfig,
  AI_CLASSES,
  GEMLIK_SPECS,
} from "../config/AppConfig.svelte.js";

// Wasm Ortam Güvenliği ve Çoklu İş Parçacığı Yapılandırması
if (typeof window !== "undefined") {
  try {
    ort.env.wasm.wasmPaths =
      "https://cdn.jsdelivr.net/npm/onnxruntime-web/dist/";
    const isCrossOriginIsolated =
      typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
    ort.env.wasm.numThreads = isCrossOriginIsolated
      ? Math.min(4, navigator.hardwareConcurrency || 4)
      : 1;
    ort.env.wasm.simd = true;
  } catch (e) {
    console.warn("[ModelPipeline] Wasm donanım optimizasyonu uyarısı:", e);
  }
}

export const MODEL_CONSTANTS = Object.freeze({
  yoloSize: 640,
  protoSize: 160,
  classifierSize: 224,
  polygonPoints: 84,
  letterboxColor: "rgb(114, 114, 114)",
  paths: {
    yolo: "/models/yolov8_seg.onnx",
    classifier: "/models/efficientnet.onnx",
  },
  normMean: [0.485, 0.456, 0.406],
  normStd: [0.229, 0.224, 0.225],
});

/**
 * @typedef {Object} DiagnosisProbabilities
 * @property {number} peacock
 * @property {number} mite
 * @property {number} healthy
 */

/**
 * @typedef {Object} DiagnosisResult
 * @property {string} disease
 * @property {"peacock" | "mite" | "healthy"} type
 * @property {number} confidence
 * @property {number} severity
 * @property {string} prescription
 * @property {DiagnosisProbabilities} probabilities
 * @property {number} leafConfidence
 * @property {number} lesionConfidence
 * @property {Array<{x: number, y: number}>} leafPolygon
 * @property {Array<{x: number, y: number}>} lesionPolygon
 */

/**
 * @typedef {Object} PipelineCanvases
 * @property {HTMLCanvasElement} [step1]
 * @property {HTMLCanvasElement} [step2]
 * @property {HTMLCanvasElement} [step3]
 */

/**
 * Dış sınırlardan Flood-Fill (BFS) uygulayarak yaprağın içindeki
 * tüm nekrotik ve klorotik siyah delikleri %100 deliksiz doldurur.
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
function fillMaskHoles(mask, width, height) {
  const size = width * height;
  const isExternalBg = new Uint8Array(size);
  /** @type {number[]} */
  const queue = [];

  for (let x = 0; x < width; x++) {
    if (mask[x] === 0) {
      isExternalBg[x] = 1;
      queue.push(x);
    }
    const bIdx = (height - 1) * width + x;
    if (mask[bIdx] === 0 && !isExternalBg[bIdx]) {
      isExternalBg[bIdx] = 1;
      queue.push(bIdx);
    }
  }
  for (let y = 0; y < height; y++) {
    const lIdx = y * width;
    if (mask[lIdx] === 0 && !isExternalBg[lIdx]) {
      isExternalBg[lIdx] = 1;
      queue.push(lIdx);
    }
    const rIdx = y * width + (width - 1);
    if (mask[rIdx] === 0 && !isExternalBg[rIdx]) {
      isExternalBg[rIdx] = 1;
      queue.push(rIdx);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const cx = idx % width;
    const cy = Math.floor(idx / width);

    const neighbors = [
      cy > 0 ? (cy - 1) * width + cx : -1,
      cy < height - 1 ? (cy + 1) * width + cx : -1,
      cx > 0 ? cy * width + (cx - 1) : -1,
      cx < width - 1 ? cy * width + (cx + 1) : -1,
    ];

    for (let i = 0; i < 4; i++) {
      const nIdx = neighbors[i];
      if (nIdx !== -1 && mask[nIdx] === 0 && isExternalBg[nIdx] === 0) {
        isExternalBg[nIdx] = 1;
        queue.push(nIdx);
      }
    }
  }

  const filledMask = new Uint8Array(size);
  for (let i = 0; i < size; i++) {
    filledMask[i] = isExternalBg[i] === 1 ? 0 : 255;
  }

  return filledMask;
}

/**
 * 5x5 Dairesel Disk Morfolojik Genişletme (Binary Dilation)
 * @param {Uint8Array} mask
 * @param {number} width
 * @param {number} height
 * @param {number} [iterations=1]
 * @returns {Uint8Array}
 */
function binaryDilation(mask, width, height, iterations = 1) {
  const kernelOffsets = [];
  const radius = 2;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy <= 5) {
        kernelOffsets.push([dx, dy]);
      }
    }
  }

  let current = new Uint8Array(mask);

  for (let iter = 0; iter < iterations; iter++) {
    const output = new Uint8Array(current.length);

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (current[rowOffset + x] === 255) {
          for (let k = 0; k < kernelOffsets.length; k++) {
            const nx = x + kernelOffsets[k][0];
            const ny = y + kernelOffsets[k][1];
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              output[ny * width + nx] = 255;
            }
          }
        }
      }
    }
    current = output;
  }

  return current;
}

class ModelPipelineOrchestrator {
  /** @type {ort.InferenceSession | null} */
  #yoloSession = null;
  /** @type {ort.InferenceSession | null} */
  #classifierSession = null;

  status = $state({
    isYoloReady: false,
    isClassifierReady: false,
    isChecking: false,
    isAnalyzing: false,
    currentStep: 0,
    stepTitle: "",
    stepDesc: "",
    badgeText: "Modeller Denetleniyor...",
    badgeClass: "bg-amber-100 text-amber-800",
  });

  /** @type {DiagnosisResult | null} */
  diagnosis = $state(null);

  constructor() {}

  async initialize() {
    if (this.status.isChecking) return;
    this.status.isChecking = true;

    this.status.badgeText = "Modeller Yükleniyor...";
    this.status.badgeClass = "bg-amber-100 text-amber-800";

    await Promise.all([
      this.#loadStageModel("yolo"),
      this.#loadStageModel("classifier"),
    ]);

    this.#refreshStatusIndicators();
    this.status.isChecking = false;
  }

  /**
   * @param {"yolo" | "classifier"} type
   */
  async #loadStageModel(type) {
    const isYolo = type === "yolo";
    /** @type {ort.InferenceSession.SessionOptions} */
    const sessionOptions = {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    };

    try {
      const memoryBuffer = AppConfig.getCustomModelBuffer(type);
      /** @type {ort.InferenceSession | null} */
      let session = null;

      if (memoryBuffer) {
        session = await ort.InferenceSession.create(
          new Uint8Array(memoryBuffer),
          sessionOptions,
        );
      } else {
        const filePath = isYolo
          ? MODEL_CONSTANTS.paths.yolo
          : MODEL_CONSTANTS.paths.classifier;

        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}: '${filePath}' dosyası sunucuda bulunamadı.`,
          );
        }

        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("text/html")) {
          throw new Error(
            `'${filePath}' dosyası yerine HTML döndü. Dosyanın 'public/models/' altında olduğunu kontrol edin.`,
          );
        }

        const arrayBuffer = await response.arrayBuffer();
        session = await ort.InferenceSession.create(
          new Uint8Array(arrayBuffer),
          sessionOptions,
        );
      }

      if (isYolo) {
        this.#yoloSession = session;
        this.status.isYoloReady = true;
      } else {
        this.#classifierSession = session;
        this.status.isClassifierReady = true;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[ModelPipeline] ${type} modeli yüklenemedi:`, msg);
      if (isYolo) {
        this.#yoloSession = null;
        this.status.isYoloReady = false;
      } else {
        this.#classifierSession = null;
        this.status.isClassifierReady = false;
      }
    }
  }

  /**
   * @param {string} fileName
   * @param {ArrayBuffer} arrayBuffer
   */
  async loadModelFromBuffer(fileName, arrayBuffer) {
    const isYolo =
      fileName.toLowerCase().includes("seg") ||
      fileName.toLowerCase().includes("yolo");

    try {
      /** @type {ort.InferenceSession.SessionOptions} */
      const sessionOptions = { executionProviders: ["wasm"] };
      const session = await ort.InferenceSession.create(
        new Uint8Array(arrayBuffer),
        sessionOptions,
      );

      if (isYolo) {
        this.#yoloSession = session;
        this.status.isYoloReady = true;
        AppConfig.setCustomModelBuffer("yolo", arrayBuffer);
      } else {
        this.#classifierSession = session;
        this.status.isClassifierReady = true;
        AppConfig.setCustomModelBuffer("classifier", arrayBuffer);
      }

      this.#refreshStatusIndicators();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Model derleme hatası (${fileName}): ${msg}`);
    }
  }

  /**
   * @param {HTMLImageElement | HTMLVideoElement | HTMLCanvasElement} imageSource
   * @param {PipelineCanvases} [canvases]
   * @returns {Promise<DiagnosisResult>}
   */
  async processLeafImage(imageSource, canvases = {}) {
    if (!this.status.isYoloReady || !this.status.isClassifierReady) {
      throw new Error(
        "ONNX Modelleri henüz hazır değil. Lütfen modelleri yükleyin.",
      );
    }

    this.status.isAnalyzing = true;
    this.diagnosis = null;

    const origW =
      ("videoWidth" in imageSource && imageSource.videoWidth) ||
      ("naturalWidth" in imageSource && imageSource.naturalWidth) ||
      imageSource.width ||
      800;
    const origH =
      ("videoHeight" in imageSource && imageSource.videoHeight) ||
      ("naturalHeight" in imageSource && imageSource.naturalHeight) ||
      imageSource.height ||
      600;

    try {
      // ADIM 1: Letterbox Odaklama
      this.status.currentStep = 1;
      this.status.stepTitle = "ADIM 1: Görüntü Alındı & Yaprak Odaklama";
      this.status.stepDesc = `Görüntü unpad/crop ile odaklandı (${origW}x${origH}), YOLOv8s-seg tensörü hazırlanıyor...`;

      const offscreenLboxCanvas = document.createElement("canvas");
      offscreenLboxCanvas.width = MODEL_CONSTANTS.yoloSize;
      offscreenLboxCanvas.height = MODEL_CONSTANTS.yoloSize;
      const lboxCtx = offscreenLboxCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      if (!lboxCtx) throw new Error("Offscreen 2D Context başlatılamadı.");

      const letterboxParams = this.#drawLetterboxImage(
        lboxCtx,
        imageSource,
        origW,
        origH,
      );

      if (canvases.step1) {
        canvases.step1.width = letterboxParams.scaledW;
        canvases.step1.height = letterboxParams.scaledH;
        const ctx1 = canvases.step1.getContext("2d", {
          willReadFrequently: true,
        });
        ctx1?.drawImage(
          imageSource,
          0,
          0,
          letterboxParams.scaledW,
          letterboxParams.scaledH,
        );
      }

      await this.#sleep(400);

      // ADIM 2: YOLOv8s-seg Çıkarımı
      this.status.currentStep = 2;
      this.status.stepTitle = "ADIM 2: YOLOv8s-seg Segmentasyon";
      this.status.stepDesc =
        "Organik yaprak sınırları ve lezyon poligonları lazerle taranıyor...";

      const yoloResult = await this.#executeYoloSegmentation(
        lboxCtx,
        letterboxParams,
      );

      if (canvases.step2 && canvases.step1) {
        canvases.step2.width = letterboxParams.scaledW;
        canvases.step2.height = letterboxParams.scaledH;
        const ctx2 = canvases.step2.getContext("2d");
        if (ctx2) {
          await this.#animateLaserScanSweep(
            ctx2,
            canvases.step1,
            yoloResult,
            letterboxParams,
          );
        }
      }

      await this.#sleep(400);

      // ADIM 3: Deliksiz Zemin İzolasyonu RGB(0,0,0)
      this.status.currentStep = 3;
      this.status.stepTitle = "ADIM 3: Zemin İzolasyonu (RGB 0,0,0)";
      this.status.stepDesc =
        "Topolojik delik kapatma ve morfolojik genişletme ile yaprak deliksiz izole ediliyor...";

      const offscreenIsoCanvas =
        canvases.step3 || document.createElement("canvas");
      offscreenIsoCanvas.width = letterboxParams.scaledW;
      offscreenIsoCanvas.height = letterboxParams.scaledH;
      const ctx3 = offscreenIsoCanvas.getContext("2d", {
        willReadFrequently: true,
      });

      const sourceCanvasForIsolation = canvases.step1 || offscreenLboxCanvas;
      if (ctx3) {
        this.#applyBackgroundIsolation(
          ctx3,
          sourceCanvasForIsolation,
          yoloResult,
          letterboxParams,
        );
      }

      await this.#sleep(400);

      // ADIM 4: EfficientNet-B0 Sınıflandırma
      this.status.currentStep = 4;
      this.status.stepTitle = "ADIM 4: Sınıflandırma & Zirai Reçete";
      this.status.stepDesc =
        "İzole yaprak 3 sınıflı olasılık dağılımı ve Bakanlık reçetesi üretiliyor...";

      const effResult = await this.#executeEfficientNetClassification(
        offscreenIsoCanvas,
        yoloResult,
      );

      /** @type {DiagnosisResult} */
      const finalDiagnosis = {
        ...effResult,
        leafConfidence: yoloResult.leafConfidence,
        lesionConfidence: yoloResult.lesionConfidence,
        leafPolygon: yoloResult.leafPolygon,
        lesionPolygon: yoloResult.lesionPolygon,
      };

      this.diagnosis = finalDiagnosis;
      return finalDiagnosis;
    } finally {
      this.status.isAnalyzing = false;
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {CanvasImageSource} img
   * @param {number} srcW
   * @param {number} srcH
   */
  #drawLetterboxImage(ctx, img, srcW, srcH) {
    const target = MODEL_CONSTANTS.yoloSize;
    const scale = Math.min(target / srcW, target / srcH);

    const scaledW = Math.floor(srcW * scale);
    const scaledH = Math.floor(srcH * scale);
    const padX = Math.floor((target - scaledW) / 2);
    const padY = Math.floor((target - scaledH) / 2);

    ctx.fillStyle = MODEL_CONSTANTS.letterboxColor;
    ctx.fillRect(0, 0, target, target);
    ctx.drawImage(img, padX, padY, scaledW, scaledH);

    return { padX, padY, scaledW, scaledH, scale, target };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ padX: number, padY: number, scaledW: number, scaledH: number, scale: number, target: number }} lbox
   */
  async #executeYoloSegmentation(ctx, lbox) {
    if (!this.#yoloSession)
      throw new Error("YOLOv8s-seg oturumu başlatılamadı.");

    const inputTensor = this.#preprocessToTensor(
      ctx,
      MODEL_CONSTANTS.yoloSize,
      MODEL_CONSTANTS.yoloSize,
      false,
    );

    const inputName = this.#yoloSession.inputNames[0];
    const feeds = { [inputName]: inputTensor };

    /** @type {ort.InferenceSession.OnnxValueMapType | null} */
    let outputMap = null;
    try {
      outputMap = await this.#yoloSession.run(feeds);
      return this.#parseYoloSegOutput(outputMap, lbox);
    } finally {
      inputTensor.dispose?.();
      if (outputMap) {
        for (const k of Object.keys(outputMap)) {
          outputMap[k].dispose?.();
        }
      }
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {boolean} [normalize=false]
   * @returns {ort.Tensor}
   */
  #preprocessToTensor(ctx, width, height, normalize = false) {
    const imgData = ctx.getImageData(0, 0, width, height).data;
    const floatArr = new Float32Array(1 * 3 * width * height);

    const channelSize = width * height;
    const redOffset = 0;
    const greenOffset = channelSize;
    const blueOffset = 2 * channelSize;

    for (let i = 0, p = 0; i < imgData.length; i += 4, p++) {
      let r = imgData[i] / 255.0;
      let g = imgData[i + 1] / 255.0;
      let b = imgData[i + 2] / 255.0;

      if (normalize) {
        r = (r - MODEL_CONSTANTS.normMean[0]) / MODEL_CONSTANTS.normStd[0];
        g = (g - MODEL_CONSTANTS.normMean[1]) / MODEL_CONSTANTS.normStd[1];
        b = (b - MODEL_CONSTANTS.normMean[2]) / MODEL_CONSTANTS.normStd[2];
      }

      floatArr[redOffset + p] = r;
      floatArr[greenOffset + p] = g;
      floatArr[blueOffset + p] = b;
    }

    return new ort.Tensor("float32", floatArr, [1, 3, height, width]);
  }

  /**
   * @param {ort.InferenceSession.OnnxValueMapType} outputMap
   * @param {{ padX: number, padY: number, scaledW: number, scaledH: number, scale: number, target: number }} lbox
   */
  #parseYoloSegOutput(outputMap, lbox) {
    const outKeys = Object.keys(outputMap);
    /** @type {ort.Tensor | null} */
    let boxTensor = null;
    /** @type {ort.Tensor | null} */
    let protoTensor = null;

    for (const k of outKeys) {
      const t = /** @type {ort.Tensor} */ (outputMap[k]);
      if (t.dims.length === 3) boxTensor = t;
      else if (t.dims.length === 4) protoTensor = t;
    }

    if (!boxTensor || !protoTensor) {
      throw new Error(
        "YOLOv8-seg model çıktısı eksik: Box veya Proto tensörü bulunamadı.",
      );
    }

    const boxData = /** @type {Float32Array} */ (boxTensor.data);
    const numPredictions = boxTensor.dims[2] || 8400;
    const protoData = /** @type {Float32Array} */ (protoTensor.data);

    // =========================================================================
    // ÇOKLU TESPİT TOPLAYICI: Sadece 1 kutu değil, tüm geçerli lezyonları al
    // =========================================================================
    /** @type {Array<{ idx: number, score: number }>} */
    const leafCandidates = [];
    /** @type {Array<{ idx: number, score: number }>} */
    const lesionCandidates = [];

    for (let i = 0; i < numPredictions; i++) {
      const leafScore = boxData[4 * numPredictions + i];
      const lesionScore = boxData[5 * numPredictions + i];

      if (leafScore > 0.3) {
        leafCandidates.push({ idx: i, score: leafScore });
      }
      if (lesionScore > 0.22) {
        lesionCandidates.push({ idx: i, score: lesionScore });
      }
    }

    leafCandidates.sort((a, b) => b.score - a.score);
    lesionCandidates.sort((a, b) => b.score - a.score);

    const protoSize = MODEL_CONSTANTS.protoSize;
    const leafMaskBuffer = new Uint8Array(protoSize * protoSize);
    const lesionMaskBuffer = new Uint8Array(protoSize * protoSize);

    // En güçlü yaprak adaylarını birleştir
    for (const cand of leafCandidates.slice(0, 3)) {
      const idx = cand.idx;
      const coeffs = new Float32Array(32);
      for (let k = 0; k < 32; k++) {
        coeffs[k] = boxData[(6 + k) * numPredictions + idx];
      }
      const cx = boxData[0 * numPredictions + idx] / 4;
      const cy = boxData[1 * numPredictions + idx] / 4;
      const w = boxData[2 * numPredictions + idx] / 4;
      const h = boxData[3 * numPredictions + idx] / 4;

      this.#computeMaskFromProto(
        protoData,
        coeffs,
        cx,
        cy,
        w,
        h,
        leafMaskBuffer,
      );
    }

    // Yaprak üzerindeki TÜM lezyon odaklarını kümülatif olarak birleştir
    const hasLesion = lesionCandidates.length > 0;
    for (const cand of lesionCandidates.slice(0, 15)) {
      const idx = cand.idx;
      const coeffs = new Float32Array(32);
      for (let k = 0; k < 32; k++) {
        coeffs[k] = boxData[(6 + k) * numPredictions + idx];
      }
      const cx = boxData[0 * numPredictions + idx] / 4;
      const cy = boxData[1 * numPredictions + idx] / 4;
      const w = boxData[2 * numPredictions + idx] / 4;
      const h = boxData[3 * numPredictions + idx] / 4;

      this.#computeMaskFromProto(
        protoData,
        coeffs,
        cx,
        cy,
        w,
        h,
        lesionMaskBuffer,
      );
    }

    // 1. Aşama: Yaprak ve tüm lezyonları mantıksal VEYA ile birleştir
    const rawUnionBuffer = new Uint8Array(protoSize * protoSize);
    for (let i = 0; i < rawUnionBuffer.length; i++) {
      rawUnionBuffer[i] = leafMaskBuffer[i] | lesionMaskBuffer[i];
    }

    // 2. Aşama: TOPOLOJİK DELİK KAPATMA (İç nekroz ve kloroz boşluklarını tamamen doldur)
    const holeFilledMaskBuffer = fillMaskHoles(
      rawUnionBuffer,
      protoSize,
      protoSize,
    );

    // 3. Aşama: Morfolojik Genişletme (Kenar lezyonlarını korumak için 5x5 disk ile dışa doğru şişir)
    const dilatedMaskBuffer = binaryDilation(
      holeFilledMaskBuffer,
      protoSize,
      protoSize,
      1,
    );

    // Organik poligon hesabı
    const leafGeom = this.#extractOrganicPolygonAndArea(
      holeFilledMaskBuffer,
      protoSize,
      protoSize,
      MODEL_CONSTANTS.polygonPoints,
    );

    /** @type {{ polygon: Array<{x: number, y: number}>, area: number }} */
    let lesionGeom = { polygon: [], area: 0.0 };
    if (hasLesion) {
      lesionGeom = this.#extractOrganicPolygonAndArea(
        lesionMaskBuffer,
        protoSize,
        protoSize,
        MODEL_CONSTANTS.polygonPoints,
      );
    }

    const severityRatio =
      leafGeom.area > 0
        ? Math.min(100.0, (lesionGeom.area / leafGeom.area) * 100.0)
        : 0.0;

    const leafMaskCanvas = this.#createScaledMaskCanvas(
      holeFilledMaskBuffer,
      [34, 197, 94, 90],
    );
    const lesionMaskCanvas = hasLesion
      ? this.#createScaledMaskCanvas(lesionMaskBuffer, [239, 68, 68, 200])
      : null;

    return {
      hasLesion,
      leafConfidence:
        leafCandidates.length > 0
          ? Math.min(100.0, leafCandidates[0].score * 100)
          : 0,
      lesionConfidence:
        lesionCandidates.length > 0
          ? Math.min(100.0, lesionCandidates[0].score * 100)
          : 0,
      severityRatio: Number(severityRatio.toFixed(1)),
      leafMaskCanvas,
      lesionMaskCanvas,
      rawFinalMaskBuffer: holeFilledMaskBuffer,
      rawDilatedMaskBuffer: dilatedMaskBuffer, // <-- Deliksiz ve genişletilmiş nihai maske
      rawLeafMaskBuffer: leafMaskBuffer,
      rawLesionMaskBuffer: lesionMaskBuffer,
      leafPolygon: leafGeom.polygon,
      lesionPolygon: lesionGeom.polygon,
    };
  }

  /**
   * @param {Uint8Array} maskBuffer
   * @param {number} width
   * @param {number} height
   * @param {number} [numPoints=84]
   */
  #extractOrganicPolygonAndArea(maskBuffer, width, height, numPoints = 84) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        if (maskBuffer[rowOffset + x] === 255) {
          sumX += x;
          sumY += y;
          count++;
        }
      }
    }

    if (count === 0) {
      return { polygon: [], area: 0.0 };
    }

    const cX = sumX / count;
    const cY = sumY / count;
    /** @type {Array<{x: number, y: number}>} */
    const polygon = [];
    const maxRadius = Math.hypot(width, height);

    for (let i = 0; i < numPoints; i++) {
      const theta = (2 * Math.PI * i) / numPoints;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let borderX = cX;
      let borderY = cY;

      for (let r = maxRadius; r >= 0; r -= 0.5) {
        const sampleX = Math.round(cX + r * cosT);
        const sampleY = Math.round(cY + r * sinT);

        if (
          sampleX >= 0 &&
          sampleX < width &&
          sampleY >= 0 &&
          sampleY < height
        ) {
          if (maskBuffer[sampleY * width + sampleX] === 255) {
            borderX = sampleX;
            borderY = sampleY;
            break;
          }
        }
      }

      polygon.push({ x: borderX, y: borderY });
    }

    let shoelaceSum = 0;
    for (let i = 0; i < polygon.length; i++) {
      const next = (i + 1) % polygon.length;
      shoelaceSum +=
        polygon[i].x * polygon[next].y - polygon[next].x * polygon[i].y;
    }
    const area = 0.5 * Math.abs(shoelaceSum);

    return { polygon, area };
  }

  /**
   * @param {Float32Array} proto
   * @param {Float32Array} coeffs
   * @param {number} cx
   * @param {number} cy
   * @param {number} w
   * @param {number} h
   * @param {Uint8Array} outBuffer
   */
  #computeMaskFromProto(proto, coeffs, cx, cy, w, h, outBuffer) {
    const size = MODEL_CONSTANTS.protoSize;
    const xMin = Math.max(0, Math.floor(cx - w / 2));
    const xMax = Math.min(size, Math.ceil(cx + w / 2));
    const yMin = Math.max(0, Math.floor(cy - h / 2));
    const yMax = Math.min(size, Math.ceil(cy + h / 2));

    let activePixels = 0;

    for (let y = yMin; y < yMax; y++) {
      const yOffset = y * size;
      for (let x = xMin; x < xMax; x++) {
        let logit = 0.0;
        const pixelIdx = yOffset + x;

        for (let k = 0; k < 32; k++) {
          logit += coeffs[k] * proto[k * (size * size) + pixelIdx];
        }

        const prob = 1.0 / (1.0 + Math.exp(-logit));
        if (prob > 0.5) {
          outBuffer[pixelIdx] = 255;
          activePixels++;
        }
      }
    }

    return activePixels;
  }

  /**
   * @param {Uint8Array} maskBuffer
   * @param {number[]} fillColor
   */
  #createScaledMaskCanvas(maskBuffer, fillColor) {
    const size = MODEL_CONSTANTS.protoSize;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = size;
    tempCanvas.height = size;
    const ctx = tempCanvas.getContext("2d");
    if (!ctx) return tempCanvas;

    const imgData = ctx.createImageData(size, size);

    for (let i = 0; i < maskBuffer.length; i++) {
      if (maskBuffer[i] === 255) {
        const p = i * 4;
        imgData.data[p] = fillColor[0];
        imgData.data[p + 1] = fillColor[1];
        imgData.data[p + 2] = fillColor[2];
        imgData.data[p + 3] = fillColor[3];
      }
    }

    ctx.putImageData(imgData, 0, 0);

    const finalCanvas = document.createElement("canvas");
    finalCanvas.width = MODEL_CONSTANTS.yoloSize;
    finalCanvas.height = MODEL_CONSTANTS.yoloSize;
    const finalCtx = finalCanvas.getContext("2d");
    if (finalCtx) {
      finalCtx.imageSmoothingEnabled = false;
      finalCtx.drawImage(
        tempCanvas,
        0,
        0,
        MODEL_CONSTANTS.yoloSize,
        MODEL_CONSTANTS.yoloSize,
      );
    }

    return finalCanvas;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} rawCanvas
   * @param {any} yoloResult
   * @param {any} lbox
   * @returns {Promise<void>}
   */
  async #animateLaserScanSweep(ctx, rawCanvas, yoloResult, lbox) {
    const width = lbox?.scaledW ?? rawCanvas.width;
    const height = lbox?.scaledH ?? rawCanvas.height;
    const padX = lbox?.padX ?? 0;
    const padY = lbox?.padY ?? 0;
    const duration = 1500;
    const startTime = performance.now();

    return new Promise((resolve) => {
      /** @param {number} now */
      const renderFrame = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1.0, elapsed / duration);
        const laserY = progress * height;

        ctx.drawImage(rawCanvas, 0, 0, width, height);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, laserY);
        ctx.clip();

        if (yoloResult.leafMaskCanvas) {
          ctx.drawImage(
            yoloResult.leafMaskCanvas,
            padX,
            padY,
            width,
            height,
            0,
            0,
            width,
            height,
          );
        }

        if (yoloResult.hasLesion && yoloResult.lesionMaskCanvas) {
          ctx.drawImage(
            yoloResult.lesionMaskCanvas,
            padX,
            padY,
            width,
            height,
            0,
            0,
            width,
            height,
          );
        }
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = "#facc15";
        ctx.lineWidth = 3;
        ctx.shadowColor = "#facc15";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.moveTo(0, laserY);
        ctx.lineTo(width, laserY);
        ctx.stroke();
        ctx.restore();

        if (progress < 1.0) {
          requestAnimationFrame(renderFrame);
        } else {
          ctx.drawImage(rawCanvas, 0, 0, width, height);
          if (yoloResult.leafMaskCanvas) {
            ctx.drawImage(
              yoloResult.leafMaskCanvas,
              padX,
              padY,
              width,
              height,
              0,
              0,
              width,
              height,
            );
          }
          if (yoloResult.hasLesion && yoloResult.lesionMaskCanvas) {
            ctx.drawImage(
              yoloResult.lesionMaskCanvas,
              padX,
              padY,
              width,
              height,
              0,
              0,
              width,
              height,
            );
          }
          resolve(undefined);
        }
      };

      requestAnimationFrame(renderFrame);
    });
  }

  /**
   * Zemin İzolasyonu (RGB 0,0,0)
   * Delik kapatılmış ve 5x5 genişletilmiş maske ile yaprak tüm lezyonlarıyla deliksiz aktarılır.
   * @param {CanvasRenderingContext2D} ctx
   * @param {HTMLCanvasElement} sourceCanvas
   * @param {any} yoloResult
   * @param {any} lbox
   */
  #applyBackgroundIsolation(ctx, sourceCanvas, yoloResult, lbox) {
    const width = lbox?.scaledW ?? sourceCanvas.width;
    const height = lbox?.scaledH ?? sourceCanvas.height;
    const padX = lbox?.padX ?? 0;
    const padY = lbox?.padY ?? 0;

    // 1. Zemin tuvalini tamamen saf siyah RGB(0,0,0) ile doldur
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, width, height);

    // Öncelik: Delikleri Kapatılmış & Genişletilmiş Maske
    const maskBuffer =
      yoloResult.rawDilatedMaskBuffer ||
      yoloResult.rawFinalMaskBuffer ||
      yoloResult.rawLeafMaskBuffer;

    if (!maskBuffer) return;

    const sourceCtx = sourceCanvas.getContext("2d");
    if (!sourceCtx) return;

    const srcImgData = sourceCtx.getImageData(0, 0, width, height);
    const outImgData = ctx.createImageData(width, height);

    const srcPixels = srcImgData.data;
    const outPixels = outImgData.data;
    const protoSize = MODEL_CONSTANTS.protoSize;
    const yoloSize = MODEL_CONSTANTS.yoloSize;

    for (let y = 0; y < height; y++) {
      const yInYolo = y + padY;
      const protoY = Math.floor((yInYolo * protoSize) / yoloSize);
      const safeProtoY = Math.min(protoSize - 1, Math.max(0, protoY));
      const protoRowOffset = safeProtoY * protoSize;
      const rowOffset = y * width;

      for (let x = 0; x < width; x++) {
        const xInYolo = x + padX;
        const protoX = Math.floor((xInYolo * protoSize) / yoloSize);
        const safeProtoX = Math.min(protoSize - 1, Math.max(0, protoX));
        const maskVal = maskBuffer[protoRowOffset + safeProtoX];
        const p = (rowOffset + x) * 4;

        if (maskVal === 255) {
          outPixels[p] = srcPixels[p];
          outPixels[p + 1] = srcPixels[p + 1];
          outPixels[p + 2] = srcPixels[p + 2];
          outPixels[p + 3] = 255;
        } else {
          outPixels[p] = 0;
          outPixels[p + 1] = 0;
          outPixels[p + 2] = 0;
          outPixels[p + 3] = 255;
        }
      }
    }

    ctx.putImageData(outImgData, 0, 0);
  }

  /**
   * @param {HTMLCanvasElement} isolatedCanvas
   * @param {any} yoloResult
   */
  async #executeEfficientNetClassification(isolatedCanvas, yoloResult) {
    if (!this.#classifierSession) {
      throw new Error("EfficientNet-B0 oturumu aktif değil.");
    }

    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = MODEL_CONSTANTS.classifierSize;
    tempCanvas.height = MODEL_CONSTANTS.classifierSize;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) throw new Error("Classifier tuval başlatılamadı.");

    tempCtx.drawImage(
      isolatedCanvas,
      0,
      0,
      tempCanvas.width,
      tempCanvas.height,
    );

    const inputTensor = this.#preprocessToTensor(
      tempCtx,
      tempCanvas.width,
      tempCanvas.height,
      true,
    );

    const inputName = this.#classifierSession.inputNames[0];
    const feeds = { [inputName]: inputTensor };

    /** @type {ort.InferenceSession.OnnxValueMapType | null} */
    let outputMap = null;
    try {
      outputMap = await this.#classifierSession.run(feeds);
      const outNames = Object.keys(outputMap);
      const logits = /** @type {Float32Array} */ (outputMap[outNames[0]].data);

      const l0 = logits[0] ?? 0;
      const l1 = logits[1] ?? 0;
      const l2 = logits[2] ?? 0;

      const maxL = Math.max(l0, l1, l2);
      const exp0 = Math.exp(l0 - maxL);
      const exp1 = Math.exp(l1 - maxL);
      const exp2 = Math.exp(l2 - maxL);
      const sumExp = exp0 + exp1 + exp2;

      let pHealthy = (exp0 / sumExp) * 100;
      let pMite = (exp1 / sumExp) * 100;
      let pPeacock = (exp2 / sumExp) * 100;

      if (
        yoloResult?.hasLesion &&
        (yoloResult.severityRatio >= 0.5 || yoloResult.lesionConfidence >= 35.0)
      ) {
        const yoloLesionConf = yoloResult.lesionConfidence;
        pPeacock = Math.max(pPeacock, yoloLesionConf);
        const remaining = Math.max(0.1, 100.0 - pPeacock);
        const subSum = exp0 + exp1 || 1.0;
        pHealthy = (exp0 / subSum) * remaining;
        pMite = (exp1 / subSum) * remaining;
      }

      const totalP = pHealthy + pMite + pPeacock || 1.0;
      pHealthy = Number(((pHealthy / totalP) * 100).toFixed(1));
      pMite = Number(((pMite / totalP) * 100).toFixed(1));
      pPeacock = Number(((pPeacock / totalP) * 100).toFixed(1));

      /** @type {"healthy" | "peacock" | "mite"} */
      let winningType = "healthy";
      /** @type {string} */
      let winningTitle = AI_CLASSES?.HEALTHY || "Sağlıklı Gemlik Yaprağı";
      let winningConf = pHealthy;
      let prescription =
        "Bakanlık Tavsiyesi: Yaprak dokusu ve morfolojisi temiz. Standart kültürel bakım takvimine devam ediniz.";

      if (pPeacock >= pMite && pPeacock >= pHealthy) {
        winningType = "peacock";
        winningTitle =
          AI_CLASSES?.PEACOCK || "Halkalı Leke (Spilocaea oleagina)";
        winningConf = pPeacock;
        prescription =
          "Bakanlık Reçetesi: %1-1.5'lik Bordo Bulamacı veya Bakır Oksiklorür uygulayınız. Ağacın iç kısımlarını bolca yıkayınız.";
      } else if (pMite >= pPeacock && pMite >= pHealthy) {
        winningType = "mite";
        winningTitle = AI_CLASSES?.MITE || "Zeytin Pas Akarı (Aceria oleae)";
        winningConf = pMite;
        prescription =
          "Bakanlık Reçetesi: Zeytin Pas Akarı kolonizasyonu tespit edildi. Islanabilir Kükürt (WP) veya Abamectin uygulayınız.";
      }

      return {
        disease: winningTitle,
        type: winningType,
        confidence: winningConf,
        severity: yoloResult?.severityRatio ?? 0,
        prescription,
        probabilities: {
          peacock: pPeacock,
          mite: pMite,
          healthy: pHealthy,
        },
      };
    } finally {
      inputTensor.dispose?.();
      if (outputMap) {
        for (const k of Object.keys(outputMap)) {
          outputMap[k].dispose?.();
        }
      }
    }
  }

  #refreshStatusIndicators() {
    if (this.status.isYoloReady && this.status.isClassifierReady) {
      this.status.badgeText = "Çift Model Hazır (ONNX Wasm)";
      this.status.badgeClass = "bg-emerald-100 text-emerald-700";
    } else {
      this.status.badgeText = "Modeller Eksik (Yükleme Bekleniyor)";
      this.status.badgeClass = "bg-amber-100 text-amber-800";
    }
  }

  /**
   * @param {number} ms
   */
  #sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const ModelPipeline = new ModelPipelineOrchestrator();
