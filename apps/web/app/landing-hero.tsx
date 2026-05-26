"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Caveat } from "next/font/google";
import { Button } from "@camp404/ui/components/button";

const caveat = Caveat({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "600"],
});

type Variant = "a" | "b" | "c";

const STORAGE_KEY = "camp404-landing-variant";

export function LandingHero() {
  const [variant, setVariant] = useState<Variant>("a");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "a" || saved === "b" || saved === "c") {
      setVariant(saved);
    }
  }, []);

  function pick(v: Variant) {
    setVariant(v);
    window.localStorage.setItem(STORAGE_KEY, v);
  }

  return (
    <>
      <main className="relative flex min-h-[100dvh] flex-col items-center justify-between gap-8 overflow-hidden px-6 pb-24 pt-10 sm:pt-16">
        {variant === "a" && <FrameA />}
        {variant === "b" && <FrameB />}
        {variant === "c" && <FrameC />}
      </main>
      <VariantToggle current={variant} onPick={pick} />
      <style>{landingStyles}</style>
    </>
  );
}

const landingStyles = `
  @keyframes camp404-flicker {
    0%, 92%, 96%, 100% { opacity: 1; }
    93%, 95% { opacity: 0.62; }
    94% { opacity: 0.88; }
  }
  .camp404-flicker { animation: camp404-flicker 8s infinite; }
  .camp404-scanline {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 3px,
      rgba(255, 255, 255, 0.05) 3px,
      rgba(255, 255, 255, 0.05) 4px
    );
  }
  .camp404-chromatic {
    text-shadow:
      -1.5px 0 0 rgba(255, 0, 128, 0.7),
       1.5px 0 0 rgba(0, 200, 255, 0.7);
  }
  .camp404-vignette {
    -webkit-mask-image: radial-gradient(
      ellipse 78% 68% at 50% 48%,
      black 22%,
      transparent 92%
    );
    mask-image: radial-gradient(
      ellipse 78% 68% at 50% 48%,
      black 22%,
      transparent 92%
    );
  }
`;

function NeonPhoto({
  flicker = false,
  scanline = false,
}: {
  flicker?: boolean;
  scanline?: boolean;
}) {
  return (
    <div className="relative aspect-[1080/694] w-full max-w-[640px]">
      <Image
        src="/landing/sign-404.jpg"
        alt="The Camp 404 neon sign — blue 4s flanking a magenta 0 lit at night"
        fill
        priority
        sizes="(max-width: 640px) 100vw, 640px"
        unoptimized
        className={`camp404-vignette object-cover ${flicker ? "camp404-flicker" : ""}`}
      />
      <div
        aria-hidden
        className="camp404-vignette pointer-events-none absolute inset-0 bg-[color:var(--color-background)] opacity-30"
      />
      {scanline ? (
        <div
          aria-hidden
          className="camp404-vignette camp404-scanline pointer-events-none absolute inset-0 opacity-60"
        />
      ) : null}
    </div>
  );
}

function CTAs() {
  return (
    <div className="flex w-full max-w-xs flex-col items-center gap-3">
      <Button asChild size="lg" className="w-full">
        <a href="/signup">Sign up</a>
      </Button>
      <Button
        asChild
        variant="link"
        className="text-[color:var(--color-accent)]"
      >
        <a href="/auth/sign-in">Already a 404er? Sign in</a>
      </Button>
    </div>
  );
}

function FrameA() {
  return (
    <>
      <h1 className="text-xs uppercase tracking-[0.4em] text-[color:var(--color-muted-foreground)]">
        Camp 404
      </h1>
      <NeonPhoto />
      <div className="flex flex-col items-center gap-6">
        <p className="max-w-sm text-center text-sm text-[color:var(--color-muted-foreground)]">
          A calm command centre for a chaotic desert.
        </p>
        <CTAs />
      </div>
    </>
  );
}

function FrameB() {
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <h1 className="text-xs uppercase tracking-[0.4em] text-[color:var(--color-muted-foreground)]">
          Camp 404
        </h1>
        <p
          className="camp404-chromatic font-mono text-[10px] uppercase tracking-[0.25em] text-[color:var(--color-muted-foreground)]"
          aria-hidden
        >
          Error 404 — location not on any map
        </p>
      </div>
      <NeonPhoto flicker scanline />
      <div className="flex flex-col items-center gap-6">
        <p className="max-w-sm text-center text-sm text-[color:var(--color-muted-foreground)]">
          <span className="line-through opacity-60">
            The page you requested could not be found.
          </span>{" "}
          A calm command centre for a chaotic desert.
        </p>
        <CTAs />
      </div>
    </>
  );
}

function FrameC() {
  return (
    <>
      <div className="flex flex-col items-center gap-2">
        <h1
          className={`${caveat.className} -rotate-1 text-3xl text-[color:var(--color-foreground)]`}
        >
          Camp 404
        </h1>
        <p
          aria-hidden
          className={`${caveat.className} -rotate-2 text-xl text-[color:var(--color-accent)]`}
        >
          you are here ↓
        </p>
      </div>
      <div className="relative w-full max-w-[640px]">
        <NeonPhoto />
        <span
          aria-hidden
          className={`${caveat.className} pointer-events-none absolute bottom-2 right-4 -rotate-6 text-lg text-[color:var(--color-accent)]`}
        >
          adopted?
        </span>
      </div>
      <div className="flex flex-col items-center gap-5">
        <p className="max-w-sm text-center text-sm text-[color:var(--color-muted-foreground)]">
          A calm command centre for a chaotic desert.
        </p>
        <div className="relative">
          <span
            aria-hidden
            className={`${caveat.className} absolute -left-14 top-1 -rotate-12 whitespace-nowrap text-xl text-[color:var(--color-accent)]`}
          >
            lost? →
          </span>
          <CTAs />
        </div>
      </div>
    </>
  );
}

function VariantToggle({
  current,
  onPick,
}: {
  current: Variant;
  onPick: (v: Variant) => void;
}) {
  const items: { id: Variant; label: string; hint: string }[] = [
    { id: "a", label: "A", hint: "clean neon melt" },
    { id: "b", label: "B", hint: "glitchy broken" },
    { id: "c", label: "C", hint: "hand scrawled" },
  ];
  return (
    <div className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-card)]/85 p-1 text-xs shadow-lg backdrop-blur-md">
      <div className="flex items-center gap-1">
        <span className="px-2 text-[color:var(--color-muted-foreground)]">
          preview
        </span>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick(item.id)}
            aria-pressed={current === item.id}
            title={item.hint}
            className={
              "rounded-full px-3 py-1 transition-colors " +
              (current === item.id
                ? "bg-[color:var(--color-primary)] text-[color:var(--color-primary-foreground)]"
                : "text-[color:var(--color-foreground)] hover:bg-[color:var(--color-muted)]")
            }
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
