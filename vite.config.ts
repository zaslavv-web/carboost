import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// lovable-tagger подключаем только в dev и только если пакет установлен.
// На on-premise сборке этого пакета может не быть — это нормально.
async function loadComponentTagger() {
  try {
    const mod = await import("lovable-tagger");
    return mod.componentTagger();
  } catch {
    return null;
  }
}

// https://vitejs.dev/config/
export default defineConfig(async ({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" ? await loadComponentTagger() : null,
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "sonner-original": path.resolve(__dirname, "./node_modules/sonner"),
      "sonner": path.resolve(__dirname, "./src/components/ui/sonner.tsx"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
