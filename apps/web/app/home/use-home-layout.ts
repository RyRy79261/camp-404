"use client";

import { useCallback, useEffect, useState } from "react";
import {
  type HomeLayout,
  type LayoutGroup,
  type Section,
  isHomeLayout,
  reconcileLayout,
  seedLayout,
} from "./home-layout";

// Client-only persistence for the home Customize v2 layout (localStorage ONLY —
// no server write, decision 4). The pure model + reducers live in
// home-layout.ts; this hook owns the storage round-trip, the seed/reconcile on
// read, and the mounted-gate that keeps SSR (default catalogue order) matching
// the first client paint before the saved overlay applies.

const KEY = "camp404:home-layout:v2";

function read(): HomeLayout | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isHomeLayout(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function write(layout: HomeLayout): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(layout));
  } catch {
    // Private mode / disabled storage — keep the in-memory layout for the session.
  }
}

export function useHomeLayout(
  catalogue: LayoutGroup[],
  lockedGroupIds: string[],
) {
  // The lazy seed runs identically on SSR + first client render (so hydration
  // matches); the post-mount effect then swaps in the reconciled saved layout.
  const [sections, setSectionsState] = useState<Section[]>(
    () => seedLayout(catalogue, lockedGroupIds).sections,
  );

  // Catalogue is static and lockedGroupIds is server-stable for the session, so
  // seed/reconcile once on mount (the values from first render are captured).
  useEffect(() => {
    const saved = read();
    setSectionsState(
      saved
        ? reconcileLayout(saved, catalogue, lockedGroupIds).sections
        : seedLayout(catalogue, lockedGroupIds).sections,
    );
  }, []);

  const setSections = useCallback(
    (updater: Section[] | ((prev: Section[]) => Section[])) => {
      setSectionsState((prev) => {
        const next =
          typeof updater === "function"
            ? (updater as (p: Section[]) => Section[])(prev)
            : updater;
        write({ v: 2, sections: next });
        return next;
      });
    },
    [],
  );

  return { sections, setSections };
}
