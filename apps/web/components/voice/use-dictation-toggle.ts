"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Open and closed for a Dictate pill that swaps for a RecorderPanel. The panel
 * takes focus when it opens; `close` gives focus back to the pill, so a
 * keyboard user is not dropped at the top of the page. Pass `pillRef` to the
 * DictatePill.
 */
export function useDictationToggle() {
  const [dictating, setDictating] = useState(false);
  const pillRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (dictating || !returnFocus.current) return;
    returnFocus.current = false;
    pillRef.current?.focus();
  }, [dictating]);

  return {
    dictating,
    /** Close without moving focus, e.g. when the whole form resets. */
    setDictating,
    pillRef,
    open: () => setDictating(true),
    close: () => {
      returnFocus.current = true;
      setDictating(false);
    },
  };
}
