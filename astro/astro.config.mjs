// Astro configuration — https://astro.build/config
import { defineConfig } from "astro/config";
import svelte from "@astrojs/svelte";

export default defineConfig({
  site: "https://carrom-thane.web.app",
  integrations: [svelte()],
  // Client-side Firestore reads dominate — we prerender static shell only.
  output: "static",
  build: {
    format: "directory",
  },
});
