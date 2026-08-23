import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/*
 * GUIDE Visual Direction: "Empty states should show what the AI is waiting for
 * or what the user can do next." Never a shrug — always the next move.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
      <Icon
        size={22}
        strokeWidth={1.75}
        className="mb-3 text-white/30"
        aria-hidden="true"
      />
      <p className="text-sm font-medium text-white/80">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-relaxed text-tertiary">{body}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
