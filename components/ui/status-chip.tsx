import { cn } from "@/lib/cn";
import { statusMeta } from "@/lib/status";

/*
 * A commitment's status, said three ways at once: icon, word, hue.
 *
 * See lib/status.ts for why hue alone is not enough here.
 */
export function StatusChip({
  status,
  className,
  showLabel = true,
}: {
  status: string;
  className?: string;
  showLabel?: boolean;
}) {
  const meta = statusMeta(status);
  const Icon = meta.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium leading-5",
        className,
      )}
      style={{
        color: meta.color,
        backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${meta.color} 28%, transparent)`,
      }}
      title={meta.gloss}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" />
      {showLabel && meta.label}
      {!showLabel && <span className="sr-only">{meta.label}</span>}
    </span>
  );
}
