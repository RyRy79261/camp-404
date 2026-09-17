import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TeamBadge } from "./roster-presentation";

// TeamBadge gained a config-aware `label` in Phase 2 so a captain's relabel
// shows on the profile chips, not just the roster filter. It must still fall
// back to the humanizer when the caller didn't resolve a label.
describe("TeamBadge", () => {
  it("humanises the enum key when no label is given", () => {
    render(<TeamBadge team="art_and_activities" />);
    expect(screen.getByText("Art and Activities")).toBeTruthy();
  });

  it("prefers the configured label over the humanizer", () => {
    render(<TeamBadge team="art_and_activities" label="Creative Crew" />);
    expect(screen.getByText("Creative Crew")).toBeTruthy();
    expect(screen.queryByText("Art and Activities")).toBeNull();
  });
});
