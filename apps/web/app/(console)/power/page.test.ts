import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`redirect:${to}`);
  }),
}));

import { POWER_LOADS_PATH } from "@/lib/power-copy";
import PowerPage from "./page";

describe("/power", () => {
  it("sends the Power nav entry on to the load list", () => {
    expect(() => PowerPage()).toThrow(`redirect:${POWER_LOADS_PATH}`);
  });
});
