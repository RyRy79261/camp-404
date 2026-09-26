import { initialsFrom } from "@camp404/core";

// The prototype's avatar: the member's initials in a square, tinted by their
// name (magenta, blue or grey), in the pixel face. Decorative beside a name.

const TONES = [
  "border-os-primary/70 bg-os-primary/25",
  "border-os-accent/70 bg-os-accent/25",
  "border-os-muted/60 bg-os-fg/10",
] as const;

const SIZES = {
  xs: "size-6 text-[10px]",
  md: "size-9 text-xs",
} as const;

export function OsAvatar({
  name,
  size = "xs",
}: {
  name: string;
  size?: keyof typeof SIZES;
}) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden
      className={`inline-grid shrink-0 select-none place-items-center border font-pixel uppercase leading-none text-os-fg ${SIZES[size]} ${TONES[h % TONES.length]}`}
    >
      {initialsFrom(name)}
    </span>
  );
}
