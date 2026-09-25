import type { ReactNode } from "react";

// Small shared pieces for window bodies, so every window reads the same.

export function WinBody({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 p-5 text-sm leading-relaxed text-os-fg">
      {children}
    </div>
  );
}

export function WinHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="os-glow font-pixel text-lg uppercase leading-tight">
      {children}
    </h3>
  );
}

export function Eyebrow({
  id,
  children,
}: {
  id?: string;
  children: ReactNode;
}) {
  return (
    <h4
      id={id}
      className="font-pixel text-xs uppercase tracking-widest text-os-accent"
    >
      {children}
    </h4>
  );
}

export function AllHands() {
  return (
    <span className="ml-2 inline-block bg-os-primary px-1.5 font-pixel text-[9px] uppercase text-os-primary-fg">
      All hands
    </span>
  );
}
