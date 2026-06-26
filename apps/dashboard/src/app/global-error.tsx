"use client";

// Root error boundary. This is the last line of defense: it catches errors thrown in the
// root layout itself, where the normal (app)/error.tsx cannot reach. Because it replaces the
// root layout, it MUST render its own <html> and <body>. Calm, recoverable treatment; the
// reset() retry re-renders the root. Plain operator English, no em dashes, no exclamation
// marks. Inline styles are used so the screen still renders even if global CSS failed to
// load (the case this boundary exists to survive).

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log for server-side observability without showing the details to the farmer.
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          backgroundColor: "#eef1f5",
          color: "#16190f",
          fontFamily:
            "var(--font-inter), ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          textAlign: "center",
        }}
      >
        <div style={{ maxWidth: "28rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "1rem", lineHeight: 1.5, margin: 0, color: "#5b6470" }}>
            We ran into a problem. Your data is safe. You can try again.
          </p>
          <div>
            {/* Inline styles (not utility classes) are kept on purpose: this boundary exists
                to survive global CSS failing to load, so the button must render correctly with
                zero stylesheet. The shadcn Button passes `style` through to the underlying
                element, so we keep the inline look while adopting the component. */}
            <Button
              type="button"
              variant="primary"
              onClick={reset}
              style={{
                appearance: "none",
                border: "none",
                cursor: "pointer",
                height: "2.75rem",
                padding: "0 1.5rem",
                borderRadius: "0.625rem",
                backgroundColor: "#2fa84f",
                color: "#ffffff",
                fontSize: "1rem",
                fontWeight: 600,
              }}
            >
              Try again
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
