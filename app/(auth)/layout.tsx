import type { ReactNode } from "react";

/** Unauthenticated shell: no nav, no persona switcher, nothing to leak. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
