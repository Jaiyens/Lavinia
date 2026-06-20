import type { ReactNode } from "react";
import { AuthBackdrop } from "@/components/auth-backdrop";

// Public chrome for the (auth) group (Story 5.1). The sign-in "front door": Terra's LIGHT
// design language styled in a modern, centered sign-in vibe. The layout only supplies the
// premium backdrop and the centering; each page renders its own card-less column on top.
// This group is public (see isPublicPath in auth.config.ts); the gated (app) group has the
// three-zone shell instead.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh w-full flex-col items-center justify-center px-5 py-12 text-on-surface">
      <AuthBackdrop />
      {children}
    </div>
  );
}
