import { defineConfig } from "vite";

export default defineConfig({
  // ✅ ФІКС ДЛЯ GITHUB PAGES: Вказуємо відносний шлях до репозиторію
  base: "/PixelForge-Mass/",

  publicDir: "public",

  server: {
    port: 3000,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },

  worker: {
    format: "es",
  },

  assetsInclude: ["**/*.wasm"],

  optimizeDeps: {
    include: ["fflate", "pica", "streamsaver", "@jsquash/avif"],
  },
});
