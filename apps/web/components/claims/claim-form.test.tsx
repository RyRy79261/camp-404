import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ClaimForm } from "./claim-form";

// The member's claim form (#242): a claim needs at least one receipt, so the
// form says so under the receipts and sends nothing; each problem shows under
// its own field; a receipt picked by mistake can be taken off again; a whole
// claim goes to the upload in one request, the amount in cents and every
// receipt with it.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function fill() {
  render(
    <ClaimForm
      teams={[
        { key: "kitchen", label: "Kitchen" },
        { key: "structures", label: "Structures" },
      ]}
      defaultTeam="kitchen"
      today="2027-03-02"
    />,
  );
  fireEvent.change(screen.getByLabelText("What you bought"), {
    target: { value: "Gas" },
  });
  fireEvent.change(screen.getByLabelText("Amount (R)"), {
    target: { value: "450,50" },
  });
  fireEvent.change(screen.getByLabelText("Bank details"), {
    target: { value: "FNB 123" },
  });
}

describe("ClaimForm", () => {
  it("refuses a claim with no receipt, beside the form, and sends nothing", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    fill();
    fireEvent.click(screen.getByRole("button", { name: "Send my claim" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe(
      "Add at least one receipt: a photo or a PDF.",
    );
    expect(alert.id).toBe("claim-receipts-error");
    expect(
      screen.getByLabelText("Receipts").getAttribute("aria-describedby"),
    ).toBe("claim-receipts-error");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows each problem under its own field, and clears it when fixed", () => {
    vi.stubGlobal("fetch", vi.fn());
    render(
      <ClaimForm
        teams={[{ key: "kitchen", label: "Kitchen" }]}
        defaultTeam={null}
        today="2027-03-02"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Send my claim" }));
    const byId = (id: string) => document.getElementById(id)?.textContent;
    expect(byId("claim-team-error")).toBe("Pick the team it was for.");
    expect(byId("claim-what-error")).toBe("Say what you bought.");
    expect(byId("claim-amount-error")).toBe(
      "Type the amount in rands, like 450 or 450,50.",
    );
    expect(byId("claim-account-error")).toBe(
      "Add the bank account to pay you back into.",
    );
    expect(screen.getAllByRole("alert")).toHaveLength(5);
    fireEvent.change(screen.getByLabelText("What you bought"), {
      target: { value: "Ice" },
    });
    expect(byId("claim-what-error")).toBeUndefined();
    expect(screen.getAllByRole("alert")).toHaveLength(4);
  });

  it("lists each chosen receipt by name, and takes one off again", async () => {
    render(
      <ClaimForm
        teams={[{ key: "kitchen", label: "Kitchen" }]}
        defaultTeam="kitchen"
        today="2027-03-02"
      />,
    );
    const a = new File(["%PDF-"], "till-slip.pdf", { type: "application/pdf" });
    const b = new File(["x"], "ice.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Receipts"), {
      target: { files: [a, b] },
    });
    // Photos are shrunk in the browser first, so they arrive a moment later.
    const chosen = await screen.findByRole("list", { name: "Chosen receipts" });
    expect(chosen.textContent).toContain("till-slip.pdf");
    expect(chosen.textContent).toContain("ice.jpg");
    expect(screen.getByText(/2 of 5 files/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove ice.jpg" }));
    expect(chosen.textContent).not.toContain("ice.jpg");
    expect(screen.getByText(/1 of 5 files/)).toBeTruthy();
  });

  it("keeps the receipts control when too many are picked, and takes focus to it", async () => {
    vi.stubGlobal("fetch", vi.fn());
    fill();
    const six = Array.from(
      { length: 6 },
      (_, i) => new File(["x"], `r${i}.jpg`, { type: "image/jpeg" }),
    );
    fireEvent.change(screen.getByLabelText("Receipts"), {
      target: { files: six },
    });
    expect(await screen.findByText(/6 of 5 files/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send my claim" }));
    const input = screen.getByLabelText("Receipts");
    expect(input.id).toBe("claim-receipts");
    expect(input.getAttribute("aria-describedby")).toBe("claim-receipts-error");
    expect(document.activeElement).toBe(input);
  });

  it("shows where keyboard focus is on the hidden file input", () => {
    fill();
    const zone = screen.getByLabelText("Receipts").closest("label");
    expect(zone?.className).toContain("focus-within:ring-2");
  });

  it("sends the claim in cents with every receipt", async () => {
    const fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({ id: "c1" }),
    }));
    vi.stubGlobal("fetch", fetch);
    fill();
    const a = new File(["%PDF-"], "a.pdf", { type: "application/pdf" });
    const b = new File(["x"], "b.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Receipts"), {
      target: { files: [a, b] },
    });
    await screen.findByText(/2 of 5 files/);
    fireEvent.click(screen.getByRole("button", { name: "Send my claim" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const [url, init] = fetch.mock.calls[0]! as unknown as [
      string,
      { body: FormData },
    ];
    expect(url).toBe("/api/uploads/claim");
    expect(init.body.get("team")).toBe("kitchen");
    expect(init.body.get("amountCents")).toBe("45050");
    expect(init.body.get("spentOn")).toBe("2027-03-02");
    expect(init.body.getAll("receipt")).toHaveLength(2);
  });
});
