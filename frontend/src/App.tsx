import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "sonner";

import { router } from "@/routes";
import { queryClient } from "@/lib/queryClient";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";

export default function App() {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <RouterProvider router={router} />
        </ErrorBoundary>
        <Toaster
          position="top-right"
          richColors
          toastOptions={{
            classNames: {
              toast: "font-sans text-sm",
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
