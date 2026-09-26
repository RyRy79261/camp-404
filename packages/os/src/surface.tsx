// The desktop's CRT surface (visual-language doc 4.1): Join's four layers,
// drawn once behind the icons and never inside a window. Decorative, so it
// is hidden from assistive tech and takes no pointer. The beam is the only
// moving part; styles.css pauses it with a hidden tab (data-os-paused on an
// ancestor) and removes it under reduced motion.
export function Surface({ beam = true }: { beam?: boolean }) {
  return (
    <>
      <div
        aria-hidden
        className="os-grid pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="os-scanlines pointer-events-none absolute inset-0"
      />
      <div
        aria-hidden
        className="os-noise pointer-events-none absolute inset-0 opacity-[0.06]"
      />
      {beam && (
        <div
          aria-hidden
          data-os-scanbeam
          className="os-scanbeam pointer-events-none absolute inset-x-0 top-0 h-24"
        />
      )}
    </>
  );
}
