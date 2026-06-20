import Link from "next/link";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth";
import { normalizeEmail } from "@/lib/email-normalize";
import { Button, Input } from "@/components/ui";
import { Wordmark } from "@/components/logo";
import { en } from "@/copy/en";

// The sign-in surface (Story 5.1). No passwords: Google SSO (only when its env creds are
// set) and an emailed magic link. Both run as Server Actions that call Auth.js signIn.
// Public route (allowlisted in auth.config.ts).
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
    <div className="flex w-full max-w-sm flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Wordmark className="text-on-surface" />
        <h1 className="type-title text-on-surface">{t.heading}</h1>
        <p className="type-body-md text-on-surface-variant">{t.subhead}</p>
      </div>

      {params.sent === "email" ? (
        <p className="type-body-md rounded-[var(--radius-control)] border border-outline-variant bg-surface-container-low px-4 py-3 text-on-surface">
          {t.linkSent}
        </p>
      ) : null}
      {params.error ? (
        <p className="type-body-md text-alert">{t.error}</p>
      ) : null}

      <div className="flex flex-col gap-4">
        {googleEnabled ? (
          <form action={signInWithGoogle}>
            <input type="hidden" name="callbackUrl" value={callbackUrl} />
            <Button type="submit" variant="secondary" className="w-full">
              {t.google}
            </Button>
          </form>
        ) : null}

        {googleEnabled ? (
          <div className="flex items-center gap-3 text-on-surface-variant">
            <span className="h-px flex-1 bg-outline-variant" />
            <span className="type-label-caps">{t.or}</span>
            <span className="h-px flex-1 bg-outline-variant" />
          </div>
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
          commitment, no sign-in. Promoted to a full-width button so there is an obvious
          no-sign-in way to look around (the underlined link read as an afterthought). */}
      <div className="flex flex-col gap-2 border-t border-outline-variant pt-6">
        <p className="type-caption text-center text-on-surface-variant">{t.tourPrompt}</p>
        <Link href="/tour" className="w-full">
          <Button type="button" variant="secondary" className="w-full">
            {en.tour.link} <span aria-hidden>&rarr;</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
