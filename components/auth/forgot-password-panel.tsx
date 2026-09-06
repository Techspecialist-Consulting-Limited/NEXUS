"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, MailCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NexusMark } from "@/components/ui/nexus-mark";
import { GlassButton } from "@/components/ui/glass-button";

export function ForgotPasswordPanel() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      /*
       * Shown regardless of what the server actually did — see the route's
       * own comment. A different message for "no such account" is exactly
       * how this screen would become a way to check who has signed up here.
       */
      setSent(true);
    });
  }

  if (sent) {
    return (
      <GlassCard level={2} className="p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-[var(--color-healthy)]/15"
        >
          <MailCheck size={19} className="text-[var(--color-healthy)]" />
        </span>
        <h1 className="text-xl font-medium tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          If <span className="text-white/90">{email}</span> has an account,
          a link to reset its password is on its way. It expires in one hour.
        </p>
        <Link href="/login" className="mt-5 block">
          <GlassButton variant="ghost" size="lg" className="w-full">
            <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
          </GlassButton>
        </Link>
      </GlassCard>
    );
  }

  return (
    <GlassCard level={2} className="p-6">
      <div className="mb-6 text-center">
        <NexusMark size={44} className="mx-auto mb-3" />
        <h1 className="text-xl font-medium tracking-tight">Reset your password</h1>
        <p className="mt-1 text-xs text-tertiary">
          Enter the email you sign in with.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-2.5">
        <label className="block">
          <span className="sr-only">Email</span>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
          />
        </label>

        <GlassButton variant="primary" size="lg" type="submit" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              Sending
            </>
          ) : (
            "Send reset link"
          )}
        </GlassButton>

        <Link
          href="/login"
          className="block min-h-11 text-center text-xs leading-[2.75rem] text-white/55 hover:text-white/85"
        >
          Back to sign in
        </Link>
      </form>
    </GlassCard>
  );
}
