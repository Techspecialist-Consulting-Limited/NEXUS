import type { ReactNode } from "react";

/** A titled section. `hint` is where the plain-language explanation goes. */
export function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-medium text-white/90">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-tertiary">{hint}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
