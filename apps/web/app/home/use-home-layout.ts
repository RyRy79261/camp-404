"use client";

import { useCallback, useEffect, useState } from "react";

// Client-only home layout persistence (board S08 Customize, decision 4:
// localStorage ONLY — no server write, no table). Stores a per-group tile order;
// the saved order is reconciled against the live catalogue on read so tiles
// added/removed across releases don't break a stale layout.

const KEY = "camp404:home-layout:v1";

interface LayoutState {
  /** groupId → ordered tile ids. */
  order: Record<string, string[]>;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

function read(): LayoutState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { order: {} };
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && "order" in parsed) {
      const rawOrder = (parsed as { order: unknown }).order;
      if (rawOrder && typeof rawOrder === "object") {
        // Validate every value is a string[] — drop malformed/tampered entries
        // so a bad payload can't feed a non-iterable to applyOrder.
        const order: Record<string, string[]> = {};
        for (const [key, value] of Object.entries(
          rawOrder as Record<string, unknown>,
        )) {
          if (isStringArray(value)) order[key] = value;
        }
        return { order };
      }
    }
  } catch {
    // Private-mode / disabled storage / malformed value — fall back to default.
  }
  return { order: {} };
}

function write(state: LayoutState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Best-effort; private mode keeps the in-memory order for the session.
  }
}

/**
 * Reorder `tiles` by a saved id list, dropping ids no longer present and
 * appending any new tiles (in their catalogue order) at the end. Pure.
 */
export function applyOrder<T extends { id: string }>(
  tiles: T[],
  savedIds: string[] | undefined,
): T[] {
  if (!savedIds || savedIds.length === 0) return tiles;
  const byId = new Map(tiles.map((t) => [t.id, t]));
  const ordered: T[] = [];
  for (const id of savedIds) {
    const tile = byId.get(id);
    if (tile) {
      ordered.push(tile);
      byId.delete(id);
    }
  }
  // Any tiles not named in the saved order (new since it was saved) keep their
  // original relative order at the end.
  for (const tile of tiles) {
    if (byId.has(tile.id)) ordered.push(tile);
  }
  return ordered;
}

export function useHomeLayout() {
  // SSR + first client paint render the default order; the saved overlay is
  // applied only after mount so the hydrated tree matches the server's (the
  // one-frame reconcile is accepted, decision 4 / plan §States).
  const [mounted, setMounted] = useState(false);
  const [order, setOrder] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setOrder(read().order);
    setMounted(true);
  }, []);

  const setGroupOrder = useCallback((groupId: string, ids: string[]) => {
    setOrder((prev) => {
      const next = { ...prev, [groupId]: ids };
      write({ order: next });
      return next;
    });
  }, []);

  return { mounted, order, setGroupOrder };
}
