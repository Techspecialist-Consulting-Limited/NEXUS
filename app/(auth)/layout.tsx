import type { ReactNode } from "react";
import Image from "next/image";

/*
 * Unauthenticated shell: no nav, no persona switcher, nothing to leak.
 *
 * THE BRAND MARK IS THE BACKGROUND, and it needs a scrim to be one.
 *
 * The asset is a logo lockup on black, not a texture. Dropped in at full
 * strength behind a centred card it does two unhelpful things: the wordmark
 * lands directly under the card that already says "Sign in to NEXUS", and the
 * glow competes with the one control on the page. Dimmed, with a vignette
 * over it, the same image reads as atmosphere — the colour bleeds around the
 * card and the mark is still legible above it.
 *
 * Served through next/image rather than as a CSS background so it is resized
 * and re-encoded: the source is a 1536x1024 PNG at 1.2MB, which is a lot to
 * spend on the first screen anybody sees. `priority` because it IS the first
 * screen — lazy-loading the backdrop only guarantees a flash of empty void.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    /*
      `overflow-hidden` is load-bearing, not tidiness. The backdrop is scaled
      up on phones to crop onto the mark, and a scaled child overflows its
      parent — which pushed 135px of horizontal scroll onto the sign-in page.
      The visual sweep caught it; nothing else would have.
    */
    /*
      `auth-surface` pins the neutral dark palette these screens were drawn
      against — see the block of that name in app/globals.css. Without it
      they inherit :root, which is now the app's warm theme, and the card
      turns brown on artwork that is black.
    */
    <div className="auth-surface relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Image
        src="/brand/nexus.png"
        alt=""
        aria-hidden="true"
        fill
        priority
        sizes="100vw"
        /*
          On a phone the viewport is far taller than the artwork, so `cover`
          takes a narrow vertical slice straight through the middle — which
          sliced the tagline mid-word and read as a broken image rather than a
          backdrop. Zooming from the top anchors the crop on the mark and
          pushes the wordmark off the bottom, so what remains is whole.
        */
        className="pointer-events-none origin-top scale-[1.75] select-none
                   object-cover opacity-45 sm:scale-100"
      />

      {/*
        The scrim. Darkest at the centre, where the card sits, so the form
        keeps its contrast without flattening the glow at the edges.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0
                   bg-[radial-gradient(ellipse_at_center,rgba(8,8,12,0.82)_0%,rgba(8,8,12,0.62)_45%,rgba(8,8,12,0.88)_100%)]"
      />

      <div className="relative w-full max-w-md">{children}</div>
    </div>
  );
}
