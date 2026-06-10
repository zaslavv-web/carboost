import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Базовый путь сборки. По-умолчанию — корень.
  // Для песочницы выставляется VITE_BASE_PATH=/sandstorm/ (см. docker-compose.sandstorm.yml).
  base: process.env.VITE_BASE_PATH ?? "/",
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "sonner-original": path.resolve(__dirname, "./node_modules/sonner"),
      "sonner": path.resolve(__dirname, "./src/components/ui/sonner.tsx"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
