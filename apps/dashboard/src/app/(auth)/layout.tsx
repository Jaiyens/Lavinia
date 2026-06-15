import type { ReactNode } from "react";

// Public chrome for the (auth) group (Story 5.1). No OS shell, no farm data - just a
// calm, centered card on warm paper. The (app) group's three-zone shell is gated; this
// group is public (see isPublicPath in auth.config.ts).
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-paper px-5 py-12 text-on-surface">
      {children}
    </div>
  );
}
