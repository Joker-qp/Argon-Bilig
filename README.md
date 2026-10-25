# 🫒 Argon-Bilig: Gemlik Zeytini Yapay Zekâ Teşhis ve Karar Portalı

[![Streamlit App](https://static.streamlit.io/badges/streamlit_badge_black_white.svg)](https://argon-bilig-app.streamlit.app)
[![Hugging Face Models](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Models-blue)](https://huggingface.co/JoQert/argon-bilig-olive-models)
[![Hugging Face Datasets](https://img.shields.io/badge/%F0%9F%A4%97%20Hugging%20Face-Dataset-orange)](https://huggingface.co/datasets/JoQert/argon-bilig-olive-dataset)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)
[![Hardware Support](https://img.shields.io/badge/Runtime-NVIDIA%20CUDA%20%7C%20CPU%20Fallback-005CED)](https://onnxruntime.ai/)

> **TÜBİTAK 2204-A Lise Öğrencileri Araştırma Projeleri Yarışması** ve **TEKNOFEST Tarımsal Teknolojiler** kapsamında geliştirilmiş; çift kademeli bilgisayarlı görü (YOLOv8-seg + EfficientNet-B0), IoT saha telemetrisi, Open-Meteo/ERA5 iklim analizi ve dinamik CBS risk haritalamasını birleştiren uçtan uca hibrit yapay zekâ karar destek ekosistemi.

---

## 🌐 Canlı Bağlantılar ve Model Depoları
* 🚀 **Canlı Web Portalı:** [argon-bilig-app.streamlit.app](https://argon-bilig-app.streamlit.app)
* 🧠 **Hugging Face ONNX Model Deposu:** [JoQert/argon-bilig-olive-models](https://huggingface.co/JoQert/argon-bilig-olive-models)
* 📦 **Hugging Face Referans Veri Seti:** [JoQert/argon-bilig-olive-dataset](https://huggingface.co/datasets/JoQert/argon-bilig-olive-dataset)

---

## 👥 Proje Geliştiricileri ve Künye
* **Muhammed Emin DUYAR**
* **Ahmet Buğra GİRGİN**
* **Yıl:** 2026
* **Çeşit Odağı:** Gemlik (*Olea europaea* cv. 'Gemlik' / Trilye)

---

## 📌 Projenin Amacı ve Özgün Değeri
Gemlik zeytini üretiminde en yıkıcı rekolte kaybına yol açan iki temel biyolojik tehdit **Halkalı Leke (*Venturia oleaginea / Spilocaea oleaginea*)** mantarı ve **Zeytin Pas Akarı (*Aculus olearius / Acerculus olearius*)** zararlısıdır.

Geleneksel tarımsal sınıflandırma modelleri, sahada çekilen fotoğraflardaki arka plan gürültülerini (toprak, el, ahşap kasa, arka plan yaprakları) hedef doku zannederek hatalı çıkarımlar yapmaktadır. **Argon-Bilig**, bu sorunu iki aşamalı hibrit mimarisi ve çevre parametreleriyle çözer:
1. **YOLOv8s-seg** ile yaprak yüzeyini piksel seviyesinde segmente eder, topolojik delik kapatma (Flood-Fill) ve 5x5 morfolojik genişletmeyle lezyon sınırlarını korur.
2. Arka planı saf siyah `RGB(0,0,0)` maske ile yalıtır.
3. Morfolojik deformasyonları **EfficientNet-B0** ile sınıflandırarak fenolojik döneme ve sahadaki iklim riskine uygun **T.C. Tarım ve Orman Bakanlığı Zirai Mücadele Reçetesi** üretir.
4. Tarladaki **ESP32 IoT istasyonu** ve **Open-Meteo / ERA5 uydu verilerini** kaynaştırarak dinamik karantina ve risk çemberleri oluşturur.

---

## 🧠 Bütünleşik Sistem Mimarisi ve Akış Şeması

```
              [Ham Yaprak Fotoğrafı (Kamera / Dosya)]
                                │
                                ▼
                   [Kademe 1: YOLOv8s-seg ONNX]
                 (Organik Segmentasyon & Lazer Tarama)
                                │
         ┌──────────────────────┴──────────────────────┐
         ▼                                             ▼
 [Leke Alanı > %0.5 veya Güven >= %35]        [Belirgin Leke Yok]
         │                                             │
         ▼                                             ▼
[Halkalı Leke Teşhisi]                      [Zemin İzolasyonu RGB(0,0,0)]
  + Lezyon Şiddeti (%)                                 │
  + Bordo Bulamacı Reçetesi                            ▼
                                         [Kademe 2: EfficientNet-B0 ONNX]
                                         (Morfolojik Akar & Sağlık Analizi)
                                                       │
                                       ┌───────────────┴───────────────┐
                                       ▼                               ▼
                               [Zeytin Pas Akarı]              [Sağlıklı Yaprak]
                               + Kükürtlü / Akarisit           + Kültürel Bakım
                               │                               │
                               └───────────────┬───────────────┘
                                               │
                                               ▼
                              [Epidemiyolojik Sensör Füzyonu]
                        (ESP32 İstasyonu + Open-Meteo Canlı İklim)
                                               │
                                               ▼
                            [CBS Dinamik Risk Haritası & Buffer]
                       (Esri Topo + ERA5 365 Gün Soğuklama / İnkübasyon)
```

---

## 🎯 Hedef Sınıflar, Patojenler ve Zirai Reçeteler

| Sınıf Etiketi | Bilimsel Adı | Türkçe Karşılığı | Optimum Koşul / Tetikleyici | T.C. Tarım ve Orman Bakanlığı Reçetesi |
| :--- | :--- | :--- | :--- | :--- |
| `olive_peacock_spot` | *Venturia oleaginea* (*Spilocaea oleagina*) | Zeytin Halkalı Leke Hastalığı | 10°C–20°C Sıcaklık, $\ge \%85$ Nem, 48s $\ge 2\text{ mm}$ Yağış | %1.0 - %1.5 Bordo Bulamacı / Bakır Oksiklorür |
| `acerculus_olearius` | *Aculus olearius* (*Aceria oleae*) | Zeytin Pas Akarı | $\ge 22^\circ\text{C}$ Sıcaklık, $\le \%70$ Kuru Hava, Yağışsızlık | Islanabilir Kükürt (WP 800g/100L) / Ruhsatlı Abamectin |
| `Healthy` | *Olea europaea* cv. Gemlik | Sağlıklı Gemlik Yaprağı | Standart klimatik denge | Rutin kültürel bakım, budama ile havalandırma |

---

## ⚡ Teknik Üstünlükler ve Donanım Esnekliği
* **Ultra Hafiflik:** Toplam çift kademeli hibrit model ağırlığı **~39 MB**'tır.
* **Düşük Gecikme:** Standart CPU üzerinde çıkarım süresi **<40 ms**; harici CUDA GPU devredeyken **<15 ms**'dir.
* **Hibrit Donanım Fallback:** Sistem önce `CUDAExecutionProvider` dener; NVIDIA ekran kartı veya CUDA kütüphanesi yoksa kesintisiz ve hatasız biçimde `CPUExecutionProvider` moduna geçer.
* **Otomatik Model Hub:** Modeller yerel diskte yoksa [Hugging Face](https://huggingface.co/JoQert/argon-bilig-olive-models) deposundan ilk açılışta progress bar ile otomatik iner.
* **Çevrimdışı (Edge AI) Uyumu:** Tarlada internet kesilse bile yerel modeller ve çevrimdışı fallback mimarisiyle çalışmaya devam eder.

---

## 🗺️ Coğrafi Bilgi Sistemi (CBS), İklim & Fenoloji Katmanı
* **Esri Topoğrafik Risk Haritası:** Gemlik zeytin havzasının coğrafi yapısını gösterir; haritada tıklanan herhangi bir bahçe için anlık koordinat tespiti yapar.
* **Dinamik Risk Tamponu (Buffer):** Tespit edilen lezyon şiddeti ve iklim verilerine göre tarlanın risk yarıçapını ($2.5\text{ km} - 7.5\text{ km}$) dinamik genişletir ve renk kodlar (Kritik: Kırmızı / Yüksek: Turuncu / Orta: Sarı / Düşük: Yeşil).
* **ERA5 365 Günlük Arşiv:** Avrupa Uzay Ajansı (ESA) ve ECMWF reanaliz uydularından Gemlik çeşidi için kritik kış soğuklama saati birikimini ($0^\circ\text{C} < T_{\min} \le 7.2^\circ\text{C} \times 7\text{ saat}$) hesaplar (Hedef: 500 saat).
* **60 Günlük Biyolojik İnkübasyon Penceresi:** Geçmiş 30 günün yağış/risk odakları ile gelecek 16 günün spor çimlenme riskini günlük zaman çizelgesiyle sunar.

---

## 💻 Yerel Kurulum ve Çalıştırma

### 🐧 Linux / CachyOS (Arch Tabanlı)
```bash
# 1. Depoyu klonlayın
git clone https://github.com/Joker-qp/argon-bilig-app.git
cd argon-bilig-app

# 2. Sanal ortamı açın ve bağımlılıkları kurun (uv ile 10 saniyede kurulum):
uv venv --python 3.11 venv
source venv/bin/activate
uv pip install -r requirements.txt

# 3. Tek tıkla başlatın:
chmod +x run.sh
./run.sh
```

### 🪟 Windows
1. Proje klasöründe terminali açıp bağımlılıkları kurun:
   ```cmd
   python -m venv venv
   .\venv\Scripts\activate
   pip install -r requirements.txt
   ```
2. Sistemi başlatmak için kök dizindeki **`run.bat`** dosyasına çift tıklayın!

---

## 🧪 Test & Simülasyon Laboratuvarı ve Reçete Yönetimi
* **AI Model Benchmark:** Modellerin FPS ve ms gecikme değerlerini ölçen hız testi aracı.
* **What-If Simülatörü:** Yapay sıcaklık, nem ve yağış kaydırıcılarıyla ekstrem iklim senaryolarını test etme imkânı.
* **ESP32 Telemetri Enjektörü:** Fiziksel istasyon yokken yapay sensör verisi gönderme.
* **Dinamik Bilgi Bankası:** `settings.yaml` üzerinden Bakanlık tavsiyeleri ve biyolojik eşik değerlerini arayüzden koda dokunmadan düzenleme.

---

## 📜 Lisans ve Akademik Atıf (Citation)

Bu proje ve türetilmiş veri seti **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0)** lisansı altındadır.

Çalışmalarınızda bu projeyi referans göstermek için aşağıdaki BibTeX kaydını kullanabilirsiniz:

```bibtex
@misc{argonbilig2026,
  title={Argon-Bilig: Gemlik Zeytini Hastalık ve Zararlıları İçin Hibrit Yapay Zekâ Teşhis ve Erken Uyarı Portalı},
  author={Duyar, Muhammed Emin and Girgin, Ahmet Bu{\u{g}}ra},
  year={2026},
  howpublished={GitHub: \url{https://github.com/Joker-qp/argon-bilig-app}},
  note={TÜBİTAK 2204-A & TEKNOFEST Kapsamında Geliştirilmiş Çift Kademeli ONNX Çıkarım Motoru}
}
```

---

## 🙏 Veri Kaynakları ve Teşekkür (Acknowledgements)
Öncül ham görüntülerin sağlanmasındaki değerli katkıları için teşekkür ederiz:
* **Olive Peacock Eye Dataset:** Diker, A., Elen, A., Közkurt, C. et al. (2024). *Eur Food Res Technol*, 250, 287–299. [DOI: 10.1007/s00217-023-04386-8](https://doi.org/10.1007/s00217-023-04386-8)
* **Olive Leaf Disease Unified Dataset:** Abeer Saleh (CC0: Public Domain)
* **Olive Leaf Image Dataset:** Habibul Basher (CC0: Public Domain)