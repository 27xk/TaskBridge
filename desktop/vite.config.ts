import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  cacheDir: ".vite-cache",
  plugins: [vue()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
