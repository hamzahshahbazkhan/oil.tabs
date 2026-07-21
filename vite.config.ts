import { crx } from "@crxjs/vite-plugin";
import { defineConfig } from "vite";
import manifest from "./manifest.json";

export default defineConfig({
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
