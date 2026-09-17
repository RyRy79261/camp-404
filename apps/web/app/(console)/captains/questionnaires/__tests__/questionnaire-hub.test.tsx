import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The hub: New names a draft and opens the builder on it; each questionnaire
// offers only the links its viewer can use; duplicate and delete are one-tap
// row changes, so a failure is a toast and only the tapped control spins; a
// draft is deleted only after asking.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("../actions", () => ({
  createDraftAction: vi.fn(),
  deleteDraftAction: vi.fn(),
  duplicateDraftAction: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import {
  createDraftAction,
  deleteDraftAction,
  duplicateDraftAction,
} from "../actions";
import { QuestionnaireHub, type HubItem } from "../questionnaire-hub";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const HEADING = {
  eyebrow: "Captains / Questionnaires",
  title: "Questionnaires",
  description: "Build and manage questionnaires.",
};

function item(partial: Partial<HubItem>): HubItem {
  return {
    key: "gear-check",
    title: "Gear check",
    status: "draft",
    questionCount: 1,
    editedLabel: "17 Sep 2026",
    canEdit: true,
    canDelete: true,
    canSeeResults: true,
    openSendBlocking: null,
    ...partial,
  };
}

function renderHub(items: HubItem[]) {
  render(<QuestionnaireHub heading={HEADING} items={items} />);
}

describe("QuestionnaireHub — New", () => {
  it("names the draft, creates it, and opens the builder on it", async () => {
    vi.mocked(createDraftAction).mockResolvedValue({
      ok: true,
      key: "gear-check",
    });
    renderHub([]);
    expect(screen.getByText("No questionnaires yet")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "New questionnaire" }));
    const create = screen.getByRole("button", { name: "Create" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Questionnaire name"), {
      target: { value: "Gear check" },
    });
    fireEvent.click(create);

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/captains/questionnaires/gear-check"),
    );
    expect(createDraftAction).toHaveBeenCalledWith("Gear check");
  });

  it("shows a refused name beside the box", async () => {
    vi.mocked(createDraftAction).mockResolvedValue({
      ok: false,
      error: "Keep the name under 120 characters.",
    });
    renderHub([]);
    fireEvent.click(screen.getByRole("button", { name: "New questionnaire" }));
    const name = screen.getByLabelText("Questionnaire name");
    fireEvent.change(name, { target: { value: "x" } });
    fireEvent.keyDown(name, { key: "Enter" });

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Keep the name under 120 characters.",
    );
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(push).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe("QuestionnaireHub — the list", () => {
  it("splits what is out with members from the rest, with AfrikaBurn's card details", () => {
    renderHub([
      item({
        key: "a",
        title: "Arrival",
        status: "published",
        openSendBlocking: true,
        questionCount: 3,
      }),
      item({ key: "b", title: "Budget" }),
    ]);
    const sent = screen
      .getByRole("heading", { name: /Sent now/ })
      .closest("section")!;
    expect(within(sent).getByText("Arrival")).toBeTruthy();
    expect(within(sent).getByText("3 questions")).toBeTruthy();
    expect(within(sent).getByText("a · updated 17 Sep 2026")).toBeTruthy();
    const notSent = screen
      .getByRole("heading", { name: /Not sent/ })
      .closest("section")!;
    expect(within(notSent).getByText("Budget")).toBeTruthy();
  });

  it("offers Edit, Results and Send only where they lead somewhere", () => {
    renderHub([
      item({ key: "draft", title: "Draft one" }),
      item({
        key: "live",
        title: "Live one",
        status: "published",
        canDelete: false,
      }),
      item({
        key: "theirs",
        title: "Theirs",
        status: "published",
        canEdit: false,
        canSeeResults: false,
        canDelete: false,
      }),
    ]);
    expect(
      screen.getByRole("link", { name: "Edit Draft one" }).getAttribute("href"),
    ).toBe("/captains/questionnaires/draft");
    expect(
      screen.queryByRole("link", { name: "See results for Draft one" }),
    ).toBeNull();
    expect(screen.queryByRole("link", { name: "Send Draft one" })).toBeNull();

    expect(
      screen
        .getByRole("link", { name: "See results for Live one" })
        .getAttribute("href"),
    ).toBe("/captains/questionnaires/live/metrics");
    expect(
      screen.getByRole("link", { name: "Send Live one" }).getAttribute("href"),
    ).toBe("/captains/questionnaires/live/send");
    expect(
      screen.queryByRole("button", { name: "Delete Live one" }),
    ).toBeNull();

    // A team lead looking at a captain's questionnaire: Send only.
    expect(screen.queryByRole("link", { name: "Edit Theirs" })).toBeNull();
    expect(
      screen.queryByRole("link", { name: "See results for Theirs" }),
    ).toBeNull();
    expect(screen.getByRole("link", { name: "Send Theirs" })).toBeTruthy();
  });

  it("duplicates, spinning only the duplicate button, and reports a refusal as a toast", async () => {
    let finish: (v: { ok: false; error: string }) => void = () => {};
    vi.mocked(duplicateDraftAction).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }) as never,
    );
    renderHub([item({})]);
    const duplicate = screen.getByRole("button", {
      name: "Duplicate Gear check",
    });
    const remove = screen.getByRole("button", { name: "Delete Gear check" });
    fireEvent.click(duplicate);

    await waitFor(() =>
      expect(duplicate.querySelector(".lucide-loader-circle")).toBeTruthy(),
    );
    expect(remove.querySelector(".lucide-loader-circle")).toBeNull();
    expect((remove as HTMLButtonElement).disabled).toBe(true);

    finish({ ok: false, error: "Couldn't duplicate this questionnaire." });
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't duplicate this questionnaire.",
      ),
    );
    await waitFor(() =>
      expect((remove as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("deletes a draft only after asking", async () => {
    vi.mocked(deleteDraftAction).mockResolvedValue({ ok: true });
    renderHub([item({})]);
    fireEvent.click(screen.getByRole("button", { name: "Delete Gear check" }));
    await screen.findByText('Delete "Gear check"?');
    expect(deleteDraftAction).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "Delete",
      }),
    );
    await waitFor(() =>
      expect(deleteDraftAction).toHaveBeenCalledWith("gear-check"),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
