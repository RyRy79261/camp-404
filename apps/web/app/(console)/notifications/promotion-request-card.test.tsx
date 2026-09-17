import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

const refresh = vi.fn();
const router = { refresh, push: vi.fn() };
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("./actions", () => ({
  acceptCaptainPromotionAction: vi.fn(),
  declineCaptainPromotionAction: vi.fn(),
}));

import { getToasts, toast } from "@camp404/ui/components/toast";
import {
  acceptCaptainPromotionAction,
  declineCaptainPromotionAction,
} from "./actions";
import { PromotionRequestCard } from "./promotion-request-card";

afterEach(() => {
  cleanup();
  toast.dismiss();
  refresh.mockReset();
  vi.mocked(acceptCaptainPromotionAction).mockReset();
  vi.mocked(declineCaptainPromotionAction).mockReset();
});

describe("PromotionRequestCard", () => {
  it("names who asked and what a captain does", () => {
    render(
      <PromotionRequestCard requestId="req-1" requesterName="Captain Jo" />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Captain Jo asked you to become a captain",
      }),
    ).toBeDefined();
    expect(screen.getByText(/Nothing changes unless you accept/)).toBeDefined();
  });

  it("falls back to 'A captain' when the requester has no name", () => {
    render(<PromotionRequestCard requestId="req-1" requesterName={null} />);
    expect(
      screen.getByRole("heading", {
        name: "A captain asked you to become a captain",
      }),
    ).toBeDefined();
  });

  it("accepts, says so, and refreshes", async () => {
    vi.mocked(acceptCaptainPromotionAction).mockResolvedValue({ ok: true });
    render(<PromotionRequestCard requestId="req-1" requesterName="Jo" />);
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(acceptCaptainPromotionAction).toHaveBeenCalledWith("req-1");
    expect(getToasts().map((t) => t.title)).toEqual(["You're a captain now"]);
  });

  it("declines, and shows a refusal where the member is looking", async () => {
    vi.mocked(declineCaptainPromotionAction).mockResolvedValue({
      ok: false,
      error: "This request is no longer open.",
    });
    render(<PromotionRequestCard requestId="req-1" requesterName="Jo" />);
    fireEvent.click(screen.getByRole("button", { name: "Decline" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This request is no longer open.",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(declineCaptainPromotionAction).toHaveBeenCalledWith("req-1");
  });
});
