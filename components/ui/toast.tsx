"use client";

import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { AnimatePresence, m } from "motion/react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { springDefault } from "@/lib/motion-tokens";

/* ------------------------------------------------------------------ types */

type ToastVariant = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number;
}

interface ToastOptions {
  variant?: ToastVariant;
  title: string;
  description?: string;
  duration?: number;
}

/* ------------------------------------------------------------------ context */

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/* ------------------------------------------------------------------ hook */

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ provider */

const MAX_VISIBLE = 3;
const DEFAULT_DURATIONS: Record<ToastVariant, number> = {
  success: 4500,
  error: 7000,
  warning: 6000,
  info: 5000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const duration = options.duration ?? DEFAULT_DURATIONS[options.variant ?? "info"];
      const entry: Toast = {
        id,
        variant: options.variant ?? "info",
        title: options.title,
        description: options.description,
        duration,
      };

      setToasts((prev) => {
        const next = [entry, ...prev];
        return next.length > MAX_VISIBLE ? next.slice(0, MAX_VISIBLE) : next;
      });

      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);

      return id;
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ toast, dismiss }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

/* ------------------------------------------------------------------ container */

function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 top-0 z-[9999] flex flex-col items-center gap-2 px-4 pt-4 sm:pt-6"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ item */

const VARIANT_CONFIG: Record<
  ToastVariant,
  { icon: typeof CheckCircle2; color: string; border: string; bg: string }
> = {
  success: {
    icon: CheckCircle2,
    color: "var(--color-healthy)",
    border: "border-l-[var(--color-healthy)]",
    bg: "bg-[var(--color-healthy)]/8",
  },
  error: {
    icon: XCircle,
    color: "var(--color-critical)",
    border: "border-l-[var(--color-critical)]",
    bg: "bg-[var(--color-critical)]/8",
  },
  warning: {
    icon: AlertTriangle,
    color: "var(--color-warning)",
    border: "border-l-[var(--color-warning)]",
    bg: "bg-[var(--color-warning)]/8",
  },
  info: {
    icon: Info,
    color: "var(--dept-techspecialist)",
    border: "border-l-[var(--dept-techspecialist)]",
    bg: "bg-[var(--dept-techspecialist)]/8",
  },
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const config = VARIANT_CONFIG[toast.variant];
  const Icon = config.icon;
  const [hovered, setHovered] = useState(false);
  const remaining = useRef(toast.duration);
  /*
   * Seeded to 0 and set on mount rather than during render.
   *
   * Date.now() in a render body makes the component non-idempotent: React may
   * render twice (StrictMode, or a discarded concurrent attempt) and the two
   * passes disagree about when the toast started, so the dismiss timer drifts.
   * The first effect below establishes the real start.
   */
  const startedAt = useRef(0);
  const pausedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (startedAt.current === 0) startedAt.current = Date.now();
  }, []);

  /* pause/resume auto-dismiss on hover */
  useEffect(() => {
    if (hovered) {
      if (pausedTimer.current) clearTimeout(pausedTimer.current);
      remaining.current -= Date.now() - startedAt.current;
      return;
    }
    startedAt.current = Date.now();
    pausedTimer.current = setTimeout(
      () => onDismiss(toast.id),
      remaining.current,
    );
    return () => {
      if (pausedTimer.current) clearTimeout(pausedTimer.current);
    };
  }, [hovered, toast.id, onDismiss, toast.duration]);

  return (
    <m.div
      layout
      initial={{ opacity: 0, y: -20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -12, scale: 0.95, transition: { duration: 0.15 } }}
      transition={springDefault}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border-l-2",
        "glass-l3 glass-sheen p-3.5",
        config.border,
        config.bg,
      )}
      role="alert"
    >
      {/* icon */}
      <span
        className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-md"
        style={{ backgroundColor: `color-mix(in srgb, ${config.color} 15%, transparent)` }}
        aria-hidden="true"
      >
        <Icon size={14} style={{ color: config.color }} />
      </span>

      {/* text */}
      <div className="min-w-0 flex-1 pt-px">
        <p className="text-sm font-medium leading-snug text-[var(--text-primary)]">
          {toast.title}
        </p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
            {toast.description}
          </p>
        )}
      </div>

      {/* dismiss */}
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="grid size-7 shrink-0 place-items-center rounded-md text-white/40 transition-colors hover:bg-white/[0.08] hover:text-white/70"
      >
        <X size={13} />
      </button>
    </m.div>
  );
}
