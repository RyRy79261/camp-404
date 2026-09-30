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
// form says so beside it and sends nothing; a whole claim goes to the upload
// in one request, the amount in cents and every receipt with it.

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
    expect(screen.getByRole("alert").textContent).toBe(
      "Add at least one receipt: a photo or a PDF.",
    );
    expect(fetch).not.toHaveBeenCalled();
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
