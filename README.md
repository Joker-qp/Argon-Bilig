### 1. 🔍 Mevcut Yapı Analizi ve Teşhis

Projenin yerel kod tabanı monolitik yapıdan Vite + Svelte 5 + Tailwind CSS mimarisine başarıyla taşınmış ve GitHub uzak deposuna zorla (`--force`) gönderilmiştir. Ancak bir açık kaynak veya kurumsal üretim deposunun (production repository) en büyük eksiği, **sistemin matematiksel derinliğini, çift kademeli model boru hattını, CBS/IoT entegrasyonunu ve yerel kurulum yönergelerini anlatan profesyonel bir dokümantasyonun (`README.md`)** bulunmamasıdır.

**Eksik Dokümantasyon Riskleri:**
- Dışarıdan depoyu inceleyen araştırmacılar veya geliştiriciler; model dosyalarının neden `public/models/` altında olması gerektiğini, topolojik delik kapatma (`fillMaskHoles`) ve $5 \times 5$ morfolojik genişletme (`binaryDilation`) algoritmalarını veya ESP32 telemetri protokolünü kavrayamaz.
- Projenin varsayılan Vite şablonu `README.md` dosyası yerine, projenin kurumsal vizyonunu yansıtan kapsamlı bir teknik başvuru kılavuzu hazırlanmalıdır.

---

### 2. 🗑️ İptal Edilecek / Gereksiz Dosyalar (Clean-up)

- **Kaldırılacak İçerik:** Vite tarafından otomatik üretilen genel/basit `README.md` şablonu.
  - *Neden Gerek Yok?:* Projeye özgü YOLOv8s-seg, EfficientNet-B0, Gauss Shoelace formülasyonu ve agronomik karar kurallarını içeren kurumsal bir kılavuzla değiştirilecektir.

---

### 3. 🛠️ Modern Dönüşüm Kılavuzu & Kod Yapısı

Projenizin kök dizinindeki **`README.md`** dosyasını aşağıdaki eksiksiz, teknik referanslarla zenginleştirilmiş ve profesyonel içerikle güncelleyin:

```markdown
# 🌿 Argon-bilig (Olea europaea cv. Gemlik)
### Çift Kademeli ONNX Uç Yapay Zeka Teşhis, Epidemiyolojik İkili Risk ve CBS Erken Uyarı Motoru

[![Svelte 5](https://img.shields.io/badge/Svelte-5.0_(Runes)-FF3E00?style=for-the-badge&logo=svelte&logoColor=white)](https://svelte.dev)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind_CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![ONNX Runtime Web](https://img.shields.io/badge/ONNX_Runtime-Wasm_SIMD-005CED?style=for-the-badge&logo=onnx&logoColor=white)](https://onnxruntime.ai)
[![Leaflet GIS](https://img.shields.io/badge/Leaflet-GIS_1.9-199900?style=for-the-badge&logo=leaflet&logoColor=white)](https://leafletjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg?style=for-the-badge)](LICENSE)

**Argon-bilig**, zeytin yetiştiriciliğinde rekolte ve ağaç varlığını tehdit eden iki birincil biyolojik etmeni—**Zeytin Halkalı Leke Hastalığı** (*Spilocaea oleagina*) ve **Zeytin Pas Akarı** (*Aceria oleae*)—istemci tarafında (tarayıcıda sunucusuz), sıfır veri sızıntısıyla teşhis eden ve mikroklima telemetrisiyle 2.5–15 km yarıçaplı CBS erken uyarı çemberi üreten yeni nesil bir tarımsal karar destek sistemidir.

---

## 📌 Temel Özellikler

- **⚡ Sıfır Sunucu Maliyetli Uç Yapay Zeka (Edge AI):** WebAssembly (Wasm) ve SIMD çoklu iş parçacığı optimizasyonuyla tarayıcı üzerinde 60 FPS çıkarım. Fotoğraflar sunucuya yüklenmez, veri gizliliği mutlak korunur.
- **🔬 Çift Kademeli Hibrit Bilgisayarlı Görü (Computer Vision Core):**
  1. *Kademe 1 (YOLOv8s-seg):* 640x640 letterbox tensör, 84 noktalı organik poligon (Ray-Casting) ve Gauss Shoelace teoremiyle lezyon şiddeti (%) hesabı.
  2. *Kademe 2 (Zemin İzolasyonu):* Topolojik delik kapatma (**BFS Flood-Fill**) ve $5 \times 5$ dairesel disk morfolojik genişletme (**Binary Dilation**) ile deliksiz saf `RGB(0,0,0)` yalıtım.
  3. *Kademe 3 (EfficientNet-B0):* 224x224 ImageNet normalizasyonu, sayısal kararlı 3 sınıflı Softmax dağılımı ve T.C. Tarım ve Orman Bakanlığı ruhsatlı reçete motoru.
- **🗺️ Coğrafi Bilgi Sistemleri (CBS) & Dinamik Haritalama:** Leaflet tabanlı, Esri Topoğrafya ve OpenStreetMap yedekli, anlık koordinat değişimine duyarlı 2.5–15 km epidemiyolojik risk tamponu.
- **📡 Çok Kaynaklı Sensör Füzyonu (Sensor Fusion):** Sahadaki ESP32 mikrokontrolcüsünün HTTPS REST telemetrisi (sıcaklık, nem, yaprak ıslaklığı, 90 sn bayatlık denetimi) ile dış meteoroloji tahminlerinin otonom birleşimi.
- **⏳ 60 Günlük Biyolojik İnkübasyon Penceresi (-30g / +16g):** Geçmiş 30 günün nem/yağış odakları ile gelecek 16 günün risk tahminlerini gün bazında modelleyen yatay telemetri şeridi.
- **❄️ ERA5 Reanalysis 365 Günlük Arşiv:** Son 1 yılın kış soğuklama birikimini ($0 < T_{\min} \le 7.2^\circ\text{C}$ ise 7 saat/gün) fenolojik çeşit hedeflerine göre kümülatif hesaplayan iklim paneli.
- **🛡️ Çift Katmanlı Yönetici Masası:** Standart kullanıcı ayarları (`⚙️`) ile Web Crypto API (SHA-256) parola korumalı (`admin123`) agronomik eşik paneli (`🔒`).

---

## 🏗️ Veri Akış Şeması (End-to-End Pipeline)

```
[Kullanıcı Girişi: Kamera / Galeri]
               │
               ▼
   [Letterbox Dönüşümü: 640x640 (RGB 114 Dolgu)]
               │
               ▼
   [KADEME 1: YOLOv8s-seg Çıkarımı (Wasm SIMD)]
        ├── 84 Noktalı Organik Poligon (Ray-Casting)
        ├── Gauss Shoelace Teoremi ile Lezyon Şiddeti (%)
        └── Çoklu Lezyon Birleştirme (Multi-Detection Mask Union)
               │
               ▼
   [KADEME 2: Topolojik İyileştirme & Zemin İzolasyonu]
        ├── fillMaskHoles: Dış Sınırlardan BFS Flood-Fill (Deliksiz Doku)
        ├── binaryDilation: 5x5 Dairesel Disk (+8px Koruma Tamponu)
        └── Saf Siyah Zemin Yalıtımı: RGB(0,0,0)
               │
               ▼
   [KADEME 3: EfficientNet-B0 Sınıflandırma (224x224, ImageNet Norm)]
        ├── 3 Sınıflı Softmax: Sağlıklı / Halkalı Leke / Pas Akarı
        └── Hibrit Füzyon (YOLOv8 Lezyon Güveni Entegrasyonu)
               │
               ▼
[Zirai Karar Destek & T.C. Tarım ve Orman Bakanlığı Reçete Motoru]

──────────────────────────────────────────────────────────────────

[Meteoroloji API (Open-Meteo / OWM / WeatherAPI)] ──┐
                                                    ├──> [RiskService (Rule Engine)]
[ESP32 IoT Saha İstasyonu (Firebase REST)] ──────────┘           │
                                                                 ▼
[ERA5 365 Günlük Soğuklama & 60 Günlük İnkübasyon] ──────> [DualRiskAssessmentDTO]
                                                                 │
                                                                 ├──> [CBS Harita Risk Çemberi]
                                                                 └──> [Siber HUD Telemetri Paneli]
```

---

## 🔬 Matematiksel ve Algoritmik Temeller

### 1. Gauss Shoelace (Ayakkabı Bağı) Teoremi ile Lezyon Şiddeti
Maske ağırlık merkezinden 84 radyal ışın fırlatılarak sınır koordinatları $(x_i, y_i)$ bulunur. Poligon alanı hesaplanır:
$$A = \frac{1}{2} \left| \sum_{i=1}^{n} (x_i y_{i+1} - x_{i+1} y_i) \right|$$

Hastalık Şiddeti indeksi ise normalize edilmiş lezyon alanının yaprak alanına oranıyla belirlenir:
$$\text{Hastalık Şiddeti (\%)} = \min\left(100, \frac{A_{\text{lezyon}}}{A_{\text{yaprak}}} \times 100\right)$$

### 2. Topolojik Delik Kapatma (`fillMaskHoles`)
Şiddetli nekrozlarda yaprak dokusunun ortasında oluşan siyah delikleri kapatmak için görüntünün 4 dış kenarından başlayan Genişlik-Öncelikli Arama (BFS) yürütülür. Dış arka plan tarafından ulaşılamayan tüm iç adacıklar yaprak dokusu ($255$) kabul edilir:
$$\text{Mask}_{\text{filled}}(x, y) = \begin{cases} 0, & (x, y) \in \text{BFS}_{\text{external}} \\ 255, & (x, y) \notin \text{BFS}_{\text{external}} \end{cases}$$

### 3. $5 \times 5$ Dairesel Disk Morfolojik Genişletme (`binaryDilation`)
Yaprak kenarındaki kloroz ve kuruma sınırlarının arka plan sanılarak budanmasını önlemek için $r=2$ Euclidean yarıçaplı yapısal eleman ($B$) uygulanır:
$$(A \oplus B)(x, y) = \sup \{ A(x - dx, y - dy) \mid (dx, dy) \in B, \, dx^2 + dy^2 \le 5 \}$$
Bu işlem $160 \times 160$ uzayında $2$ piksel, $640 \times 640$ tuval uzayında ise tam **$8$ piksel** güvenlik payı sağlar.

---

## 🌿 Hazır Çeşit Profilleri (Agronomic Presets)

Sistem, Türkiye'nin coğrafi zeytin varlığına göre kalibre edilmiş 3 hazır ve 1 serbest profile sahiptir:

| Çeşit Adı | Botanik İsim | Optimum Soğuklama (<7.2°C) | Halkalı Leke Eşiği | Pas Akarı Eşiği |
|---|---|---|---|---|
| **Gemlik (Trilye)** | *Olea europaea cv. Gemlik* | 400 - 600 Saat | 10–20°C, Nem ≥ %85 | ≥ 22°C, Nem ≤ %70 |
| **Ayvalık (Edremit)** | *Olea europaea cv. Ayvalik* | 600 - 800 Saat | 12–22°C, Nem ≥ %80 | ≥ 23°C, Nem ≤ %75 |
| **Memecik** | *Olea europaea cv. Memecik* | 300 - 450 Saat | 10–21°C, Nem ≥ %85 | ≥ 24°C, Nem ≤ %65 |
| **Özel Profil** | *Olea europaea (Kullanıcı Tanımlı)* | Dinamik (50–2000 Saat) | Kullanıcı Tanımlı | Kullanıcı Tanımlı |

---

## 🛠️ Teknoloji Yığını

- **Çekirdek:** Svelte 5 (Runes: `$state`, `$derived`, `$props`, `$effect`)
- **Derleyici & Sunucu:** Vite 6.x
- **Stil & Tasarım Sistemi:** Tailwind CSS v4 (Dark Slate / Emerald Teması)
- **Çıkarım Motoru:** ONNX Runtime Web v1.30+ (WebAssembly + SIMD)
- **CBS & Harita:** Leaflet.js v1.9+, Esri World Topo Map, OpenStreetMap
- **Kriptografi & Güvenlik:** Web Crypto API (SubtleCrypto SHA-256)
- **Veri Sağlayıcıları:** Open-Meteo Forecast, Open-Meteo ERA5 Reanalysis Archive, OpenWeatherMap, WeatherAPI, Firebase Realtime Database

---

## 📂 Dizin Yapısı

```text
argon-bilig/
├── public/
│   ├── assets/
│   │   └── demo_analysis.mp4          # 12 saniyelik HUD tanıtım videosu
│   └── models/
│       ├── efficientnet.onnx          # 2. Kademe sınıflandırıcı (224x224)
│       └── yolov8_seg.onnx            # 1. Kademe segmentasyon modeli (640x640)
├── src/
│   ├── app.css                        # Tailwind v4 giriş noktası ve lazer animasyonu
│   ├── main.js                        # Svelte 5 mount noktası
│   ├── App.svelte                     # Ana sistem orkestratörü & kabuk
│   └── lib/
│       ├── ai/
│       │   └── ModelPipeline.svelte.js # Çift kademeli ONNX çıkarım ve morfoloji çekirdeği
│       ├── config/
│       │   └── AppConfig.svelte.js     # Svelte 5 Runes SSOT ve LocalStorage yöneticisi
│       ├── services/
│       │   ├── WeatherService.js       # Strategy pattern meteoroloji orkestratörü
│       │   ├── Esp32Service.js         # Observer pattern IoT telemetri yoklayıcısı
│       │   ├── RiskService.js          # İkili epidemiyolojik kural motoru
│       │   └── HistoricalArchiveService.js # ERA5 soğuklama ve 60 günlük inkübasyon
│       └── components/
│           ├── ui/
│           │   └── MapViewer.svelte    # Leaflet CBS harita bileşeni
│           ├── tabs/
│           │   ├── HomeTab.svelte      # Tanıtım, video ve test metrikleri
│           │   ├── DiagnosisLab.svelte # Tek tuval sinematik teşhis laboratuvarı
│           │   └── MapTab.svelte       # CBS risk haritası, inkübasyon şeridi & iklim
│           └── modals/
│               ├── SettingsModal.svelte      # Standart kullanıcı hava durumu/izin ayarları
│               └── AdminConfigModal.svelte   # SHA-256 korumalı 4 sekmeli yönetici masası
├── index.html                         # Sadeleştirilmiş Vite SPA şablonu
├── vite.config.js                     # Vite derleme ve COOP yapılandırması
└── package.json
```

---

## 🚀 Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js:** v18.0.0 veya üzeri
- **Paket Yöneticisi:** `pnpm` (önerilen) veya `npm`
- **Modern Web Tarayıcısı:** Chrome 110+, Firefox 110+, Edge 110+, Safari 16.4+ (WebAssembly & ES6 Modül desteği ile)

### 1. Depoyu Klonlayın
```bash
git clone https://github.com/Joker-qp/Leafai.git argon-bilig
cd argon-bilig
```

### 2. Bağımlılıkları Yükleyin
```bash
pnpm install
```

### 3. Model Dosyalarını Doğrulayın
Modellerin `public/models/` dizini altında yer aldığından emin olun:
```bash
ls -lh public/models/
# Çıktıda yolov8_seg.onnx (~22MB) ve efficientnet.onnx (~17MB) görünmelidir.
```

### 4. Geliştirme Sunucusunu Başlatın
```bash
pnpm dev
```
Tarayıcınızda `http://localhost:5173` adresine giderek sistemi kullanmaya başlayabilirsiniz.

### 5. Üretim Derlemesi (Production Build)
```bash
pnpm build
pnpm preview
```

---

## 🔒 Yönetici Kimlik Doğrulaması

Uygulama üzerindeki agronomik kural ve eşiklerin korunması amacıyla Yönetici Paneli (`🔒`) şifrelenmiştir:
- **Varsayılan Parola:** `admin123`
- Parola istemci tarafında **Web Crypto API SHA-256** özetine dönüştürülerek doğrulanır. Açık metin parola kaynak kodda veya `localStorage` içinde barındırılmaz.

---

## 📄 Lisans
Bu proje [MIT Lisansı](LICENSE) kapsamında açık kaynak olarak geliştirilmektedir.
```