import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  base: "/Argon-Bilig/", // <-- GitHub Pages alt dizini için bu satırı ekledik
  plugins: [tailwindcss(), svelte()],
  server: {
    // Harita kiremitlerinin (ArcGIS/OSM) engellenmesini önlemek için COOP başlığı korundu
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
