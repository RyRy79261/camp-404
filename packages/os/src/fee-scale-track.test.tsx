import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { FeeScaleTrack, feeScaleMax } from "./fee-scale-track";

// The fee scale both apps draw: the slider is a native range named by the
// caller, an amount past the scale's end rests the needle and thumb at the end
// (a member may commit more than Perfect World), and a slide reports whole
// rands.

function track(rands: number, onRandsChange = vi.fn()) {
  return render(
    <FeeScaleTrack
      id="fee"
      rands={rands}
      onRandsChange={onRandsChange}
      max={18_000}
      subsidyBelow={3_500}
      subsidyName="Subsidy"
      marks={[
        { key: "essential", name: "Essential", rands: 3_500, side: "above" },
        {
          key: "recommended",
          name: "★ Recommended",
          rands: 7_200,
          side: "below",
          lit: true,
        },
      ]}
      label="What I can commit, in rands"
      valueText={`R${rands}`}
    />,
  );
}

describe("FeeScaleTrack", () => {
  it("is a range named by the caller, at the amount", () => {
    track(7_200);
    const slider = screen.getByRole<HTMLInputElement>("slider", {
      name: "What I can commit, in rands",
    });
    expect(slider.value).toBe("7200");
    expect(slider.getAttribute("aria-valuetext")).toBe("R7200");
    expect(screen.getByText("★ Recommended")).toBeTruthy();
  });

  it("rests at the end for an amount past the scale", () => {
    const { container } = track(40_000);
    expect(screen.getByRole<HTMLInputElement>("slider").value).toBe("18000");
    const needle = container.querySelector<HTMLElement>("[data-fee-needle]");
    expect(needle?.style.left).toBe("100%");
  });

  it("reports a slide in whole rands", () => {
    const onChange = vi.fn();
    track(7_200, onChange);
    fireEvent.change(screen.getByRole("slider"), {
      target: { value: "8000" },
    });
    expect(onChange).toHaveBeenCalledWith(8_000);
  });

  it("ends an eighth past the top mark, to the nearest R100", () => {
    expect(feeScaleMax(16_000)).toBe(18_000);
    expect(feeScaleMax(10_050)).toBe(11_300);
  });
});
