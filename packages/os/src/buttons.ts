// The OS's own buttons (the approved prototype's control kit), for the few
// controls the engine draws itself: a dialog's Save and Cancel, the blocking
// form's way out. Pixel face, square, a hard offset shadow on the main one.
// The main action is Join's "Run APPLY.EXE" slab, as the prototype draws it
// (_proto/kit.tsx): near-white with dark text and a magenta offset shadow,
// magenta under the pointer (decision 4 A, the prototype's colours).

const BASE =
  "inline-flex h-9 shrink-0 select-none items-center justify-center gap-2 px-3.5 font-pixel text-xs uppercase leading-none tracking-wider whitespace-nowrap outline-none disabled:pointer-events-none disabled:opacity-40";

/** The main action: a white slab on a magenta shadow it drops when pressed. */
export const OS_BUTTON_PRIMARY = `${BASE} border-2 border-os-fg bg-os-fg text-os-bg shadow-[4px_4px_0_0_var(--os-primary)] hover:border-os-primary hover:bg-os-primary active:translate-x-1 active:translate-y-1 active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-os-primary`;

/** Anything else: an outline on the panel. */
export const OS_BUTTON_SECONDARY = `${BASE} border border-os-muted/60 bg-os-panel text-os-fg hover:border-os-primary hover:bg-os-primary/10 focus-visible:border-os-primary`;
