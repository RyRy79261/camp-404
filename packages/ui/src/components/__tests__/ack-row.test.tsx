import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AckRow } from "../checkbox";

// A checkbox row you can tap anywhere, at least 44px tall.

afterEach(cleanup);

describe("AckRow", () => {
  it("toggles when the text is tapped, and names the checkbox by it", () => {
    const onCheckedChange = vi.fn();
    render(
      <AckRow checked={false} onCheckedChange={onCheckedChange}>
        Also post an announcement
      </AckRow>,
    );
    fireEvent.click(screen.getByText("Also post an announcement"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(
      screen.getByRole("checkbox", { name: "Also post an announcement" }),
    ).toBeTruthy();
  });

  it("is a 44px target and dims when disabled", () => {
    render(
      <AckRow checked={false} disabled>
        Locked
      </AckRow>,
    );
    const row = screen.getByText("Locked").closest("label")!;
    expect(row.className).toContain("min-h-[44px]");
    expect(row.className).toContain("has-[:disabled]:opacity-60");
  });
});
