import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueueCard } from "../queue-card";

afterEach(cleanup);

describe("QueueCard", () => {
  it("links a next-up row to its form, with the deadline in camp time", () => {
    render(
      <QueueCard
        title="Photo consent"
        status="next-up"
        blocking={false}
        // 22:30 UTC on the 30th is 00:30 on 1 Oct in South Africa.
        dueAt={new Date("2026-09-30T22:30:00Z")}
        href="/questionnaires/act-1"
      />,
    );
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/questionnaires/act-1");
    expect(link.textContent).toContain("Photo consent");
    expect(link.textContent).toContain("Optional");
    expect(link.textContent).toContain("Due 1 Oct");
  });

  it("marks a blocking row Required", () => {
    render(<QueueCard title="Safety" status="next-up" blocking href="/q/1" />);
    expect(screen.getByText("Required")).toBeTruthy();
  });

  it("renders complete, locked and expired rows as inert", () => {
    const { rerender } = render(
      <QueueCard
        title="Safety"
        status="complete"
        blocking
        completedAt={new Date("2026-09-02T10:00:00Z")}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Done 2 Sept")).toBeTruthy();

    rerender(<QueueCard title="Agreements" status="locked" blocking />);
    expect(screen.queryByRole("link")).toBeNull();

    rerender(<QueueCard title="Dietary" status="expired" blocking />);
    expect(screen.getByText("Expired — contact a captain")).toBeTruthy();
  });
});
