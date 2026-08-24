"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";
import { GlassButton } from "@/components/ui/glass-button";
import { useToast } from "@/components/ui/toast";
import { supabaseBrowser, OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/supabase-browser";
import type { EnabledProviders } from "@/lib/supabase-env";
import { ROLE_LABEL, type OrgRole } from "@/lib/roles";
import { explainAuthError } from "@/lib/auth-errors";

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
 * `next` is carried through the OAuth round trip so an invitation link still
 * lands on its acceptance screen after the detour via Microsoft. It is kept to
 * a relative path: accepting an absolute URL here would turn the login page
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
  notice,
  providers,
  invitation = null,
}: {
  mode: "supabase" | "dev";
  next: string | null;
  devEnabled: boolean;
  notice?: string | null;
  providers: EnabledProviders;
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
  const [fullName, setFullName] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const target = safeNext(
    invitation ? `/onboarding?invite=${invitation.token}` : next,
  );
  const hasSocial = providers.azure || providers.google;

  function oauth(provider: OAuthProvider) {
    startTransition(async () => {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          scopes: OAUTH_PROVIDERS[provider].scopes,
          redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        },
      });
      if (error) {
        const failure = explainAuthError(error.message);
        toast({
          variant: "error",
          title: failure.title,
          description: failure.detail,
        });
      }
    });
  }

  function submitEmail(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const supabase = supabaseBrowser();

      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast({
            variant: "error",
            title: "Sign-in failed",
            description:
              /invalid login credentials/i.test(error.message)
                ? "That email and password do not match an account. If you have not created one yet, use \u201cCreate one\u201d."
                : error.message,
          });
          return;
        }
      /*
       * A full document load, not router.push.
       *
       * The session cookies were just written, and "/" resolves the role on
       * the server and redirects onward. Pushing leaves the address bar on "/"
       * while rendering the dashboard — so bookmarking and Back both break —
       * and it also races router.refresh() to pick up the new cookies. A real
       * navigation makes the browser follow the redirect and land properly.
       */
      window.location.assign(target);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName.trim() || undefined },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(target)}`,
        },
      });

      if (error) {
        toast({
          variant: "error",
          title: "Account creation failed",
          description:
            /already registered|already exists/i.test(error.message)
              ? "There is already an account with that email. Sign in instead."
              : error.message,
        });
        return;
      }

      if (!data.session) {
        setSentTo(email);
        return;
      }

      window.location.assign(target);
    });
  }

  // ---- waiting on a confirmation link ----------------------------------
  if (sentTo) {
    return (
      <GlassCard level={2} className="p-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-[var(--color-healthy)]/15"
        >
          <MailCheck size={19} className="text-[var(--color-healthy)]" />
        </span>
        <h1 className="text-xl font-medium tracking-tight">Confirm your email</h1>
        <p className="mt-2 text-sm leading-relaxed text-secondary">
          A link is on its way to <span className="text-white/90">{sentTo}</span>.
          Open it and you will be signed in.
        </p>
        <p className="mt-4 text-2xs leading-relaxed text-tertiary">
          Open it in this browser — the link finishes a handshake that started
          here, and another browser cannot complete it. If nothing arrives,
          check spam: a new project sends through a shared mail service that is
          heavily rate limited.
        </p>
        <GlassButton
          variant="ghost"
          size="lg"
          className="mt-5 w-full"
          onClick={() => {
            setSentTo(null);
            setMode("signin");
          }}
        >
          <ArrowLeft size={15} aria-hidden="true" /> Back to sign in
        </GlassButton>
      </GlassCard>
    );
  }

  return (
    <GlassCard level={2} className="p-6">
      <div className="mb-6 text-center">
        <span
          aria-hidden="true"
          className="mx-auto mb-3 grid size-10 place-items-center rounded-xl bg-[var(--dept-techspecialist)]/20 text-sm font-semibold text-[var(--dept-techspecialist)]"
        >
          N
        </span>
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
          <p className="rounded-lg border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 px-3 py-2.5 text-xs leading-relaxed text-[var(--color-warning)]">
            No authentication provider is configured, so NEXUS is running on the
            local demo database. Set{" "}
            <span className="metric">NEXT_PUBLIC_SUPABASE_URL</span> and{" "}
            <span className="metric">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</span>{" "}
            to enable Microsoft, Google and password sign-in.
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
          {providers.azure && (
            <GlassButton
              variant="primary"
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={() => oauth("azure")}
            >
              <MicrosoftMark /> Continue with Microsoft
            </GlassButton>
          )}

          {providers.google && (
            <GlassButton
              variant={providers.azure ? "secondary" : "primary"}
              size="lg"
              className="w-full"
              disabled={pending}
              onClick={() => oauth("google")}
            >
              <GoogleMark /> Continue with Google
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

                <label className="block">
                  <span className="sr-only">Password</span>
                  <input
                    type="password"
                    required
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === "signup" ? "Choose a password" : "Password"}
                    className="h-12 w-full rounded-lg border border-white/[0.10] bg-white/[0.04] px-3.5 text-sm text-white/90 placeholder:text-white/25 focus:border-white/25 focus:outline-none"
                  />
                </label>

                {mode === "signup" && (
                  <p className="text-2xs text-tertiary">At least 8 characters.</p>
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

      {/*
        Two different reasons produce an empty provider list, and they need
        opposite advice. Telling somebody to go and switch Microsoft on when it
        is already on — because the settings endpoint answered 401 — costs them
        the one trip to the dashboard that would have fixed it.
      */}
      {authMode === "supabase" && !hasSocial && (
        <p className="mt-4 rounded-lg border border-white/[0.10] bg-white/[0.04] px-3 py-2.5 text-2xs leading-relaxed text-tertiary">
          {providers.known
            ? "Microsoft and Google sign-in are not switched on for this project yet. Enable them under Authentication → Providers in the Supabase dashboard and they appear here on the next visit."
            : "NEXUS could not check which sign-in methods this project has, so only email is offered here. Anything else that is switched on will reappear once that check succeeds."}
        </p>
      )}

      {/*
        Only where it is true, and only where it helps.
        
        This used to be an unconditional footer reading "Signing in proves who
        you are. It does not, by itself, give you access to an organisation."
        Shown to somebody arriving from an invitation it contradicted the line
        directly above it — which says who invited them and to what — and shown
        on the demo it was simply wrong, since that lands you in an
        organisation immediately.
        
        What is left is one forward-looking sentence for the person it is
        actually for: a stranger at a bare sign-in screen, wondering what
        happens next.
      */}
      {authMode === "supabase" && !invitation && (
        <p className="mt-6 text-center text-2xs leading-relaxed text-tertiary">
          After signing in you will either be invited to an organisation, or
          create one.
        </p>
      )}
    </GlassCard>
  );
}

/* Brand marks, inline so the page makes no external requests. */

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

function GoogleMark() {
  return (
    <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.1 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.1 17.6 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.4-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.3 2.3-6.4 0-11.7-3.6-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
