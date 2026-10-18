<script>
  import { onMount, onDestroy } from "svelte";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { AppConfig, MAP_CONFIG } from "../../config/AppConfig.svelte.js";

  /**
   * @typedef {Object} LocationPoint
   * @property {number} lat
   * @property {number} lon
   * @property {string} [name]
   */

  /**
   * @typedef {Object} Props
   * @property {LocationPoint} [location]
   * @property {any} [riskData]
   * @property {any} [telemetry]
   * @property {(lat: number, lon: number, name: string) => void} [onLocationChange]
   */

  /** @type {Props} */
  let {
    location = $bindable({
      lat: 40.4286,
      lon: 29.1556,
      name: "Gemlik (Merkez)",
    }),
    riskData = null,
    telemetry = null,
    onLocationChange,
  } = $props();

  /** @type {HTMLDivElement} */
  let mapContainer;
  /** @type {L.Map | null} */
  let map = null;
  /** @type {L.Marker | null} */
  let marker = null;
  /** @type {L.Circle | null} */
  let riskCircle = null;
  /** @type {AbortController | null} */
  let geocodeAbortController = null;
  /** @type {ResizeObserver | null} */
  let resizeObserver = null;

  /**
   * Özel Gemlik Zeytini Harita Pini (SVG + Tailwind)
   */
  function createGardenIcon() {
    return L.divIcon({
      className: "custom-garden-pin",
      html: `
        <div class="w-9 h-9 bg-emerald-700 text-white rounded-t-full rounded-br-full -rotate-45 flex items-center justify-center shadow-lg border-2 border-white cursor-grab hover:scale-110 transition-transform">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 rotate-45 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 2C6.48 2 2 6.48 2 12c0 3.5 1.8 6.58 4.54 8.35C8.38 21.5 10.12 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z" />
          </svg>
        </div>
      `,
      iconSize: [36, 36],
      iconAnchor: [18, 36],
      popupAnchor: [0, -34],
    });
  }

  /**
   * Risk seviyesine göre kenarlık ve dolgu renkleri
   * @param {string} [level]
   */
  function getRiskColorScheme(level = "low") {
    switch (level) {
      case "critical":
        return { stroke: "#dc2626", fill: "#ef4444" };
      case "high":
        return { stroke: "#ea580c", fill: "#f97316" };
      case "moderate":
        return { stroke: "#d97706", fill: "#f59e0b" };
      case "low":
      default:
        return { stroke: "#059669", fill: "#10b981" };
    }
  }

  /**
   * Nominatim Tersine Coğrafi Kodlama (CORS & 429 Korumalı)
   * @param {number} lat
   * @param {number} lon
   * @returns {Promise<string>}
   */
  async function resolveLocationName(lat, lon) {
    if (geocodeAbortController) geocodeAbortController.abort();
    geocodeAbortController = new AbortController();

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`;
      const response = await fetch(url, {
        signal: geocodeAbortController.signal,
        headers: { "Accept-Language": "tr" },
      });

      if (!response.ok) {
        return `Bahçe Konumu (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;
      }

      const data = await response.json();
      const addr = data?.address || {};
      const city = addr.province || addr.state || addr.city || "";
      const district =
        addr.town || addr.county || addr.suburb || addr.city_district || "";

      if (district && city) return `${district}, ${city}`;
      if (city) return city;
      return `${lat.toFixed(2)}°N, ${lon.toFixed(2)}°E`;
    } catch (_err) {
      return `Bahçe Konumu (${lat.toFixed(2)}°, ${lon.toFixed(2)}°)`;
    } finally {
      geocodeAbortController = null;
    }
  }

  function updatePopup() {
    if (!marker) return;

    const locName = location.name || "Zeytin Bahçesi";
    const cultivarName =
      AppConfig.getActiveCultivar?.()?.name || "Gemlik (Trilye)";
    const overall = riskData?.overall || riskData || {};
    const riskTitle = overall.title || "Risk Analiz Ediliyor";
    const riskScore = Number.isFinite(overall.score)
      ? `%${Math.round(overall.score)}`
      : "%--";
    const badgeClass =
      overall.badgeClass ||
      "bg-slate-900 text-slate-400 border border-slate-800";

    const isEspOnline = Boolean(telemetry?.isOnline);
    const espTemp =
      isEspOnline && Number.isFinite(telemetry?.temperature)
        ? `${telemetry.temperature.toFixed(1)} °C`
        : "Bağlantı Yok";
    const espHum =
      isEspOnline && Number.isFinite(telemetry?.humidity)
        ? `${telemetry.humidity.toFixed(0)} %`
        : "Bağlantı Yok";

    const popupHtml = `
      <div class="font-sans text-xs min-w-[220px] p-1 space-y-2 text-slate-900">
        <div class="border-b border-slate-200 pb-1">
          <b class="text-sm text-slate-900 block">${locName}</b>
          <span class="text-[10px] text-slate-500">${cultivarName} Bahçesi</span>
        </div>
        <div class="flex items-center justify-between">
          <span class="text-slate-600">Baskın Tehdit:</span>
          <span class="px-2 py-0.5 rounded text-[11px] font-bold ${badgeClass}">${riskScore}</span>
        </div>
        <div class="bg-slate-50 border border-slate-200/80 rounded-lg p-2 text-[11px] space-y-1">
          <div class="flex justify-between"><span class="text-slate-500">ESP32 Sıcaklık:</span><b>${espTemp}</b></div>
          <div class="flex justify-between"><span class="text-slate-500">ESP32 Bağıl Nem:</span><b>${espHum}</b></div>
        </div>
        <p class="text-[10px] text-slate-600 leading-snug m-0">${riskTitle}</p>
      </div>
    `;

    marker.bindPopup(popupHtml);
  }

  /**
   * @param {number} newLat
   * @param {number} newLon
   */
  async function handlePositionChange(newLat, newLon) {
    const newName = await resolveLocationName(newLat, newLon);
    location = { lat: newLat, lon: newLon, name: newName };
    if (onLocationChange) onLocationChange(newLat, newLon, newName);
  }

  onMount(() => {
    if (!mapContainer) return;
    const esriConfig = MAP_CONFIG.esriTopo;
    const defaultZoom = MAP_CONFIG.defaultZoom || 12;

    const activeMap = L.map(mapContainer, {
      center: [location.lat, location.lon],
      zoom: defaultZoom,
      zoomControl: true,
      attributionControl: true,
    });
    map = activeMap;

    const primaryTileLayer = L.tileLayer(esriConfig.url, {
      maxZoom: esriConfig.maxZoom,
      attribution: esriConfig.attribution,
      // @ts-ignore
      crossOrigin: true,
    }).addTo(activeMap);

    primaryTileLayer.on("tileerror", () => {
      console.warn(
        "[MapViewer] Esri kiremiti yüklenemedi, OpenStreetMap yedeği devreye alınıyor...",
      );
      if (map) {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(activeMap);
      }
    });

    marker = L.marker([location.lat, location.lon], {
      icon: createGardenIcon(),
      draggable: true,
    }).addTo(activeMap);

    marker.on("dragend", async (/** @type {any} */ e) => {
      const pos = e.target.getLatLng();
      await handlePositionChange(
        Number(pos.lat.toFixed(4)),
        Number(pos.lng.toFixed(4)),
      );
    });

    activeMap.on("click", async (/** @type {any} */ e) => {
      const lat = Number(e.latlng.lat.toFixed(4));
      const lon = Number(e.latlng.lng.toFixed(4));
      activeMap.flyTo([lat, lon], activeMap.getZoom(), {
        animate: true,
        duration: 0.6,
      });
      await handlePositionChange(lat, lon);
    });

    resizeObserver = new ResizeObserver(() => activeMap.invalidateSize());
    resizeObserver.observe(mapContainer);

    setTimeout(() => {
      activeMap.invalidateSize();
    }, 150);

    updatePopup();
  });

  $effect(() => {
    if (!map || !marker) return;

    const currentPos = marker.getLatLng();
    if (currentPos.lat !== location.lat || currentPos.lng !== location.lon) {
      marker.setLatLng([location.lat, location.lon]);
      map.panTo([location.lat, location.lon], { animate: true });
    }

    const overall = riskData?.overall || riskData || {};
    const colorScheme = getRiskColorScheme(overall.level);
    // Yönetici panelinden gelen dinamik yarıçap (km -> metre)
    const radiusMeters = (AppConfig.map?.riskRadiusKm || 2.5) * 1000;

    if (riskCircle) {
      riskCircle.setLatLng([location.lat, location.lon]);
      riskCircle.setRadius(radiusMeters);
      riskCircle.setStyle({
        color: colorScheme.stroke,
        fillColor: colorScheme.fill,
      });
    } else {
      riskCircle = L.circle([location.lat, location.lon], {
        color: colorScheme.stroke,
        fillColor: colorScheme.fill,
        fillOpacity: 0.22,
        weight: 2,
        radius: radiusMeters,
      }).addTo(map);
    }

    updatePopup();
  });

  onDestroy(() => {
    if (resizeObserver) resizeObserver.disconnect();
    if (geocodeAbortController) geocodeAbortController.abort();
    if (map) {
      map.remove();
      map = null;
    }
  });
</script>

<div
  class="relative w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 shadow-2xl isolate z-0"
>
  <div bind:this={mapContainer} class="w-full h-full"></div>
  <div
    class="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur border border-slate-700/80 px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-2 text-xs text-slate-200 pointer-events-none"
  >
    <span class="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
    <span class="font-medium">{location.name || "Seçili Bahçe"}</span>
    <span class="text-slate-400 text-[11px]"
      >({location.lat.toFixed(3)}°, {location.lon.toFixed(3)}°)</span
    >
  </div>
</div>

<style>
  :global(.leaflet-pane) {
    z-index: 10 !important;
  }
  :global(.leaflet-top),
  :global(.leaflet-bottom) {
    z-index: 20 !important;
  }
</style>
