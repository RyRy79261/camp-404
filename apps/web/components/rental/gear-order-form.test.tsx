import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/app/(console)/gear/actions", () => ({
  saveMyGearAction: vi.fn(async () => ({
    ok: true,
    data: { version: 1, status: "submitted" },
  })),
  changeMyGearAction: vi.fn(),
}));
vi.mock("@/app/(console)/captains/gear-rental/actions", () => ({
  fillRentalOrderAction: vi.fn(async () => ({
    ok: true,
    data: { version: 1 },
  })),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { fillRentalOrderAction } from "@/app/(console)/captains/gear-rental/actions";
import { saveMyGearAction } from "@/app/(console)/gear/actions";
import { GearOrderForm, type GearTent } from "./gear-order-form";

// The member's gear form (#241; owner, 2026-09-30). The tent is asked ONCE,
// by need, whatever tents the catalogue holds: a member never sees a
// catalogue tent and never picks one. Then one row per other item.

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const MATTRESS = "11111111-1111-4111-8111-111111111111";
const ITEMS = [
  {
    id: "44444444-4444-4444-8444-444444444444",
    name: "2-person tent",
    isTent: true,
    sleeps: 2,
    campPriceCents: 10_000,
    campStockCount: 4,
    supplierPriceCents: 25_000,
  },
  {
    id: "55555555-5555-4555-8555-555555555555",
    name: "4-person tent",
    isTent: true,
    sleeps: 4,
    campPriceCents: null,
    campStockCount: null,
    supplierPriceCents: 70_000,
  },
  {
    id: MATTRESS,
    name: "Mattress",
    isTent: false,
    sleeps: 1,
    campPriceCents: null,
    campStockCount: null,
    supplierPriceCents: 8_000,
  },
];
const MEMBERS = [
  { id: "fay", name: "Fay Friend" },
  { id: "sam", name: "Sam Second" },
];

function form(
  props: {
    tent?: GearTent | null;
    hostedBy?: string[];
    hostedLabel?: string | null;
    forMember?: { userId: string; name: string };
  } = {},
) {
  render(
    <GearOrderForm
      items={ITEMS}
      members={MEMBERS}
      version={0}
      tent={props.tent ?? null}
      lines={[]}
      hostedBy={props.hostedBy ?? []}
      hostedLabel={props.hostedLabel ?? null}
      forMember={props.forMember}
    />,
  );
}

const tentRadio = (name: string) =>
  within(screen.getByRole("radiogroup", { name: "Tent" })).getByRole("radio", {
    name: new RegExp(`^${name}`),
  }) as HTMLInputElement;
const cost = () =>
  screen.getByRole("status", { name: "What it may cost" }).textContent;
const send = () =>
  fireEvent.click(screen.getByRole("button", { name: "Send my order" }));

describe("the tent question", () => {
  it("is asked once, and never names a tent from the catalogue", () => {
    form();
    const tent = screen.getByRole("radiogroup", { name: "Tent" });
    expect(
      within(tent)
        .getAllByRole("radio")
        .map(
          (r) => r.closest("label")?.querySelector("span span")?.textContent,
        ),
    ).toEqual(["I have my own", "I need one", "I'm in someone else's tent"]);
    expect(document.body.textContent).not.toContain("2-person tent");
    expect(document.body.textContent).not.toContain("4-person tent");
    // The other items are still one row each.
    expect(
      within(screen.getByRole("list", { name: "Bedding" }))
        .getAllByRole("listitem")
        .map((li) => li.getAttribute("aria-label")),
    ).toEqual(["Mattress"]);
  });

  it("I need one: for how many people, who shares it, and a price range across every tent", async () => {
    form();
    fireEvent.click(tentRadio("I need one"));
    // One person: nobody to share with yet.
    expect(screen.queryByLabelText("Who shares it with you?")).toBeNull();
    expect(cost()).toMatch(/^R\s100,00 to R\s700,00$/);
    fireEvent.change(screen.getByLabelText("For how many people?"), {
      target: { value: "2" },
    });
    fireEvent.change(screen.getByLabelText("Who shares it with you?"), {
      target: { value: "fay" },
    });
    expect(
      screen.getByRole("list", { name: "Sharing the tent with" }).textContent,
    ).toContain("Fay Friend");
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenCalledExactlyOnceWith({
        tent: { choice: "need", people: 2, sharerIds: ["fay"] },
        lines: [],
        submit: true,
        expectedVersion: 0,
      }),
    );
  });

  it("I have my own: what it is and how many it sleeps, both optional, and nothing to pay", async () => {
    form();
    fireEvent.click(tentRadio("I have my own"));
    expect(cost()).toBe("Nothing");
    expect(screen.queryByLabelText("For how many people?")).toBeNull();
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenLastCalledWith({
        tent: {
          choice: "own",
          ownDescription: null,
          ownSleeps: null,
          sharerIds: [],
        },
        lines: [],
        submit: true,
        expectedVersion: 0,
      }),
    );
    fireEvent.change(screen.getByLabelText("What tent is it? (optional)"), {
      target: { value: " 3-person dome " },
    });
    fireEvent.change(screen.getByLabelText("It sleeps (optional)"), {
      target: { value: "3" },
    });
    fireEvent.change(screen.getByLabelText("Who shares it with you?"), {
      target: { value: "sam" },
    });
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          tent: {
            choice: "own",
            ownDescription: "3-person dome",
            ownSleeps: 3,
            sharerIds: ["sam"],
          },
        }),
      ),
    );
  });

  it("I'm in someone else's tent: names nobody, and says when nobody has put them in one", async () => {
    form();
    fireEvent.click(tentRadio("I.m in someone else.s tent"));
    expect(screen.getByTestId("tent-not-hosted").textContent).toContain(
      "Nobody has put you in their tent yet.",
    );
    expect(screen.queryByLabelText("Who shares it with you?")).toBeNull();
    expect(cost()).toBe("Nothing");
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenCalledExactlyOnceWith({
        tent: { choice: "shared" },
        lines: [],
        submit: true,
        expectedVersion: 0,
      }),
    );
  });

  it("shows a member someone put in their tent as content, with no locked radios", async () => {
    form({ hostedBy: ["Dee Member"], hostedLabel: "T3" });
    const hosted = screen.getByTestId("tent-hosted");
    expect(hosted.textContent).toContain(
      "You\u2019re in Dee Member\u2019s tent.",
    );
    expect(hosted.textContent).toContain(
      "Ask Dee Member to take you off if that\u2019s wrong.",
    );
    expect(screen.getByTestId("tent-label").textContent).toBe("T3");
    // The answer is content: no radio, greyed or not, to contradict it.
    expect(screen.queryByRole("radiogroup", { name: "Tent" })).toBeNull();
    expect(screen.queryByTestId("tent-not-hosted")).toBeNull();
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ tent: { choice: "shared" } }),
      ),
    );
  });

  it("shows a saved answer again", () => {
    form({ tent: { choice: "need", people: 3, sharerIds: ["fay", "sam"] } });
    expect(tentRadio("I need one").checked).toBe(true);
    expect(
      (screen.getByLabelText("For how many people?") as HTMLSelectElement)
        .value,
    ).toBe("3");
    expect(
      within(
        screen.getByRole("list", { name: "Sharing the tent with" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(2);
    // Fewer people than sharers: the extra sharer is not sent.
    fireEvent.change(screen.getByLabelText("For how many people?"), {
      target: { value: "2" },
    });
    expect(
      within(
        screen.getByRole("list", { name: "Sharing the tent with" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(1);
  });
});

describe("the other items", () => {
  it("are one row each: I have my own, or I need some", async () => {
    form();
    const mattress = screen.getByRole("listitem", { name: "Mattress" });
    fireEvent.click(within(mattress).getByRole("radio", { name: "I need" }));
    fireEvent.change(within(mattress).getByLabelText("How many Mattress"), {
      target: { value: "2" },
    });
    expect(cost()).toMatch(/^R\s160,00$/);
    send();
    await waitFor(() =>
      expect(saveMyGearAction).toHaveBeenCalledExactlyOnceWith({
        tent: null,
        lines: [{ itemId: MATTRESS, choice: "need", quantity: 2 }],
        submit: true,
        expectedVersion: 0,
      }),
    );
  });

  it("says what is missing instead of sending an empty order", () => {
    form();
    send();
    expect(screen.getByRole("alert").textContent).toBe(
      "Say what you have or what you need first.",
    );
    expect(saveMyGearAction).not.toHaveBeenCalled();
  });
});

describe("a captain filling it in", () => {
  it("asks in the member's name and sends it as theirs", async () => {
    form({ forMember: { userId: "tia", name: "Tia Third" } });
    fireEvent.click(tentRadio("They need one"));
    fireEvent.click(screen.getByRole("button", { name: "Save for them" }));
    await waitFor(() =>
      expect(fillRentalOrderAction).toHaveBeenCalledExactlyOnceWith({
        userId: "tia",
        tent: { choice: "need", people: 1, sharerIds: [] },
        lines: [],
        expectedVersion: 0,
      }),
    );
    expect(saveMyGearAction).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Save as a draft" }),
    ).toBeNull();
  });
});
