"use client";

import { useEffect, useRef } from "react";

/**
 * After a wizard moves to another page, start the member at the top of it:
 * scroll up and focus the new page's heading (give it `tabIndex={-1}`), so a
 * screen reader announces where they are and a keyboard user continues from
 * there. Opening the form does nothing: first render must not steal focus.
 */
export function useStepFocus<T extends HTMLElement>(step: number) {
  const headingRef = useRef<T>(null);
  const shownStep = useRef(step);

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    // The runner's top bar is sticky, so the page scroll is the document's.
    const scroller = document.scrollingElement;
    if (scroller) scroller.scrollTop = 0;
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return headingRef;
}
