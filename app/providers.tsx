"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";

/**
 * Client-side providers: theming for Sonner + global toast host.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}
