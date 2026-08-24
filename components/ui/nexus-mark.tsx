import Image from "next/image";

/*
 * The NEXUS mark.
 *
 * Both places that showed the product's identity rendered a literal "N" in a
 * tinted rounded square — a placeholder that had outlived its purpose. The
 * sidebar one was the worse of the two: it was hardcoded rather than derived
 * from the organisation, so every tenant got an "N" next to their own name
 * regardless of what they were called.
 *
 * Cropped from the brand artwork, with luminance carried into the alpha
 * channel so it sits on any surface rather than bringing a black tile with it.
 * Decorative in both current placements — the product name is written beside
 * it — so it is hidden from assistive technology by default. Pass a `label`
 * anywhere it becomes the only thing identifying the product.
 */
export function NexusMark({
  size = 32,
  className = "",
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <Image
      src="/brand/nexus-mark.png"
      alt={label ?? ""}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      priority
      className={`shrink-0 select-none ${className}`}
    />
  );
}
