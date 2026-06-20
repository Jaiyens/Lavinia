import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email-normalize";
import { Button, Input } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { en } from "@/copy/en";

// The sign-in surface (Story 5.1). No passwords: Google SSO (only when its env creds are
// set) and an emailed magic link. Both run as Server Actions that call Auth.js signIn.
// Public route (allowlisted in auth.config.ts). Modern centered "front door" - a logo chip,
// a confident headline, the Google button, an "or" divider, the email link form, and a
// quiet path to the sample tour - all on the shared AuthBackdrop from the (auth) layout.
export const dynamic = "force-dynamic";

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Only same-origin relative paths are honored as the post-login destination, so the
// gate's `callbackUrl` returns a deep-linked user to where they were headed without
// opening a redirect to an external site. Anything else falls back to the home dashboard.
function safeCallback(value: FormDataEntryValue | null): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

async function signInWithGoogle(formData: FormData) {
  "use server";
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

async function signInWithEmail(formData: FormData) {
  "use server";
  const raw = formData.get("email");
  if (typeof raw !== "string" || raw.trim().length === 0) {
    redirect("/login?error=1");
  }
  // Normalize before the magic link is minted so the verification-token identifier and the
  // User row that gets created/looked up share one canonical form (case/Unicode-insensitive).
  // Sends the magic link (stubbed sender logs the URL) then redirects to the
  // verifyRequest page configured in auth.config.ts (/login?sent=email).
  await signIn("email", {
    email: normalizeEmail(raw),
    redirectTo: safeCallback(formData.get("callbackUrl")),
  });
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const t = en.auth;
  // The gate appends ?callbackUrl when it bounces a deep link to /login; carry it through
  // the forms so sign-in returns the user there (sanitized to same-origin in the action).
  const callbackUrl =
    typeof params.callbackUrl === "string" &&
    params.callbackUrl.startsWith("/") &&
    !params.callbackUrl.startsWith("//")
      ? params.callbackUrl
      : "/";
  return (
    <div className="reveal flex w-full max-w-sm flex-col items-center gap-9">
      {/* Brand lockup: a floating logo chip over the confident headline. */}
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-[1.15rem] border border-outline-variant bg-surface-bright shadow-e2">
          <LogoMark className="size-7 text-primary" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="type-display-lg text-on-surface">{t.heading}</h1>
          <p className="type-body-md text-on-surface-variant">{t.subhead}</p>
        </div>
      </div>

      {params.sent === "email" ? (
        <p className="type-body-md w-full rounded-[var(--radius-control)] border border-primary/30 bg-primary-container/40 px-4 py-3 text-center text-on-surface">
          {t.linkSent}
        </p>
      ) : null}
      {params.error ? (
        <p className="type-body-md w-full rounded-[var(--radius-control)] bg-alert-container px-4 py-3 text-center font-medium text-on-alert-container">
          {t.error}
        </p>
      ) : null}

      <div className="flex w-full flex-col gap-4">
        {googleEnabled ? (
          <>
            <form action={signInWithGoogle}>
              <input type="hidden" name="callbackUrl" value={callbackUrl} />
              <button
                type="submit"
                className="lift inline-flex h-11 w-full items-center justify-center gap-3 rounded-[var(--radius-control)] border border-outline-variant bg-surface-bright px-5 font-semibold text-on-surface shadow-e1 transition-colors hover:bg-surface-container-low"
              >
                <GoogleG />
                <span>{t.google}</span>
              </button>
            </form>

            <div className="flex items-center gap-3 text-on-surface-variant">
              <span className="h-px flex-1 bg-outline-variant" />
              <span className="type-label-caps">{t.or}</span>
              <span className="h-px flex-1 bg-outline-variant" />
            </div>
          </>
        ) : null}

        <form action={signInWithEmail} className="flex flex-col gap-3">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Input
            type="email"
            name="email"
            label={t.emailLabel}
            placeholder={t.emailPlaceholder}
            autoComplete="email"
            required
          />
          <Button type="submit" variant="primary" className="w-full">
            {t.sendLink}
          </Button>
        </form>
      </div>

      {/* Story 5.3: a prospect can see the badged representative dashboard with zero
          commitment, no sign-in. A quiet, full-width secondary path so there is an obvious
          no-sign-in way to look around. */}
      <div className="flex w-full flex-col items-center gap-3 border-t border-outline-variant pt-7">
        <p className="type-caption text-on-surface-variant">{t.tourPrompt}</p>
        <Link href="/tour" className="w-full">
          <Button type="button" variant="secondary" className="w-full">
            {en.tour.link} <span aria-hidden>&rarr;</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

// The four-color Google "G". Static brand mark, inlined so the button needs no client JS.
function GoogleG() {
  return (
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.26v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.26a12 12 0 0 0 0 10.76l4.01-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.96 11.96 0 0 0 12 0 12 12 0 0 0 1.26 6.62l4.01 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}
