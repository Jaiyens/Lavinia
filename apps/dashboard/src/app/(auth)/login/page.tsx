import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn, DEV_BYPASS_EMAIL } from "@/lib/auth";
import { checkCodeRequest } from "@/lib/auth/login-rate-limit";
import { Button, Input } from "@/components/ui";
import { LogoMark } from "@/components/logo";
import { en } from "@/copy/en";

// The sign-in surface (Story 5.1). No passwords: Google SSO (only when its env creds are
// set) and an emailed 6-digit code. Two steps on one page: (1) enter email -> we email a
// code; (2) type the code -> sign in. Public route (allowlisted in auth.config.ts). Modern
// centered "front door" on the shared AuthBackdrop from the (auth) layout.
export const dynamic = "force-dynamic";

const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

// Only same-origin relative paths are honored as the post-login destination, so the gate's
// `callbackUrl` returns a deep-linked user to where they were headed without opening a
// redirect to an external site. Anything else falls back to the home dashboard.
function safeCallback(value: FormDataEntryValue | string | null): string {
  if (typeof value === "string" && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/";
}

async function signInWithGoogle(formData: FormData) {
  "use server";
  await signIn("google", { redirectTo: safeCallback(formData.get("callbackUrl")) });
}

// Step 1: email a 6-digit code, then move to the code-entry step (carrying the normalized
// email + callbackUrl in the URL). `redirect: false` so Auth.js sends the code but does not
// throw its own redirect; we send the operator to our code step instead. Doubles as the
// "send a new code" action on step 2.
async function requestCode(formData: FormData) {
  "use server";
  const raw = formData.get("email");
  // Match Auth.js's identifier normalization (lowercase + trim) so the email we put in the
  // verify form equals the identifier stored against the code.
  const email = typeof raw === "string" ? raw.toLowerCase().trim() : "";
  const callbackUrl = safeCallback(formData.get("callbackUrl"));
  if (!email || !email.includes("@")) {
    redirect("/login?error=1");
  }
  // Dev-only: skip the 6-digit code entirely for the designated bypass email on localhost.
  if (process.env.NODE_ENV !== "production" && email === DEV_BYPASS_EMAIL) {
    await signIn("dev-bypass", { email, redirectTo: callbackUrl });
  }
  // Per-email send throttle (lib/auth/login-rate-limit.ts): bounds mailbombing and stops the
  // "Send a new code" loop from minting unlimited fresh codes to brute-force against. Over
  // budget, keep the operator on the code step and point them at the latest code they already
  // have. Counts every request, including resends.
  if (!checkCodeRequest(email).allowed) {
    redirect(
      `/login?step=code&email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}&error=throttled`,
    );
  }
  let sent = true;
  try {
    await signIn("email", { email, redirect: false });
  } catch {
    // sendLoginCode re-throws on a Resend transport/config error; show the calm error state
    // rather than an unhandled exception page.
    sent = false;
  }
  if (!sent) redirect("/login?error=1");
  redirect(
    `/login?step=code&email=${encodeURIComponent(email)}&callbackUrl=${encodeURIComponent(callbackUrl)}`,
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string; email?: string; error?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  const t = en.auth;
  const callbackUrl = safeCallback(params.callbackUrl ?? null);
  const onCodeStep = params.step === "code" && typeof params.email === "string" && params.email.length > 0;
  // One calm error line, chosen by cause. "locked" (verify budget spent, code invalidated) lands
  // on the email step; "throttled" (too many codes requested) lands on the code step; any other
  // error (a wrong/expired code, a bad email, a send failure) shows the generic retry line.
  const errorMessage = params.error
    ? params.error === "locked"
      ? t.code.tooManyAttempts
      : params.error === "throttled"
        ? t.code.tooManyRequests
        : t.error
    : null;

  return (
    <div className="reveal flex w-full max-w-sm flex-col items-center gap-9">
      {/* Brand lockup: a floating logo chip over the confident headline. */}
      <div className="flex flex-col items-center gap-5 text-center">
        <span className="flex size-14 items-center justify-center rounded-[1.15rem] border border-outline-variant bg-surface-bright shadow-e2">
          <LogoMark className="size-7 text-primary" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="type-display-lg text-on-surface">
            {onCodeStep ? t.code.heading : t.heading}
          </h1>
          <p className="type-body-md text-on-surface-variant">
            {onCodeStep ? t.code.sentTo(params.email as string) : t.subhead}
          </p>
        </div>
      </div>

      {errorMessage ? (
        <p className="type-body-md w-full rounded-[var(--radius-control)] bg-alert-container px-4 py-3 text-center font-medium text-on-alert-container">
          {errorMessage}
        </p>
      ) : null}
      {params.error ? (
        <p className="type-body-md text-alert">
          {/* Auth.js sends ?error=AccessDenied when the sign-in callback rejects a
              non-allowlisted email (pre-launch gate); show the calm access copy for that
              case and the generic retry copy for everything else. */}
          {params.error === "AccessDenied" ? t.accessDenied : t.error}
        </p>
      ) : null}

      {onCodeStep ? (
        <CodeStep email={params.email as string} callbackUrl={callbackUrl} />
      ) : (
        <div className="flex w-full flex-col gap-4">
          {googleEnabled ? (
            <>
              <form action={signInWithGoogle}>
                <input type="hidden" name="callbackUrl" value={callbackUrl} />
                <Button
                  type="submit"
                  variant="outline"
                  className="lift h-11 w-full gap-3 rounded-[var(--radius-control)] border-outline-variant bg-surface-bright px-5 font-semibold text-on-surface shadow-e1 transition-colors hover:bg-surface-container-low"
                >
                  <GoogleG />
                  <span>{t.google}</span>
                </Button>
              </form>

              <div className="flex items-center gap-3 text-on-surface-variant">
                <span className="h-px flex-1 bg-outline-variant" />
                <span className="type-label-caps">{t.or}</span>
                <span className="h-px flex-1 bg-outline-variant" />
              </div>
            </>
          ) : null}

          <form action={requestCode} className="flex flex-col gap-3">
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
              {t.sendCode}
            </Button>
          </form>
        </div>
      )}

      {/* Story 5.3: a prospect can see the badged representative dashboard with zero
          commitment, no sign-in. Hidden on the code step to keep that screen focused. */}
      {onCodeStep ? null : (
        <div className="flex w-full flex-col items-center gap-3 border-t border-outline-variant pt-7">
          <p className="type-caption text-on-surface-variant">{t.tourPrompt}</p>
          <Link href="/tour" className="w-full">
            <Button type="button" variant="secondary" className="w-full">
              {en.tour.link} <span aria-hidden>&rarr;</span>
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

// Step 2: type the 6-digit code. A NATIVE GET form straight to the Auth.js email callback -
// identical to opening a magic link, but the operator supplies the code. Auth.js re-hashes
// the code, matches the single-use VerificationToken, checks the 10-min expiry, and signs
// the user in (redirecting to callbackUrl). No server action / CSRF needed for this GET.
function CodeStep({ email, callbackUrl }: { email: string; callbackUrl: string }) {
  const t = en.auth;
  return (
    <div className="flex w-full flex-col gap-5">
      <form method="get" action="/api/auth/callback/email" className="flex flex-col gap-3">
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <Input
          name="token"
          label={t.code.label}
          placeholder={t.code.placeholder}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          autoFocus
          className="text-center text-lg tracking-[0.5em]"
        />
        <Button type="submit" variant="primary" className="w-full">
          {t.code.verify}
        </Button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        {/* Re-send a fresh code for the same email. */}
        <form action={requestCode}>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <Button
            type="submit"
            variant="link"
            className="h-auto rounded-none p-0 type-caption font-normal text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
          >
            {t.code.resend}
          </Button>
        </form>
        <Button
          asChild
          variant="link"
          className="h-auto rounded-none p-0 type-caption font-normal text-on-surface-variant underline underline-offset-4 hover:text-on-surface"
        >
          <Link href="/login">{t.code.differentEmail}</Link>
        </Button>
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
