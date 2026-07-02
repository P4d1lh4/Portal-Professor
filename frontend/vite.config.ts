import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Isola os vendors estáveis num chunk próprio: melhora o cache de longo
        // prazo (o vercel.json serve /assets como immutable) e reduz o chunk
        // principal para abaixo do limite de aviso do Rollup (500 kB).
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
    warmup: {
      clientFiles: [
        "./src/main.tsx",
        "./src/App.tsx",
        "./src/routes/index.tsx",
        "./src/features/auth/LoginPage.tsx",
        "./src/features/dashboard/DashboardPage.tsx",
      ],
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react-router-dom",
      "@tanstack/react-query",
      "recharts",
      "lucide-react",
      "zod",
      "react-hook-form",
      "@hookform/resolvers/zod",
      "sonner",
      "next-themes",
      "axios",
      "cmdk",
      "clsx",
      "tailwind-merge",
      "class-variance-authority",
      "date-fns",
      "react-dropzone",
      "zustand",
      "@supabase/supabase-js",
      "@radix-ui/react-avatar",
      "@radix-ui/react-dialog",
      "@radix-ui/react-dropdown-menu",
      "@radix-ui/react-label",
      "@radix-ui/react-select",
      "@radix-ui/react-separator",
      "@radix-ui/react-slot",
      "@radix-ui/react-toast",
      "@radix-ui/react-tooltip",
    ],
  },
});
