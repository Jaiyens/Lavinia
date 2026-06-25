import * as React from "react"

const MOBILE_BREAKPOINT = 768

// Subscribe to the mobile media query. useSyncExternalStore (not an effect + setState) keeps this
// lint-clean (react-hooks/set-state-in-effect) and SSR-safe: the server snapshot is a stable
// `false`, the client snapshot reads the real viewport, and React resubscribes on mount.
function subscribe(callback: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", callback)
  return () => mql.removeEventListener("change", callback)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
