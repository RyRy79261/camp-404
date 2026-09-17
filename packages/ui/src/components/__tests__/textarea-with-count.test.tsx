import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TextareaWithCount } from "../textarea-with-count";

// The count under a long answer: quiet until the last tenth of the limit, then
// announced and in the warning colour.

afterEach(cleanup);

describe("TextareaWithCount", () => {
  it("shows the count, links it to the box, and stays quiet far from the limit", () => {
    render(
      <TextareaWithCount
        id="bio"
        aria-label="Bio"
        value="Hello"
        maxLength={100}
        onChange={() => {}}
      />,
    );
    const count = screen.getByText("5 / 100");
    expect(count.getAttribute("aria-live")).toBe("off");
    expect(screen.getByLabelText("Bio").getAttribute("aria-describedby")).toBe(
      "bio-count",
    );
    expect(screen.getByLabelText("Bio").getAttribute("maxlength")).toBe("100");
  });

  it("announces the count near the limit", () => {
    render(
      <TextareaWithCount
        aria-label="Bio"
        value={"x".repeat(90)}
        maxLength={100}
        onChange={() => {}}
      />,
    );
    const count = screen.getByText("90 / 100");
    expect(count.getAttribute("aria-live")).toBe("polite");
    expect(count.className).toContain("text-warning");
  });
});
