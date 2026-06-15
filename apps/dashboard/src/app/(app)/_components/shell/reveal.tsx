import {
  Children,
  cloneElement,
  isValidElement,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";

type Revealable = { className?: string; style?: CSSProperties };

/**
 * One orchestrated staggered reveal of the dashboard sections. Applies the `.reveal` class +
 * `--i` stagger index (defined in globals.css, with the spec easing and the
 * prefers-reduced-motion fallback) to each DIRECT child in the markup. The CSS animation plays
 * when the DOM nodes are first created - i.e. on a data-landing (fresh load) - and does NOT
 * replay on a client-side lens switch (nuqs updates the URL shallowly without remounting this
 * server tree). It does re-stagger on a full Home<->Energy route change (they are separate route
 * segments, so the page subtree remounts); that is acceptable - the same calm reveal, not the
 * banned autoplay-every-open. No JS, no flash, no hydration risk; this is a pure Server Component
 * transform. Each child must be an intrinsic element so it can carry the class + style (the
 * dashboard wraps its sections in plain elements for exactly this reason).
 */
export function Reveal({ children }: { children: ReactNode }) {
  return (
    <>
      {Children.map(children, (child, i) => {
        if (!isValidElement(child)) return child;
        const el = child as ReactElement<Revealable>;
        return cloneElement(el, {
          className: cn(el.props.className, "reveal"),
          style: { ...(el.props.style ?? {}), "--i": i } as CSSProperties,
        });
      })}
    </>
  );
}
