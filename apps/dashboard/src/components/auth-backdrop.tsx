import { cn } from "@/lib/cn";

/**
 * The shared premium backdrop for the auth + onboarding "front door" - the modern,
 * centered sign-in vibe (cf. the Resend account screen) rendered in Terra's LIGHT design
 * language. A calm cool-grey canvas (--surface) with two soft brand-green glows bleeding in
 * from opposite corners, a faint dotted grid that fades toward the center, and a gentle
 * vignette so the centered card reads as the focus.
 *
 * Pure CSS (no JS / motion runtime) so it renders on the server and costs nothing; the
 * barely-there glow drift is honored by the global prefers-reduced-motion block in
 * globals.css (which zeroes every animation). Tokens only - no hardcoded palette beyond the
 * green glow tints, which are the brand green (#2fa84f) at low alpha.
 */
export function AuthBackdrop({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-surface",
        className,
      )}
    >
      {/* Faint dotted grid, masked so it dissolves before the edges and never competes with
          the content. The dot color is the hairline token, so it stays a whisper on paper. */}
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage: "radial-gradient(var(--outline-variant) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage:
            "radial-gradient(ellipse 75% 65% at 50% 38%, #000 28%, transparent 78%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 75% 65% at 50% 38%, #000 28%, transparent 78%)",
        }}
      />
      {/* Top-right brand-green glow. */}
      <div
        className="auth-glow absolute -right-[12%] -top-[16%] h-[44rem] w-[44rem] rounded-full blur-[2px]"
        style={{
          background: "radial-gradient(circle, rgba(47,168,79,0.18), transparent 60%)",
        }}
      />
      {/* Bottom-left cooler green glow, drifting out of phase with the first. */}
      <div
        className="auth-glow absolute -bottom-[22%] -left-[14%] h-[42rem] w-[42rem] rounded-full blur-[2px]"
        style={{
          background: "radial-gradient(circle, rgba(47,168,79,0.10), transparent 62%)",
          animationDelay: "-8s",
        }}
      />
    </div>
  );
}
