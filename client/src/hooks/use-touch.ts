import { useEffect, useState } from "react";

/**
 * Capability + layout hooks for tablet support.
 *
 * Design rule: detect touch by device CAPABILITY (`pointer: coarse`), not by
 * screen width. A designer with an iPad + Magic Keyboard should still get the
 * desktop affordances (hover tooltips, keyboard shortcuts) because the mouse
 * makes the primary pointer fine.
 *
 * All hooks subscribe to `matchMedia` change events so they update live when
 * the user rotates, plugs in a mouse, or resizes the window.
 */

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatches(e.matches);
    // Sync once in case the initial value raced with SSR
    setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True when the primary pointer is coarse (finger or stylus, no precise mouse). */
export function useIsTouch(): boolean {
  return useMediaQuery("(pointer: coarse)");
}

/** True in landscape orientation (width >= height). */
export function useIsLandscape(): boolean {
  return useMediaQuery("(orientation: landscape)");
}

/**
 * True when the device looks like a tablet in landscape: at least 1024 px
 * wide (iPad Mini landscape = 1133 px, covered) AND touch-primary AND
 * landscape. Portrait and phones both return false — the app does not
 * support those layouts in this release.
 */
export function useIsTablet(): boolean {
  return useMediaQuery(
    "(min-width: 1024px) and (pointer: coarse) and (orientation: landscape)",
  );
}

/** True when a rotation prompt should block the UI: touch + portrait. */
export function useShouldPromptRotate(): boolean {
  const touch = useIsTouch();
  const portrait = useMediaQuery("(orientation: portrait)");
  return touch && portrait;
}
