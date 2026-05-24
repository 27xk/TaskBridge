import { resolve } from "node:path";

import vue from "@vitejs/plugin-vue";
import { defineConfig } from "electron-vite";

const FALLBACK_BASE_URL = "http://192.168.10.30:8000/api/v1";
const FALLBACK_WS_URL = "ws://192.168.10.30:8000/ws/sync";
const taskBridgeBaseUrl = readEndpointEnv("TASKBRIDGE_BASE_URL", FALLBACK_BASE_URL, ["http:", "https:"]);
const taskBridgeWsUrl = readEndpointEnv("TASKBRIDGE_WS_URL", FALLBACK_WS_URL, ["ws:", "wss:"]);

export default defineConfig({
  main: {
    define: {
      __TASKBRIDGE_BASE_URL__: JSON.stringify(taskBridgeBaseUrl),
      __TASKBRIDGE_WS_URL__: JSON.stringify(taskBridgeWsUrl),
    },
    build: {
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main.ts"),
        },
      },
    },
  },
  preload: {
    build: {
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload.ts"),
        },
        output: {
          format: "cjs",
          entryFileNames: "[name].cjs",
          chunkFileNames: "[name]-[hash].cjs",
        },
      },
    },
  },
  renderer: {
    root: __dirname,
    plugins: [vue()],
    build: {
      minify: "esbuild",
      sourcemap: false,
      rollupOptions: {
        input: {
          index: "index.html",
        },
      },
    },
  },
});

function readEndpointEnv(name: string, fallback: string, allowedProtocols: string[]): string {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (allowedProtocols.includes(url.protocol)) return value;
  } catch {
    // Fall through to a clear build-time error below.
  }
  throw new Error(`${name} must be a valid URL with protocol ${allowedProtocols.join(" or ")}`);
}
