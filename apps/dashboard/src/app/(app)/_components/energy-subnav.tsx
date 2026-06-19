"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";

// The sub-tab strip under the Energy agent: the meter dashboard (basePath) and the public-records
// Parcel lookup (basePath/parcel). Mirrors the lens toggle's underline-tab styling, but these are
// real routes (the user chose a route segment over a lens), so they are <Link>s with the active
// tab derived from the pathname. basePath is "/energy" signed-in, "/tour/energy" on the Tour.
export function EnergySubnav({ basePath = "/energy" }: { basePath?: string }) {
  const pathname = usePathname();
  const parcelHref = `${basePath}/parcel`;
  const tabs = [
    { href: basePath, label: en.shell.agents.energy, active: pathname === basePath },
    { href: parcelHref, label: en.parcel.navTab, active: pathname.startsWith(parcelHref) },
  ];

  return (
    <div
      role="tablist"
      aria-label={en.parcel.subnavLabel}
      className="flex items-center gap-1 border-b border-outline-variant px-5 lg:px-12"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          role="tab"
          aria-selected={tab.active}
          className={cn(
            "-mb-px flex h-11 items-center border-b-2 px-3 type-label-caps transition-colors",
            tab.active
              ? "border-primary font-semibold text-primary"
              : "border-transparent text-on-surface-variant hover:text-on-surface",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
