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
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  // The interface is dark and full-bleed; let it paint under the status bar.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /*
      NO MANUAL <head> HERE.

      An explicit <head> element in the root layout collides with the one the
      App Router streams for itself, and the stylesheet link goes with it: the
      whole product rendered as unstyled HTML under `<html id="__next_error__">`.
      Next's own example carries only <html> and <body> — see
      node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md.

      `suppressHydrationWarning` because the script below stamps an attribute on
      <html> before React hydrates, so the server's markup and the browser's
      first paint legitimately differ on this one element.
    */
    <html
      lang="en"
      className={`${inter.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-mesh">
        {/*
          THE THEME, BEFORE ANYTHING PAINTS.

          Inline and first in the body, so it runs while the parser is still
          working and nothing below it has been drawn. Anything asynchronous —
          an effect, a deferred script, a client component — runs after the
          first paint, so whoever chose white would watch the product paint
          black and then turn white on every single navigation.

          It touches one attribute and swallows its own errors: localStorage
          throws in a private window and in browsers set to block site data,
          and a theme that cannot be read is not a reason to fail to render.
          The fallback is the black theme, which is the default anyway.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('nexus-theme')==='white')" +
              "document.documentElement.setAttribute('data-theme','white')}catch(e){}",
          }}
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
