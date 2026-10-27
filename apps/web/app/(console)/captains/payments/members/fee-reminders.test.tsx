import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { REMINDERS_NEED_COLLECTING } from "@camp404/core";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
const actions = vi.hoisted(() => ({
  askForPledgesAction: vi.fn(async () => ({
    ok: true,
    data: { asked: 1, notified: 1 },
  })),
  remindFeesOwedAction: vi.fn(async () => ({
    ok: true,
    data: { reminded: 5, notified: 5, posted: 1 },
  })),
  setCollectingFeesAction: vi.fn(async () => ({
    ok: true,
    data: { version: 2 },
  })),
}));
vi.mock("../camp-money-actions", () => actions);
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { CollectingSwitch } from "./collecting-switch";
import { FeeReminderButtons, type ReminderPreview } from "./fee-reminders";

// Who owes what's reminders (camp fees sprint, mock-up step 2): the dialog
// says who it reaches with their own next payment, who is left out for
// saying Not coming (Who? names them), who asked for a subsidy, and offers a
// general Telegram post only where Ol' Jeb posts.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function person(name: string, rands: number, telegram: boolean) {
  return {
    userId: name,
    name,
    next: {
      kind: "due" as const,
      dueOn: "2026-11-30",
      amountCents: rands * 100,
      overdue: false,
      first: true,
      source: "pledge" as const,
    },
    owingCents: rands * 200,
    telegram,
  };
}

function preview(over: Partial<ReminderPreview> = {}): ReminderPreview {
  return {
    collecting: true,
    remind: {
      reach: [
        person("Caitlin", 2000, true),
        person("Lerato", 3600, true),
        person("Michael", 16000, false),
        person("Thabo", 2000, false),
        person("Cloud", 7200, false),
      ],
      notComing: ["Bongi", "Kyle", "Tash"],
      subsidy: ["Sam"],
    },
    ask: { reach: [{ userId: "q", name: "Quinn" }], notComing: [] },
    telegramPlaces: 1,
    ...over,
  };
}

describe("Remind who still owes", () => {
  it("says who it reaches, who is left out and who is not reminded", async () => {
    render(<FeeReminderButtons preview={preview()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remind who still owes" }),
    );
    expect(
      screen.getByRole("heading", { name: "Remind 5 members who still owe?" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        /Reaches 5 people who still owe\. Left out: 3 who said Not coming this year\./,
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Bongi, Kyle, Tash")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Who?" }));
    expect(screen.getByText("Bongi, Kyle, Tash")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Who is reminded" });
    expect(list.textContent).toContain("Lerato");
    expect(list.textContent).toContain("Ol' Jeb");
    expect(list.textContent).toContain("+ 1 more (Cloud)");
    expect(screen.getByText(/\(2 of 5\)/)).toBeTruthy();
    expect(
      screen.getByText(/Sam asked for a subsidy, so is not reminded\./),
    ).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send 5 reminders" }));
    });
    expect(actions.remindFeesOwedAction).toHaveBeenCalledWith({
      postInTelegram: true,
    });
  });

  it("posts nothing in Telegram when the tick is off, or there is nowhere to post", async () => {
    const { rerender } = render(<FeeReminderButtons preview={preview()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remind who still owes" }),
    );
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Also post a general reminder in Telegram/,
      }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send 5 reminders" }));
    });
    expect(actions.remindFeesOwedAction).toHaveBeenLastCalledWith({
      postInTelegram: false,
    });
    rerender(<FeeReminderButtons preview={preview({ telegramPlaces: 0 })} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remind who still owes" }),
    );
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("will not send while collecting is off, and says why", () => {
    render(<FeeReminderButtons preview={preview({ collecting: false })} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Remind who still owes" }),
    );
    expect(screen.getByText(REMINDERS_NEED_COLLECTING)).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Send 5 reminders",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("Ask everyone to pledge", () => {
  it("names who has not pledged and asks them", async () => {
    render(<FeeReminderButtons preview={preview()} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Ask everyone to pledge" }),
    );
    expect(
      screen.getByRole("heading", { name: "Ask 1 member to pledge?" }),
    ).toBeTruthy();
    expect(screen.getByText("Quinn")).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Ask 1 member" }));
    });
    expect(actions.askForPledgesAction).toHaveBeenCalled();
  });
});

describe("Collecting fees", () => {
  it("switches on against the year's version it read", async () => {
    render(<CollectingSwitch on={false} version={3} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("switch", { name: "Collecting fees" }));
    });
    expect(actions.setCollectingFeesAction).toHaveBeenCalledWith({
      on: true,
      expectedVersion: 3,
    });
  });
});
