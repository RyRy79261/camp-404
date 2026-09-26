"use client";

import type { ReactNode } from "react";
import { useInBlockingLayer } from "@camp404/os";

/**
 * Draws its children only outside the desktop's blocking layer. The layer
 * already carries Sign out under the form (and keeps it when the page
 * fails), so the runner's own Sign out would be a second one there; on a
 * bare page it is the only way out, and stays.
 */
export function OutsideBlockingLayer({ children }: { children: ReactNode }) {
  return useInBlockingLayer() ? null : children;
}
