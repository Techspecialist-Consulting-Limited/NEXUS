"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { Eye, EyeOff, Loader2, Mail } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { NexusMark } from "@/components/ui/nexus-mark";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/components/ui/toast";
import { ROLE_LABEL, type OrgRole } from "@/lib/roles";

type InvitationContext = {
  token: string;
  orgName: string;
  email: string;
  role: OrgRole;
  invitedBy: string | null;
};

/*
 * Sign in, or create an account.
 *
 * Microsoft is listed first and given the most weight because it is the route
 * the organisation actually uses. Email exists so a different company can
 * adopt the product without an Entra tenant — and so the first person in can
 * get started before an Entra admin has granted consent, which is otherwise a
 * hard block on setting anything up at all.
 *
 * `next` is carried through Auth.js's own `callbackUrl`, kept to a relative
 * path throughout: accepting an absolute URL here would turn the login page
 * into an open redirect, which is a phishing primitive.
 */

type Mode = "signin" | "signup";

function safeNext(next: string | null): string {
  if (!next) return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function SignInPanel({
  mode: authMode,
  next,
  devEnabled,
  forcedDemo = false,
  notice,
  providers,
  invitation = null,
}: {
  mode: "authjs" | "dev";
  next: string | null;
  devEnabled: boolean;
  /**
   * Demo mode was ASKED for with NEXUS_FORCE_DEMO_AUTH, rather than fallen
   * back to. Read on the server: the flag is deliberately not NEXT_PUBLIC_ so
   * it can never reach a browser and be used to downgrade a real deployment.
   */
  forcedDemo?: boolean;
  notice?: string | null;
  /** Whether Microsoft sign-in is configured — see lib/auth-providers.ts. */
  providers: { microsoft: boolean };
  invitation?: InvitationContext | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  /*
   * With an invitation in hand the screen opens on "set a password", with the
   * address already filled and locked. The invitation was sent to exactly one
   * mailbox and is only valid for it, so letting the field be edited only
   * invites a rejection three steps later.
   */
  const [mode, setMode] = useState<Mode>(invitation ? "signup" : "signin");
  const [showEmail, setShowEmail] = useState(Boolean(invitation));
  const [email, setEmail] = useState(invitation?.email ?? "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [pending, startTransition] = useTransition();

  const target = safeNext(
    invitation ? `/onboarding?invite=${invitation.token}` : next,
  );
  const hasSocial = providers.microsoft;

  function withMicrosoft() {
    startTransition(async () => {
      await signIn("microsoft-entra-id", { callbackUrl: target });
    });
  }

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      if (mode === "signup") {
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, fullName: fullName || undefined }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          toast({
            variant: "error",
            title: "Account creation failed",
            description: data.error ?? "That did not work. Please try again.",
          });
          return;
        }
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        toast({
          variant: "error",
          title: "Sign-in failed",
          description:
            mode === "signup"
              ? "The account was created but signing in failed. Try signing in below."
              : "That email and password do not match an account. If you have not created one yet, use “Create one”.",
        });
        return;
      }

      /*
       * A full document load, not router.push.
       *
       * The session cookie was just written, and the destination resolves
       * the role on the server and redirects onward. Pushing leaves the
       * address bar wherever it was while rendering the next page — so
       * bookmarking and Back both break — and it also races the client
       * picking up the new cookie. A real navigation follows the redirect
       * and lands properly.
       */
      window.location.assign(target);
    });
  }

  return (
    <GlassCard level={2} className="p-6">
      <div className="mb-6 text-center">
        <NexusMark size={44} className="mx-auto mb-3" />
        <h1 className="text-xl font-medium tracking-tight">
          {invitation
            ? `Join ${invitation.orgName}`
            : mode === "signup"
              ? "Create your account"
              : "Sign in to NEXUS"}
        </h1>
        <p className="mt-1 text-xs text-tertiary">
          {invitation
            ? `${invitation.invitedBy ?? "You have been"} invited you as ${ROLE_LABEL[invitation.role].toLowerCase()}. Set a password to finish.`
            /*
              Addressed to the person signing in, who is almost always staff.
              The old line — "weekly standups that reach the Chairman on their
              own" — described what happens to their report after they write
              it, which is somebody else's benefit and not a reason to sign in.
            */
            : "Tell it what happened. It does the rest."}
        </p>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2 text-xs text-secondary">
          {notice}
        </p>
      )}

      {authMode === "dev" ? (
        <div className="space-y-3">
          {/*
            Two reasons land here and they need different advice. A build with
            NEXUS_FORCE_DEMO_AUTH set has a perfectly good provider that was
            deliberately overridden.
          */}
          <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-warning)]">
            {forcedDemo ? (
              <>
                This server was started with{" "}
                <span className="metric">NEXUS_FORCE_DEMO_AUTH=1</span>, so it is
                running on the local demo database with seeded people. Real
                sign-in is switched off for this run — restart without that flag
                to use it.
              </>
            ) : (
              <>
                No authentication provider is configured, so NEXUS is running on
                the local demo database.
              </>
            )}
          </p>
          {devEnabled && (
            <GlassButton
              variant="primary"
              size="lg"
              className="w-full"
              onClick={() => {
                router.push(target);
                router.refresh();
              }}
            >
              Continue to the demo
            </GlassButton>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {providers.microsoft && (
            <GlassButton
              variant="primary"
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={withMicrosoft}
            >
              <MicrosoftMark /> Continue with Microsoft
            </GlassButton>
          )}

          {/*
            With no social provider on, email is the only way in, so the form
            is shown open rather than folded behind a disclosure that leads to
            the single remaining option.
          */}
          {hasSocial && !showEmail ? (
            <GlassButton
              variant="ghost"
              size="lg"
              className="w-full"
              onClick={() => setShowEmail(true)}
            >
              <Mail size={16} aria-hidden="true" /> Use an email address
            </GlassButton>
          ) : (
            <>
              {hasSocial && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1 bg-white/[0.10]" />
                  <span className="text-2xs text-white/35">or</span>
                  <span className="h-px flex-1 bg-white/[0.10]" />
                </div>
              )}

              <form onSubmit={submitEmail} className="space-y-2.5 pt-1">
                {mode === "signup" && (
                  <label className="block">
                    <span className="sr-only">Your name</span>
                    <input
                      type="text"
                      autoComplete="name"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your name"
                      className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
                    />
                  </label>
                )}

                <label className="block">
                  <span className="sr-only">Email</span>
                  <input
                    type="email"
                    required
                    readOnly={Boolean(invitation)}
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    className={`h-12 w-full rounded-lg border border-white/[0.10] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none ${
                      invitation ? "cursor-not-allowed bg-white/[0.02] text-white/60" : "bg-white/[0.04]"
                    }`}
                  />
                </label>

                <label className="relative block">
                  <span className="sr-only">Password</span>
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Choose a password" : "Password"}
                    className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 pr-11 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
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

                {mode === "signup" ? (
                  <p className="text-2xs text-tertiary">At least 8 characters.</p>
                ) : (
                  <Link
                    href="/forgot-password"
                    className="block text-right text-2xs text-white/45 hover:text-white/75"
                  >
                    Forgot password?
                  </Link>
                )}

                <GlassButton
                  variant="primary"
                  size="lg"
                  type="submit"
                  className="w-full"
                  disabled={pending}
                >
                  {pending ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                      {mode === "signup" ? "Creating" : "Signing in"}
                    </>
                  ) : invitation ? (
                    "Set password and join"
                  ) : mode === "signup" ? (
                    "Create account"
                  ) : (
                    "Sign in"
                  )}
                </GlassButton>
              </form>

              <button
                type="button"
                onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                className="min-h-11 w-full text-center text-xs text-white/55 hover:text-white/85"
              >
                {mode === "signin"
                  ? "No account yet? Create one"
                  : invitation
                    ? "Already have an account? Sign in instead"
                    : "Already have an account? Sign in"}
              </button>
            </>
          )}
        </div>
      )}

      {authMode === "authjs" && !invitation && (
        <p className="mt-6 text-center text-2xs leading-relaxed text-tertiary">
          After signing in you will either be invited to an organisation, or
          create one.
        </p>
      )}
    </GlassCard>
  );
}

/* Brand mark, inline so the page makes no external requests. */

function MicrosoftMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f25022" d="M1 1h10v10H1z" />
      <path fill="#7fba00" d="M12 1h10v10H12z" />
      <path fill="#00a4ef" d="M1 12h10v10H1z" />
      <path fill="#ffb900" d="M12 12h10v10H12z" />
    </svg>
  );
}
