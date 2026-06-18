"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

// The Almond panel's open/close state, lifted out of AlmondLauncher so more than one trigger can open
// the SAME panel (Story 10.2): the floating launcher FAB, the rail entry, and the first-run nudge.
// ONLY the open boolean lives here — the conversation (`useChat`), the nav chips, the report cards, and
// the live-region announcer all stay inside AlmondLauncher, which still persists across open/close so
// the chat survives. No global `window` event and no state-management dependency: a tiny context with
// three known consumers (NFR2, brownfield-clean).

type AlmondLauncherValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  openAlmond: () => void;
  closeAlmond: () => void;
};

const AlmondLauncherContext = createContext<AlmondLauncherValue | null>(null);

export function AlmondLauncherProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openAlmond = useCallback(() => setOpen(true), []);
  const closeAlmond = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, setOpen, openAlmond, closeAlmond }),
    [open, openAlmond, closeAlmond],
  );
  return <AlmondLauncherContext.Provider value={value}>{children}</AlmondLauncherContext.Provider>;
}

/** Read the shared Almond panel open-state. Must be used under an AlmondLauncherProvider. */
export function useAlmondLauncher(): AlmondLauncherValue {
  const ctx = useContext(AlmondLauncherContext);
  if (ctx === null) {
    throw new Error("useAlmondLauncher must be used within an AlmondLauncherProvider");
  }
  return ctx;
}
