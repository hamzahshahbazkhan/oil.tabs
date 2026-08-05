import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json";
import { execSync } from "node:child_process";

function buildHash(): string {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  define: {
    __BUILD_HASH__: JSON.stringify(buildHash()),
  },
  plugins: [crx({ manifest })],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        buffer: "src/buffer/main.ts",
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "buffer") return "buffer.js";
          if (chunkInfo.name?.startsWith("background")) return "assets/[name].js";
          return "assets/[name]-[hash].js";
        },
      },
    },
  },
});
