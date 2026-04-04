"use client";

import { TextZoomToolbar } from "@/components/text-zoom-toolbar";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

/**
 * Client-side providers: theming for Sonner + global toast host + text zoom (a11y).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
      <Toaster richColors closeButton />
      <TextZoomToolbar />
    </ThemeProvider>
  );
}
