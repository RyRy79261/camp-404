// Pure shake-detection state machine + magnitude helper, framework-agnostic.
// No React, no DOM, no env, no I/O — so the algorithm can be unit-tested
// directly. The app layer (use-shake-gesture) wraps this with the React hook
// and DOM permission helpers.

export interface ShakeSample {
  x: number;
  y: number;
  z: number;
}

export interface ShakeDetectorConfig {
  /**
   * Change in total acceleration magnitude (m/s²) between samples that counts
   * as a jolt. Magnitude is rotation-invariant: tilting the device
   * redistributes gravity across the axes but leaves the magnitude near 9.8,
   * so only real movement — not reorientation — registers.
   */
  threshold: number;
  /** Number of jolts within the rolling window required to fire. */
  requiredJolts: number;
  /** Rolling window the jolts must fall within. */
  windowMs: number;
  /** Minimum gap between two consecutive detections. */
  cooldownMs: number;
}

function magnitude(sample: ShakeSample): number {
  return Math.sqrt(
    sample.x * sample.x + sample.y * sample.y + sample.z * sample.z,
  );
}

/**
 * Pure shake-detection state machine. Feed it accelerometer samples via
 * `process` and it returns `true` on the sample that completes a shake.
 * Kept free of React/DOM so the algorithm can be unit-tested directly.
 */
export function createShakeDetector(config: ShakeDetectorConfig) {
  let lastMagnitude: number | null = null;
  let lastShakeAt = Number.NEGATIVE_INFINITY;
  let jolts: number[] = [];

  return {
    process(sample: ShakeSample, now: number): boolean {
      const mag = magnitude(sample);
      if (lastMagnitude !== null) {
        const delta = Math.abs(mag - lastMagnitude);
        if (delta > config.threshold) jolts.push(now);
      }
      lastMagnitude = mag;

      jolts = jolts.filter((t) => now - t <= config.windowMs);
      if (
        jolts.length >= config.requiredJolts &&
        // `>=` so a gap of exactly cooldownMs counts — the field is a *minimum*
        // gap, and this matches the inclusive (`<=`) window boundary above.
        now - lastShakeAt >= config.cooldownMs
      ) {
        lastShakeAt = now;
        jolts = [];
        return true;
      }
      return false;
    },
  };
}
