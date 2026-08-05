import path from "node:path";
import basicSsl from "@vitejs/plugin-basic-ssl";
import { defineConfig } from "vite";
import solidPlugin from "vite-plugin-solid";

export default defineConfig({
  plugins: [solidPlugin(), basicSsl()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 58888,
    host: "0.0.0.0",
    allowedHosts: ["anime.local", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:58889",
        changeOrigin: true,
        secure: false,
      },
    },
  },
  build: {
    target: "esnext",
  },
});
