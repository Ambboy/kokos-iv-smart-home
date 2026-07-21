import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/kokos-iv-smart-home/",
  build: {
    sourcemap: true,
    target: "es2022",
    chunkSizeWarningLimit: 650,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("node_modules/react")) return "react";
          if (id.includes("node_modules/@phosphor-icons")) return "icons";
          return undefined;
        },
      },
    },
  },
});
