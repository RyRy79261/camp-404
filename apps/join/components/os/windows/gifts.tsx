import type { CSSProperties } from "react";
import { GIFTS, type Gift } from "@/lib/content";
import { GiftIconSvg } from "../gift-icons";
import { Eyebrow, WinBody } from "./ui";

// One gift in a progress ring that fills as the window opens ("installing"),
// then keeps a bright segment orbiting: the gift is running.
function GiftRing({
  gift,
  delay,
  primary,
}: {
  gift: Gift;
  delay: number;
  primary: boolean;
}) {
  const ring = primary ? "text-os-primary" : "text-os-accent";
  return (
    <li className="flex flex-col items-center gap-2 text-center">
      <div
        className={`relative ${primary ? "size-28" : "size-24"} ${gift.icon === "flames" ? "my-2" : ""}`}
        style={{ "--delay": `${delay}ms` } as CSSProperties}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden
          className="absolute inset-0 -rotate-90"
        >
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="4"
            className="stroke-os-line"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="4"
            pathLength={100}
            className={`gift-ring-fill stroke-current ${ring}`}
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="4"
            pathLength={100}
            className="gift-ring-orbit stroke-os-fg"
          />
        </svg>
        {gift.icon === "flames" && <FlameRing />}
        <GiftIconSvg
          icon={gift.icon}
          className={`absolute text-os-fg ${gift.icon === "meow" ? "inset-[12%]" : gift.icon === "flames" ? "inset-[16%]" : "inset-[22%]"}`}
        />
      </div>
      <h5 className="font-pixel text-[10px] uppercase leading-tight">
        {gift.name}
      </h5>
      <p className="text-xs text-os-muted">{gift.text}</p>
    </li>
  );
}

// The Dance of 1000 Flames: flames dancing round the ring (owner, 2026-09-25).
const FLAMES = 10;
function FlameRing() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      {Array.from({ length: FLAMES }, (_, i) => {
        const angle = (i / FLAMES) * 2 * Math.PI - Math.PI / 2;
        return (
          <span
            key={i}
            className="gift-flame absolute text-sm leading-none"
            style={
              {
                left: `${50 + Math.cos(angle) * 54}%`,
                top: `${50 + Math.sin(angle) * 54}%`,
                "--flame-delay": `${(i % 5) * 170}ms`,
              } as CSSProperties
            }
          >
            🔥
          </span>
        );
      })}
    </div>
  );
}

export function GiftsWindow() {
  return (
    <WinBody>
      <p className="font-mono text-xs uppercase text-os-muted">
        &gt; Installing gifts to TANKWA_TOWN… {GIFTS.intro}
      </p>
      <section aria-labelledby="gifts-primary" className="space-y-3">
        <Eyebrow id="gifts-primary">Primary</Eyebrow>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {GIFTS.primary.map((g, i) => (
            <GiftRing key={g.name} gift={g} delay={i * 180} primary />
          ))}
        </ul>
      </section>
      <section aria-labelledby="gifts-secondary" className="space-y-3">
        <Eyebrow id="gifts-secondary">Secondary</Eyebrow>
        <ul className="mx-auto grid max-w-sm grid-cols-2 gap-3">
          {GIFTS.secondary.map((g, i) => (
            <GiftRing
              key={g.name}
              gift={g}
              delay={720 + i * 180}
              primary={false}
            />
          ))}
        </ul>
      </section>
    </WinBody>
  );
}
