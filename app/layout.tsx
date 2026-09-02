import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/components/layout/providers";
import { THEME_COOKIE } from "@/lib/theme";
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
  /* The cream ground, so a phone's browser chrome matches the page. */
  themeColor: "#F4EFE6",
  width: "device-width",
  initialScale: 1,
  // The interface is dark and full-bleed; let it paint under the status bar.
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  /*
   * THE THEME IS DECIDED ON THE SERVER, AND ARRIVES IN THE HTML.
   *
   * WHAT THIS REPLACED, AND WHY IT HAD TO GO.
   *
   * A tiny blocking <script> used to sit first in the body, read localStorage
   * and stamp this attribute before anything painted. React 19 refuses that
   * pattern outright — "Scripts inside React components are never executed
   * when rendering on the client" — and it is right: React only ever creates
   * the element, so the code ran solely because the initial HTML parser
   * happened to see it. Any render React drove itself was silently a no-op.
   *
   * next/script with beforeInteractive is NOT the answer either. It emits
   *   (self.__next_s=self.__next_s||[]).push(...)
   * which hands the code to Next's loader to run later — after hydration, and
   * so after the first paint. That is the black-then-white flash the original
   * script existed to prevent, reintroduced in the name of tidying a warning.
   *
   * A cookie is readable here, before a single byte is sent, so the attribute
   * is simply part of the markup. No script, no flash, no hydration mismatch,
   * and nothing to execute — the failure mode is gone rather than handled.
   *
   * WHITE IS THE DEFAULT, so the attribute is present unless somebody has
   * explicitly chosen black. A first visit, a cleared browser and a private
   * window all send no cookie, and all three should land on white — which is
   * why the test is `!== "black"` rather than `=== "white"`.
   */
  const stored = (await cookies()).get(THEME_COOKIE)?.value;
  const theme = stored === "black" ? undefined : "white";

  return (
    /*
      NO MANUAL <head> HERE.

      An explicit <head> element in the root layout collides with the one the
      App Router streams for itself, and the stylesheet link goes with it: the
      whole product rendered as unstyled HTML under `<html id="__next_error__">`.
      Next's own example carries only <html> and <body> — see
      node_modules/next/dist/docs/01-app/03-api-reference/02-components/script.md.
    */
    <html
      lang="en"
      data-theme={theme}
      className={`${inter.variable} ${jetbrains.variable}`}
    >
      <body className="bg-mesh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
