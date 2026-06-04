"use client";

import * as React from "react";
import { cn } from "@camp404/ui/lib/utils";

interface WaveformProps {
  /** AnalyserNode from the active recording stream, or null when idle. */
  analyser: AnalyserNode | null;
  /** Whether the recorder is actively capturing. */
  active: boolean;
  className?: string;
}

/**
 * Small canvas-based time-domain waveform. Reads from the supplied
 * AnalyserNode on each animation frame and paints a single-stroke wave.
 * Purely an affordance — "the mic is hearing you" — the bytes never
 * leave the canvas.
 */
export function Waveform({ analyser, active, className }: WaveformProps) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = canvas;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;
    ctx.scale(dpr, dpr);

    let frame = 0;
    const buffer = analyser ? new Uint8Array(analyser.fftSize) : null;

    function drawIdle() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, clientWidth, clientHeight);
      const idle = getComputedStyle(canvas).color || "#000";
      ctx.strokeStyle = `color-mix(in oklch, ${idle} 25%, transparent)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, clientHeight / 2);
      ctx.lineTo(clientWidth, clientHeight / 2);
      ctx.stroke();
    }

    function draw() {
      if (!ctx || !canvas || !analyser || !buffer) {
        drawIdle();
        return;
      }
      analyser.getByteTimeDomainData(buffer);
      ctx.clearRect(0, 0, clientWidth, clientHeight);

      const style = getComputedStyle(canvas);
      const primary = style.getPropertyValue("color") || "#000";
      ctx.strokeStyle = primary;
      ctx.lineWidth = 1.5;
      ctx.beginPath();

      const sliceWidth = clientWidth / buffer.length;
      let x = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] ?? 128) / 128.0; // 0..2, centred on 1
        const y = (v * clientHeight) / 2;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += sliceWidth;
      }
      ctx.stroke();
      frame = requestAnimationFrame(draw);
    }

    // Respect prefers-reduced-motion: paint a single static flat line instead
    // of spinning up the RAF loop. Guard matchMedia — some embedded webviews
    // (e.g. the Capacitor native path) don't ship it, and calling it would throw.
    const allowsMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    const animates = Boolean(active && analyser && allowsMotion);
    if (animates) {
      frame = requestAnimationFrame(draw);
    } else {
      drawIdle();
    }

    return () => cancelAnimationFrame(frame);
  }, [analyser, active]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={cn(
        "h-6 w-full text-primary",
        !active && "opacity-40",
        className,
      )}
    />
  );
}
