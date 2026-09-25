// The landing page's glitched "404", set to any text and size.
export function GlitchWordmark({ text, size }: { text: string; size: string }) {
  return (
    <div
      aria-hidden
      className="camp404-glitch-shake relative select-none leading-none"
      style={{ "--glitch-size": size } as React.CSSProperties}
    >
      <span className="camp404-glitch-base">{text}</span>
      <span className="camp404-glitch-rgb camp404-glitch-rgb-magenta">
        {text}
      </span>
      <span className="camp404-glitch-rgb camp404-glitch-rgb-cyan">{text}</span>
      <span className="camp404-glitch-tear camp404-glitch-tear-a">{text}</span>
      <span className="camp404-glitch-tear camp404-glitch-tear-b">{text}</span>
    </div>
  );
}
