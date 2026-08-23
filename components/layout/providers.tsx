"use client";

import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion/motion-provider";
import { ToastProvider } from "@/components/ui/toast";

/*
 * Client-side provider stack.
 *
 * Both LazyMotion and ToastProvider require a client context. Wrapping them
 * here keeps the root layout a server component (GUIDE §2) while giving the
 * whole tree access to motion features and toast notifications.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionProvider>
      <ToastProvider>{children}</ToastProvider>
    </MotionProvider>
  );
}
