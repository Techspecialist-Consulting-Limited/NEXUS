import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import "./globals.css";

/*
 * GUIDE §4: Inter for display and body, JetBrains Mono for every metric.
 * next/font self-hosts and emits the preload links itself, so the manual
 * <link rel="preload"> the guide mentions in §16 would be a duplicate.
 */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  /*
   * The icons themselves are file-convention, not declared here:
   * app/favicon.ico and app/apple-icon.png are picked up by Next and the link
   * tags are emitted for them. Only the manifest needs naming, because it
   * lives in public/ so its own icon paths resolve from the root.
   */
  manifest: "/site.webmanifest",
  title: "NEXUS",
  description:
    "Tell it what happened. It does the rest. NEXUS turns a thirty-second weekly update into reconciled commitments, coaching, and the Chairman's Monday brief.",
};

export const viewport: Viewport = {
  themeColor: "#08080c",
  width: "device-width",
  initialScale: 1,
  // The interface is dark and full-bleed; let it paint under the status bar.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="bg-mesh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
