"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NexusMark } from "@/components/ui/nexus-mark";
import { GlassButton } from "@/components/ui/glass-button";

export function ResetPasswordPanel({ email, token }: { email: string; token: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  const missingLink = !email || !token;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "That did not work. Please try again.");
        return;
      }
      setDone(true);
    });
  }

  if (done) {
    return (
      <GlassCard level={2} className="p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-[var(--color-healthy)]/15"
        >
          <Check size={19} className="text-[var(--color-healthy)]" />
        </span>
        <h1 className="text-xl font-medium tracking-tight">Password changed</h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          Sign in with your new password.
        </p>
        <Link href="/login" className="mt-5 block">
          <GlassButton variant="primary" size="lg" className="w-full">
            Back to sign in
          </GlassButton>
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard level={2} className="p-6">
      <div className="mb-6 text-center">
        <NexusMark size={44} className="mx-auto mb-3" />
        <h1 className="text-xl font-medium tracking-tight">Choose a new password</h1>
        <p className="mt-1 text-xs text-tertiary">
          {email ? `For ${email}.` : "Set a new password below."}
        </p>
      </div>

      {missingLink ? (
        <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-warning)]">
          This link is missing information and cannot be used. Request a new
          one from the sign-in screen.
        </p>
      ) : (
        <form onSubmit={submit} className="space-y-2.5">
          <label className="relative block">
            <span className="sr-only">New password</span>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 pr-11 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide passwords" : "Show passwords"}
              aria-pressed={showPassword}
              className="nx-focus-ring absolute inset-y-0 right-0 grid w-11 place-items-center text-white/40 hover:text-white/75"
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden="true" />
              ) : (
                <Eye size={16} aria-hidden="true" />
              )}
            </button>
          </label>
          <label className="block">
            <span className="sr-only">Confirm new password</span>
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm password"
              className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
            />
          </label>
          <p className="text-2xs text-tertiary">At least 8 characters.</p>

          {error && (
            <p className="rounded-lg border border-[var(--color-critical)]/30 bg-[var(--color-critical)]/10 px-3 py-2 text-xs text-[var(--color-critical)]">
              {error}
            </p>
          )}

          <GlassButton variant="primary" size="lg" type="submit" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                Saving
              </>
            ) : (
              "Set new password"
            )}
          </GlassButton>
        </form>
      )}
    </GlassCard>
  );
}
