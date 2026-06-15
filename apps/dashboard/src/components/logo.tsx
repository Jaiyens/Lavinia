"use client";

import Link from "next/link";
import { useState } from "react";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/cn";
import { withBasePath } from "@/lib/base-path";

/**
 * Terra logo mark. Renders /logo.svg, and if that file is missing it falls
 * back to a small green leaf so the brand never disappears.
 */
export function LogoMark({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <Leaf className={className} strokeWidth={2} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={withBasePath("/logo.svg")}
      alt=""
      aria-hidden
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

/** The Terra wordmark: leaf mark + "Terra" set in the soft display serif. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/"
      className={cn("group inline-flex items-center gap-2", className)}
      aria-label="Terra home"
    >
      <LogoMark className="text-green size-6 transition-transform duration-200 ease-out group-hover:rotate-6" />
      <span className="font-display text-[1.55rem] leading-none">Terra</span>
    </Link>
  );
}
