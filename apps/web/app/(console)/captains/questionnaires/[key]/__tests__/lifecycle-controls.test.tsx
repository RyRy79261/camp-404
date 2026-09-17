import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

vi.mock("../../actions", () => ({
  closeActivationAction: vi.fn(),
  getCarryOverAction: vi.fn(),
  publishAction: vi.fn(),
  setCarryOverAction: vi.fn(),
  unpublishAction: vi.fn(),
}));

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import { LifecycleRail } from "../lifecycle-controls";
import {
  closeActivationAction,
  getCarryOverAction,
  setCarryOverAction,
  unpublishAction,
} from "../../actions";

// The per-questionnaire year policy. The switch is phrased the way a captain
// thinks about it ("ask everyone again next year") and is therefore the
// INVERSE of the stored `carry_over` column — these tests pin that inversion,
// because getting it backwards would silently re-ask the whole camp.

function renderBar(props: Partial<Parameters<typeof LifecycleRail>[0]> = {}) {
  const onPublish = vi.fn();
  render(
    <LifecycleRail
      questionnaireKey="arrival"
      status="draft"
      version={null}
      isCaptain
      openActivationId={null}
      publishing={false}
      unsaved={false}
      onPublish={onPublish}
      {...props}
    />,
  );
  return onPublish;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LifecycleRail — ask again next year", () => {
  it("holds the switch disabled until the current setting has loaded", async () => {
    let resolve: (value: { ok: true; carryOver: boolean }) => void = () => {};
    vi.mocked(getCarryOverAction).mockReturnValue(
      new Promise((r) => {
        resolve = r as never;
      }) as never,
    );
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    expect(control.getAttribute("data-disabled")).not.toBeNull();
    expect(screen.getByText(/Checking this questionnaire/)).toBeTruthy();

    resolve({ ok: true, carryOver: true });
    await waitFor(() =>
      expect(screen.getByText(/nothing happens to this/i)).toBeTruthy(),
    );
  });

  it("renders a carry-over questionnaire as OFF, with the reassuring copy", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    renderBar();

    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Ask everyone again next year" })
          .getAttribute("aria-checked"),
      ).toBe("false"),
    );
    expect(
      screen.getByText(/Anyone who has answered stays answered/),
    ).toBeTruthy();
  });

  it("renders a fresh questionnaire as ON, and says the form starts blank", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: false,
    });
    renderBar();

    await waitFor(() =>
      expect(
        screen
          .getByRole("switch", { name: "Ask everyone again next year" })
          .getAttribute("aria-checked"),
      ).toBe("true"),
    );
    expect(screen.getByText(/goes out again on a blank form/)).toBeTruthy();
  });

  it("switching ON writes carryOver: false — the inversion, end to end", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    vi.mocked(setCarryOverAction).mockResolvedValue({ ok: true });
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    await waitFor(() =>
      expect(control.getAttribute("data-disabled")).toBeNull(),
    );
    fireEvent.click(control);

    await waitFor(() =>
      expect(setCarryOverAction).toHaveBeenCalledWith("arrival", false),
    );
    await waitFor(() =>
      expect(control.getAttribute("aria-checked")).toBe("true"),
    );
  });

  it("leaves the switch where it was when the write is refused", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
    vi.mocked(setCarryOverAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    renderBar();

    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    await waitFor(() =>
      expect(control.getAttribute("data-disabled")).toBeNull(),
    );
    fireEvent.click(control);

    await waitFor(() => expect(setCarryOverAction).toHaveBeenCalled());
    expect(control.getAttribute("aria-checked")).toBe("false");
  });

  it("keeps the switch out of reach when the read is refused", async () => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: false,
      error: "Only captains can publish or send.",
    });
    renderBar();

    await waitFor(() => expect(getCarryOverAction).toHaveBeenCalled());
    const control = screen.getByRole("switch", {
      name: "Ask everyone again next year",
    });
    expect(control.getAttribute("data-disabled")).not.toBeNull();
    expect(setCarryOverAction).not.toHaveBeenCalled();
    expect(
      await screen.findByText(/This setting couldn’t be loaded/),
    ).toBeTruthy();
  });

  it("says so, rather than spinning forever, when the read fails outright", async () => {
    vi.mocked(getCarryOverAction).mockRejectedValue(new Error("offline"));
    renderBar();
    expect(
      await screen.findByText(/This setting couldn’t be loaded/),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("switch", { name: "Ask everyone again next year" })
        .getAttribute("data-disabled"),
    ).not.toBeNull();
  });
});

// The rest of the rail: what a captain can do at each status, that each
// destructive step asks first, and what a team lead sees instead.

function confirmInDialog(label: string) {
  const dialog = screen.getByRole("dialog");
  fireEvent.click(
    Array.from(dialog.querySelectorAll("button")).find(
      (b) => b.textContent === label,
    )!,
  );
}

describe("LifecycleRail — the lifecycle", () => {
  beforeEach(() => {
    vi.mocked(getCarryOverAction).mockResolvedValue({
      ok: true,
      carryOver: true,
    });
  });

  it("publishes a draft through the builder, with nothing to send yet", async () => {
    const onPublish = renderBar();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(onPublish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("link", { name: /Send to members/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(screen.queryByRole("link", { name: /See results/ })).toBeNull();
    await waitFor(() => expect(getCarryOverAction).toHaveBeenCalled());
  });

  it("offers Re-publish, Send, See results and Unpublish on a published questionnaire", async () => {
    renderBar({ status: "published", version: "arrival-v2" });
    expect(screen.getByRole("button", { name: "Re-publish" })).toBeTruthy();
    expect(screen.getByText("arrival-v2")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /Send to members/ })
        .getAttribute("href"),
    ).toBe("/captains/questionnaires/arrival/send");
    expect(
      screen.getByRole("link", { name: /See results/ }).getAttribute("href"),
    ).toBe("/captains/questionnaires/arrival/metrics");
    expect(
      screen.getByText(/You're editing a live questionnaire/),
    ).toBeTruthy();
    await waitFor(() => expect(getCarryOverAction).toHaveBeenCalled());
  });

  it("closes an open send only after asking", async () => {
    vi.mocked(closeActivationAction).mockResolvedValue({ ok: true });
    renderBar({
      status: "published",
      openActivationId: "00000000-0000-4000-8000-000000000009",
      openActivationBlocking: true,
    });
    expect(screen.getByText("Currently sent to members")).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Send to members/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Close send" }));
    await screen.findByText("Close the current send?");
    expect(closeActivationAction).not.toHaveBeenCalled();
    confirmInDialog("Close send");
    await waitFor(() =>
      expect(closeActivationAction).toHaveBeenCalledWith(
        "00000000-0000-4000-8000-000000000009",
        "arrival",
      ),
    );
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("unpublishes only after asking, and reports a refusal as a toast", async () => {
    vi.mocked(unpublishAction).mockResolvedValue({
      ok: false,
      error: "Only a published questionnaire can be unpublished.",
    });
    renderBar({ status: "published" });
    fireEvent.click(screen.getByRole("button", { name: "Unpublish" }));
    await screen.findByText("Unpublish this questionnaire?");
    expect(unpublishAction).not.toHaveBeenCalled();
    confirmInDialog("Unpublish");
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Only a published questionnaire can be unpublished.",
      ),
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows a team lead the status and Send, and why Publish is out of reach", () => {
    renderBar({ status: "published", isCaptain: false });
    const publish = screen.getByRole("button", { name: "Re-publish" });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Only captains can publish/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Send to members/ })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /See results/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unpublish" })).toBeNull();
    expect(
      screen.queryByRole("switch", { name: "Ask everyone again next year" }),
    ).toBeNull();
    expect(getCarryOverAction).not.toHaveBeenCalled();
  });

  it("spins only Publish while publishing", async () => {
    renderBar({ status: "published", publishing: true });
    const publish = screen.getByRole("button", { name: "Re-publish" });
    expect(publish.querySelector("svg")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Unpublish" }).querySelector("svg"),
    ).toBeNull();
    await waitFor(() => expect(getCarryOverAction).toHaveBeenCalled());
  });
});
