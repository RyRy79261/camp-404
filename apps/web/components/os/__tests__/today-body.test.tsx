import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomeModel } from "@/lib/home";
import type { TodayModel } from "@/lib/today";

// The Today gadget's body (the prototype's pop-out): its sections from the
// member's own home model, and a fresh read each time it opens.

const refresh = vi.hoisted(() => vi.fn());
vi.mock("@/app/(console)/today-actions", () => ({
  refreshTodayAction: refresh,
}));
vi.mock("@/components/push/enable-push", () => ({ EnablePush: () => null }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

import { TodayBody } from "../today-body";

function home(over: Partial<HomeModel> = {}): HomeModel {
  return {
    waitingForApproval: false,
    todos: [],
    tasks: [],
    tasksMore: 0,
    upcoming: [],
    calendarState: "ok",
    lift: null,
    checklist: [{ label: "Burner bio", done: true }],
    allDone: true,
    ...over,
  };
}

function model(over: Partial<HomeModel> = {}, burn = true): TodayModel {
  return {
    home: home(over),
    date: "Fri 25 Sept",
    burn: burn
      ? {
          year: 2027,
          name: "The Big Question",
          start: "2027-04-26",
          end: "2027-05-02",
          daysTo: 213,
          dayOf: null,
          runUp: { days: 358, gone: 145 },
        }
      : null,
    // Built long ago unless a test says otherwise: opening reads it again.
    builtAt: 0,
    userId: "member-nova",
  };
}

beforeEach(() => {
  refresh.mockReset();
  refresh.mockResolvedValue(null);
});
afterEach(cleanup);

describe("TodayBody", () => {
  it("heads itself with the day and what is waiting, then counts down to the Burn", async () => {
    render(
      <TodayBody
        initial={model({
          todos: [
            {
              id: "form:1",
              label: "Tent check",
              href: "/questionnaires/1",
              due: "Due tomorrow",
              urgent: true,
            },
          ],
        })}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Today · Fri 25 Sept")).toBeTruthy();
    expect(screen.getByText("1 waiting")).toBeTruthy();
    expect(screen.getByText("T-213")).toBeTruthy();
    expect(screen.getByText("AfrikaBurn 2027")).toBeTruthy();
    expect(screen.getByText("The Big Question")).toBeTruthy();
    const needs = screen.getByRole("list", { name: "Needs you" });
    const row = within(needs).getByRole("link", { name: /Tent check/ });
    expect(row.getAttribute("href")).toBe("/questionnaires/1");
    expect(within(row).getByText("Now")).toBeTruthy();
  });

  it("says all clear, and nothing on the calendar, when there is nothing", async () => {
    render(<TodayBody initial={model({}, false)} />);
    await act(async () => {});
    expect(screen.getByText("All clear")).toBeTruthy();
    expect(screen.getByText("Nothing waiting on you.")).toBeTruthy();
    expect(screen.getByText("Nothing on the calendar yet.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "My tasks" })).toBeNull();
    expect(screen.getByText("No open tasks. Nice.")).toBeTruthy();
    // The prototype's gadget has no greeting: its title is the heading.
    expect(
      screen.getByRole("heading", { level: 2, name: /^Today · / }),
    ).toBeTruthy();
    expect(screen.queryByText("Hi Nova")).toBeNull();
    // No year named yet: no countdown card.
    expect(screen.queryByText(/^T-/)).toBeNull();
  });

  it("lists the member's tasks with a link to them all, and marks their own team's events", async () => {
    render(
      <TodayBody
        initial={model({
          tasks: [
            {
              id: "task:1",
              label: "Pack the shade cloth",
              href: "/tasks",
              due: "Due in 10 days",
              urgent: false,
              doing: true,
            },
          ],
          tasksMore: 2,
          upcoming: [
            {
              id: "e1",
              title: "Kitchen briefing",
              when: "Sat 3 Oct · 18:00",
              relative: "In 7 days",
              location: null,
              kind: "event",
              sortKey: "2026-10-03T18:00",
              team: { label: "Kitchen", mine: true },
            },
          ],
        })}
      />,
    );
    await act(async () => {});
    const tasks = screen.getByRole("list", { name: "My tasks" });
    expect(within(tasks).getByText("Due in 10 days")).toBeTruthy();
    expect(within(tasks).getByText("Doing")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "All tasks (+2)" }).getAttribute("href"),
    ).toBe("/tasks");
    const event = within(
      screen.getByRole("list", { name: "Coming up" }),
    ).getByRole("listitem");
    expect(event.querySelectorAll("[data-mine]")).toHaveLength(1);
    // The prototype's row: a date tile, then "In 7 days · 18:00".
    expect(within(event).getByText("In 7 days · 18:00")).toBeTruthy();
    expect(within(event).getByText("Sat")).toBeTruthy();
    expect(within(event).getByText("3")).toBeTruthy();
  });

  it("tells an applicant they are waiting, and shows no lists", async () => {
    render(
      <TodayBody
        initial={model({ waitingForApproval: true, allDone: false })}
      />,
    );
    await act(async () => {});
    expect(screen.getByText("Waiting for a captain")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Needs you" })).toBeNull();
    expect(screen.queryByText("Coming up")).toBeNull();
  });

  it("reads Today again when it opens, and shows what came back", async () => {
    refresh.mockResolvedValue(
      model({
        todos: [
          {
            id: "form:2",
            label: "Bike check",
            href: "/questionnaires/2",
            due: null,
            urgent: false,
          },
        ],
      }),
    );
    render(<TodayBody initial={model()} />);
    expect(screen.getByText("Nothing waiting on you.")).toBeTruthy();
    await act(async () => {});
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("link", { name: /Bike check/ })).toBeTruthy();
    expect(screen.queryByText("Nothing waiting on you.")).toBeNull();
  });

  it("does not read Today again when its copy was built for this very load", async () => {
    render(<TodayBody initial={{ ...model(), builtAt: Date.now() }} />);
    await act(async () => {});
    expect(refresh).not.toHaveBeenCalled();
  });

  it("draws the year's run-up on the phone, and says how much is gone", async () => {
    const { container } = render(<TodayBody initial={model()} />);
    await act(async () => {});
    const bar = container.querySelector("[data-run-up]")!;
    expect(bar).toBeTruthy();
    // 145 of 358 days: 41%, 10 of the 24 blocks.
    expect(bar.textContent).toContain("41% of the year’s run-up gone.");
    expect(bar.querySelectorAll(".bg-os-primary")).toHaveLength(10);
  });

  it("keeps the copy it opened with when the refresh fails, and says it may be out of date", async () => {
    refresh.mockRejectedValue(new Error("offline"));
    render(
      <TodayBody
        userId="member-nova"
        initial={model({
          todos: [
            {
              id: "form:1",
              label: "Tent check",
              href: "/questionnaires/1",
              due: null,
              urgent: false,
            },
          ],
        })}
      />,
    );
    await act(async () => {});
    expect(screen.getByRole("link", { name: /Tent check/ })).toBeTruthy();
    expect(screen.getByText(/Couldn.t refresh Today just now/)).toBeTruthy();
  });

  it("shows no stale note when the refresh worked", async () => {
    refresh.mockResolvedValue(model());
    render(<TodayBody userId="member-nova" initial={model()} />);
    await act(async () => {});
    expect(screen.queryByText(/Couldn.t refresh Today/)).toBeNull();
  });
});

describe("Today belongs to one member", () => {
  const as = (userId: string, over: Partial<HomeModel> = {}) => ({
    ...model(over),
    userId,
  });
  const todo = (label: string) => ({
    todos: [
      { id: `form:${label}`, label, href: "/x", due: null, urgent: false },
    ],
  });

  it("never draws a read that answered for another member", async () => {
    refresh.mockResolvedValue(as("member-ada", todo("Ada's form")));
    render(<TodayBody userId="member-bo" />);
    await act(async () => {});
    expect(screen.queryByText("Ada's form")).toBeNull();
    expect(screen.getByText(/Couldn.t load Today/)).toBeTruthy();
  });

  it("drops the last member's Today when handed another member", async () => {
    refresh.mockResolvedValue(as("member-ada", todo("Ada's form")));
    const view = render(<TodayBody userId="member-ada" />);
    await act(async () => {});
    expect(screen.getByText("Ada's form")).toBeTruthy();
    // The same body, now drawn for someone else (no remount).
    refresh.mockReturnValue(new Promise(() => {}));
    view.rerender(<TodayBody userId="member-bo" />);
    expect(screen.queryByText("Ada's form")).toBeNull();
  });

  it("never opens with another member's last copy from this tab", async () => {
    refresh.mockResolvedValue(as("member-cy", todo("Cy's form")));
    const first = render(<TodayBody userId="member-cy" />);
    await act(async () => {});
    first.unmount();
    refresh.mockReturnValue(new Promise(() => {}));
    render(<TodayBody userId="member-di" />);
    expect(screen.queryByText("Cy's form")).toBeNull();
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
});
