import Link from "next/link";
import { Tent } from "lucide-react";
import { Button } from "@camp404/ui/components/button";

// The signed-out `/`, in the AfrikaBurn landing page's composition: a header
// with the brand mark, a hero (eyebrow, heading, copy, one call to action) and
// a footer. The glitched "404" is Camp 404's identity motif, standing where the
// AfrikaBurn page puts its quilt band.
export function LandingHero() {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent text-accent-foreground">
              <Tent className="h-4 w-4" aria-hidden />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight">
                Camp 404
              </span>
              <span className="font-mono text-[0.65rem] uppercase tracking-[0.25em] text-accent">
                Camp console
              </span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-12 sm:px-6">
        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex flex-col gap-5">
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">
              Error 404 — Camp not found
            </p>
            <h1 className="max-w-3xl text-4xl tracking-tight sm:text-6xl">
              Camp 404
            </h1>
            <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
              A calm command centre for a chaotic desert.
            </p>
            <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button asChild size="lg">
                <a href="/auth/sign-in">Are you lost?</a>
              </Button>
            </div>
          </div>

          <Glitch404 />
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm font-medium text-foreground">Camp 404</p>
          <div className="flex items-center gap-4">
            <Link
              href="/privacy"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Privacy
            </Link>
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              Invite-only
            </p>
          </div>
        </div>
      </footer>

      <style>{glitchStyles}</style>
    </div>
  );
}

function Glitch404() {
  return (
    <div
      className="camp404-glitch-shake relative leading-none select-none"
      aria-hidden
    >
      <span className="camp404-glitch-base">404</span>
      <span
        className="camp404-glitch-rgb camp404-glitch-rgb-magenta"
        aria-hidden
      >
        404
      </span>
      <span className="camp404-glitch-rgb camp404-glitch-rgb-cyan" aria-hidden>
        404
      </span>
      <span className="camp404-glitch-tear camp404-glitch-tear-a" aria-hidden>
        404
      </span>
      <span className="camp404-glitch-tear camp404-glitch-tear-b" aria-hidden>
        404
      </span>
    </div>
  );
}

/* The glitch's CSS lives here so the rest of the design system stays clean.
   Colours are the theme tokens: the foreground and the Camp 404 magenta and
   blue. */
const glitchStyles = `
  .camp404-glitch-shake {
    animation: camp404-shake 5s steps(1) infinite;
  }
  @keyframes camp404-shake {
    0%, 4%, 8%, 100% { transform: translate(0, 0); }
    2%   { transform: translate(-1px, 1px); }
    6%   { transform: translate(2px, -1px); }
    18%  { transform: translate(-2px, 0); }
    19%  { transform: translate(1px, 1px); }
    20%, 99% { transform: translate(0, 0); }
  }

  .camp404-glitch-base,
  .camp404-glitch-rgb,
  .camp404-glitch-tear {
    display: block;
    font-family: inherit;
    font-weight: 800;
    font-size: clamp(7rem, 30vw, 14rem);
    letter-spacing: -0.05em;
    line-height: 0.9;
    text-align: center;
  }

  .camp404-glitch-base {
    color: var(--color-foreground);
    position: relative;
  }

  .camp404-glitch-rgb {
    position: absolute;
    inset: 0;
    pointer-events: none;
    mix-blend-mode: screen;
    opacity: 0.85;
  }

  .camp404-glitch-rgb-magenta {
    color: var(--color-camp-magenta);
    animation: camp404-rgb-magenta 3.7s steps(1) infinite;
  }
  @keyframes camp404-rgb-magenta {
    0%, 100% { transform: translate(0, 0); }
    10%      { transform: translate(-4px, 0); }
    11%      { transform: translate(-2px, 2px); }
    30%      { transform: translate(-3px, -1px); }
    50%      { transform: translate(-5px, 0); }
    70%      { transform: translate(-2px, 1px); }
    90%      { transform: translate(-4px, 0); }
  }

  .camp404-glitch-rgb-cyan {
    color: var(--color-camp-blue);
    animation: camp404-rgb-cyan 3.7s steps(1) infinite;
  }
  @keyframes camp404-rgb-cyan {
    0%, 100% { transform: translate(0, 0); }
    10%      { transform: translate(4px, 0); }
    11%      { transform: translate(2px, -2px); }
    30%      { transform: translate(3px, 1px); }
    50%      { transform: translate(5px, 0); }
    70%      { transform: translate(2px, -1px); }
    90%      { transform: translate(4px, 0); }
  }

  /* Two clip-path "tear" layers slice the 404 horizontally and yank
     the slice sideways for one frame — that's the broken-display
     feel. Each layer runs on its own offset cycle. */
  .camp404-glitch-tear {
    position: absolute;
    inset: 0;
    pointer-events: none;
    color: var(--color-foreground);
    mix-blend-mode: screen;
  }
  .camp404-glitch-tear-a {
    animation: camp404-tear-a 4.3s steps(1) infinite;
  }
  .camp404-glitch-tear-b {
    animation: camp404-tear-b 5.1s steps(1) infinite;
  }
  @keyframes camp404-tear-a {
    0%, 8%, 100% { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
    9%   { clip-path: inset(20% 0 70% 0); transform: translate(8px, 0); }
    11%  { clip-path: inset(35% 0 55% 0); transform: translate(-6px, 0); }
    13%  { clip-path: inset(50% 0 40% 0); transform: translate(10px, 0); }
    15%  { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
    40%  { clip-path: inset(15% 0 75% 0); transform: translate(-12px, 0); }
    42%  { clip-path: inset(45% 0 45% 0); transform: translate(6px, 0); }
    44%  { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
  }
  @keyframes camp404-tear-b {
    0%, 20%, 100% { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
    22%  { clip-path: inset(60% 0 25% 0); transform: translate(-10px, 0); }
    24%  { clip-path: inset(75% 0 10% 0); transform: translate(4px, 0); }
    26%  { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
    65%  { clip-path: inset(8% 0 80% 0); transform: translate(7px, 0); }
    67%  { clip-path: inset(28% 0 60% 0); transform: translate(-5px, 0); }
    69%  { clip-path: inset(100% 0 0 0); transform: translate(0, 0); }
  }

  /* Reduced motion: a still glitch. The global rule would stop each loop on
     its last frame; these pick the frame worth keeping instead: the tears
     hidden, the colour fringes held a little apart. */
  @media (prefers-reduced-motion: reduce) {
    .camp404-glitch-tear { display: none; }
    .camp404-glitch-shake { animation: none; }
    .camp404-glitch-rgb-magenta { animation: none; transform: translate(-3px, 0); }
    .camp404-glitch-rgb-cyan { animation: none; transform: translate(3px, 0); }
  }
`;
