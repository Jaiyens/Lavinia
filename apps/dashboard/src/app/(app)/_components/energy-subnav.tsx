"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MapPin, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { en } from "@/copy/en";

// The sub-tab strip under the Energy agent: the meter dashboard (basePath) and the public-records
// Parcel lookup (basePath/parcel). The user chose a route segment over a lens, so these are real
// <Link>s with the active tab derived from the pathname. basePath is "/energy" signed-in,
// "/tour/energy" on the Tour.
//
// Rendered as a LOUD segmented pill control (icons + readable labels + a filled green active
// pill), not the quiet caps-underline of the lens toggle: this is cross-route navigation a grower
// has to be able to find, so it earns more visual weight than an in-view lens switch.
//
// Desktop already shows Parcel as a nested item in the left rail (AgentRail), so this strip is
// mobile-only (lg:hidden): on a phone the rail collapses to the bottom tab bar, which has no room
// for the sub-item, so this is how a phone user switches Energy <-> Parcel.
export function EnergySubnav({ basePath = "/energy" }: { basePath?: string }) {
  const pathname = usePathname();
  const parcelHref = `${basePath}/parcel`;
  const tabs = [
    { href: basePath, label: en.shell.agents.energy, Icon: Zap, active: pathname === basePath },
    { href: parcelHref, label: en.parcel.navTab, Icon: MapPin, active: pathname.startsWith(parcelHref) },
  ];

  return (
    <div
      role="tablist"
      aria-label={en.parcel.subnavLabel}
      className="flex items-center gap-2 border-b border-outline-variant px-5 py-3 lg:hidden"
    >
      {tabs.map(({ href, label, Icon, active }) => (
        <Link
          key={href}
          href={href}
          role="tab"
          aria-selected={active}
          aria-current={active ? "page" : undefined}
          className={cn(
            "inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] px-4 type-body-md font-semibold transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            active
              ? "bg-primary text-on-primary shadow-e1"
              : "border border-outline-variant text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface",
          )}
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </Link>
      ))}
    </div>
  );
}
