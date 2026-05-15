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
            "@tanstack/react-table",
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
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-separator",
            "@radix-ui/react-slot",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
        ],
    },
});
