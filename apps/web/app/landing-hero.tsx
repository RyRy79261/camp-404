import { Button } from "@camp404/ui/components/button";

export function LandingHero() {
  return (
    <main className="relative min-h-[100dvh] overflow-hidden bg-[color:var(--color-background)]">
      <div
        aria-hidden
        className="camp404-scanlines pointer-events-none absolute inset-0 z-0"
      />
      <div
        aria-hidden
        className="camp404-noise pointer-events-none absolute inset-0 z-0 opacity-[0.06]"
      />
      <div
        aria-hidden
        className="camp404-scanbeam pointer-events-none absolute inset-x-0 top-0 z-0 h-24"
      />

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-md flex-col items-center justify-between gap-10 px-6 pb-10 pt-14 sm:max-w-xl sm:pt-20">
        <div className="flex flex-col items-center gap-3">
          <h1 className="text-[10px] uppercase tracking-[0.5em] text-[color:var(--color-muted-foreground)]">
            Camp 404
          </h1>
          <p className="camp404-chromatic font-mono text-[11px] uppercase tracking-[0.3em] text-[color:var(--color-foreground)]">
            Error 404 — Camp not found
          </p>
        </div>

        <Glitch404 />

        <div className="flex w-full max-w-xs flex-col items-center gap-2">
          <Button asChild size="lg" className="w-full">
            <a href="/signup">Are you lost?</a>
          </Button>
          <Button
            asChild
            variant="link"
            className="text-[color:var(--color-accent)]"
          >
            <a href="/auth/sign-in">Already found</a>
          </Button>
          <p
            aria-hidden
            className="camp404-cursor mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-[color:var(--color-muted-foreground)]"
          >
            $ awaiting input_
          </p>
        </div>
      </div>

      <style>{glitchStyles}</style>
    </main>
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

/* All bespoke glitch CSS lives here so the rest of the design system
   stays clean. References --color-foreground / accent / primary tokens. */
const glitchStyles = `
  .camp404-chromatic {
    text-shadow:
      -1.5px 0 0 rgba(255, 0, 128, 0.8),
       1.5px 0 0 rgba(0, 200, 255, 0.8);
  }

  .camp404-scanlines {
    background-image: repeating-linear-gradient(
      to bottom,
      transparent 0,
      transparent 2px,
      rgba(255, 255, 255, 0.045) 2px,
      rgba(255, 255, 255, 0.045) 3px
    );
  }

  .camp404-noise {
    background-image:
      radial-gradient(rgba(255,255,255,0.6) 0.5px, transparent 0.5px),
      radial-gradient(rgba(255,255,255,0.4) 0.5px, transparent 0.5px);
    background-size: 3px 3px, 7px 7px;
    background-position: 0 0, 1px 1px;
    mix-blend-mode: overlay;
  }

  .camp404-scanbeam {
    background: linear-gradient(
      to bottom,
      transparent 0%,
      rgba(180, 100, 255, 0.05) 40%,
      rgba(255, 0, 200, 0.1) 50%,
      rgba(180, 100, 255, 0.05) 60%,
      transparent 100%
    );
    animation: camp404-scanbeam 7s linear infinite;
  }
  @keyframes camp404-scanbeam {
    0%   { transform: translateY(-100%); }
    100% { transform: translateY(2200%); }
  }

  /* ---- Giant glitched "404" ---- */

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
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-weight: 900;
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
  }

  .camp404-glitch-rgb-magenta {
    color: rgba(255, 0, 140, 0.85);
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
    color: rgba(0, 220, 255, 0.85);
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

  /* Blinking terminal cursor underscore. */
  .camp404-cursor::after { content: ""; }
  .camp404-cursor {
    animation: camp404-cursor-blink 1.05s steps(1) infinite;
  }
  @keyframes camp404-cursor-blink {
    0%, 49%   { opacity: 1; }
    50%, 100% { opacity: 0.35; }
  }
`;
