"use client";

import { useEffect, useRef } from "react";

/**
 * After a runner moves to another step, start the member at the top of it:
 * scroll up and focus the new step's heading (give it `tabIndex={-1}`), so a
 * screen reader announces where they are and a keyboard user continues from
 * there. Opening the form does nothing: first render must not steal focus.
 *
 * `step` is anything that changes when the step does — an index, or a key.
 */
export function useStepFocus<T extends HTMLElement>(step: number | string) {
  const headingRef = useRef<T>(null);
  const shownStep = useRef(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    // The page scroll is the document's (no inner scroller in either frame).
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return headingRef;
}
