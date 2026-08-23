"use client";

import { useState } from "react";
import { Quote } from "lucide-react";
import { cn } from "@/lib/cn";

/*
 * The trust primitive.
 *
 * Every AI claim carries one of these, and expanding it shows the verbatim
 * source — GUIDE §15 rule 4: "when the UI says 'you said this', it quotes the
 * actual sentence. Never paraphrase."
 *
 * Expansion is a height-free reveal (opacity + translate only) so it does not
 * violate the transform/opacity rule.
 */
export function EvidenceChip({
  label,
  quote,
  source,
}: {
  label: string;
  quote?: string | null;
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const expandable = Boolean(quote);

  const shell =
    "inline-flex max-w-full items-center gap-1 rounded-md border border-white/[0.10] " +
    "bg-white/[0.04] px-2.5 text-xs text-white/60";

  const face = (
    <>
      <Quote size={10} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );

  return (
    <span className="inline-block">
      {/*
        A chip with no quote behind it is a label, not a control.
        
        It used to render as a disabled <button>, which put a thing in the tab
        order and the accessibility tree that does nothing when reached, and
        failed a touch-target check it could never meaningfully pass. Only the
        chips that actually open something are buttons — and those get a real
        44px target, because the quote proving a claim is the most important
        thing on the card to be able to tap.
      */}
      {expandable ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(shell, "min-h-11 py-2 hover:border-white/20 hover:text-white/90")}
        >
          {face}
        </button>
      ) : (
        <span className={cn(shell, "py-1")}>{face}</span>
      )}

      {open && quote && (
        <span className="mt-1.5 block rounded-md border-l-2 border-white/20 bg-white/[0.03] px-3 py-2">
          <span className="block text-xs italic leading-relaxed text-white/70">
            “{quote}”
          </span>
          {source && (
            <span className="mt-1 block text-2xs text-tertiary">{source}</span>
          )}
        </span>
      )}
    </span>
  );
}
