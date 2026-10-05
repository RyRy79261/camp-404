import type { LoadBand } from "@camp404/core";

// The generator load bands' colours and words, for the Power and Lighting
// team program's power glance. The Power program itself opens each section on
// a plain sentence instead (components/power/power-ui).

export const BAND_BAR: Record<LoadBand, string> = {
  green: "bg-success",
  amber: "bg-warning",
  red: "bg-destructive",
};

export const BAND_TEXT: Record<LoadBand, string> = {
  green: "Comfortable",
  amber: "Working hard",
  red: "Too close to the limit",
};
