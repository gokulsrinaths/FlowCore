import type { Metadata } from "next";
import Script from "next/script";
import type { CSSProperties } from "react";
import { Providers } from "@/app/providers";
import { TEXT_ZOOM_LEVELS, TEXT_ZOOM_STORAGE_KEY } from "@/lib/text-zoom";
import "./globals.css";

const textZoomInitScript = `
(function(){
  var L=${JSON.stringify([...TEXT_ZOOM_LEVELS])};
  try{
    var k=${JSON.stringify(TEXT_ZOOM_STORAGE_KEY)};
    var v=parseInt(localStorage.getItem(k),10);
    if(L.indexOf(v)!==-1){document.documentElement.style.fontSize=v+'%';}
  }catch(e){}
})();
`;

export const metadata: Metadata = {
  title: "FlowCore â€” Workflow OS",
  description: "Generic workflow management: items, stages, roles, and audit trail.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="h-full antialiased"
      style={
        {
          "--font-geist-sans": "ui-sans-serif, system-ui, sans-serif",
          "--font-geist-mono": "ui-monospace, SFMono-Regular, monospace",
        } as CSSProperties
      }
    >
      <body className="min-h-full flex flex-col">
        <Script id="flowcore-text-zoom-init" strategy="beforeInteractive">
          {textZoomInitScript}
        </Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
