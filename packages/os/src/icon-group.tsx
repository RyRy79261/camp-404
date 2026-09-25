import type { ReactNode } from "react";

type Props = {
  /** The group's name, read out (and shown, with `heading`). */
  label: string;
  /** Shows the name above the icons, as a column title. */
  heading?: boolean;
  /** Where and how the icons sit: the app's grid. */
  className?: string;
  children: ReactNode;
};

/** A named set of desktop icons, as one navigation landmark. */
export function IconGroup({ label, heading, className, children }: Props) {
  return (
    <nav aria-label={label} className={className}>
      {heading && (
        <h2 className="col-span-full px-1 font-pixel text-[10px] uppercase tracking-widest text-os-muted">
          {label}
        </h2>
      )}
      {children}
    </nav>
  );
}
