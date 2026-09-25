import { GIFTS } from "@/lib/content";
import { Eyebrow, WinBody } from "./ui";

function Installed({ name, text }: { name: string; text: string }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3 font-mono text-[11px] uppercase">
        <span className="text-os-fg">{name}</span>
        <span className="text-os-primary">100%</span>
      </div>
      <div
        aria-hidden
        className="h-2 border border-os-line bg-[repeating-linear-gradient(90deg,var(--color-os-primary)_0_6px,transparent_6px_8px)]"
      />
      <p className="text-os-muted">{text}</p>
    </li>
  );
}

// An "installer" that has already installed Camp 404's gifts on Tankwa Town.
export function GiftsWindow() {
  return (
    <WinBody>
      <p className="font-mono text-xs uppercase text-os-muted">
        &gt; Installing gifts to TANKWA_TOWN… {GIFTS.intro}
      </p>
      <section aria-labelledby="gifts-primary" className="space-y-3">
        <Eyebrow id="gifts-primary">Primary</Eyebrow>
        <ul className="space-y-3">
          {GIFTS.primary.map((g) => (
            <Installed key={g.name} {...g} />
          ))}
        </ul>
      </section>
      <section aria-labelledby="gifts-secondary" className="space-y-3">
        <Eyebrow id="gifts-secondary">Secondary</Eyebrow>
        <ul className="space-y-3">
          {GIFTS.secondary.map((g) => (
            <Installed key={g.name} {...g} />
          ))}
        </ul>
      </section>
    </WinBody>
  );
}
