import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The member's own ticket block: Save appears only once the choice changes,
// "Saved" takes its place after, and the captains' DDT answers the member's
// own request in words that do not read as a refusal.

vi.mock("./actions", () => ({ setMyTicketAction: vi.fn() }));

import { setMyTicketAction } from "./actions";
import { MyTicket } from "./my-ticket";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MyTicket", () => {
  it("offers Save only once the choice changes, then says Saved", async () => {
    vi.mocked(setMyTicketAction).mockResolvedValue({ ok: true });
    render(
      <MyTicket
        ticket={{ ticketStatus: "unknown", ddt: "none", wap: "not_needed" }}
      />,
    );

    expect(screen.queryByRole("button", { name: "Save ticket" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "I have my ticket" }));
    fireEvent.click(screen.getByRole("button", { name: "Save ticket" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe("Saved"),
    );
    expect(setMyTicketAction).toHaveBeenCalledWith({
      ticketStatus: "has_ticket",
    });
    expect(screen.queryByRole("button", { name: "Save ticket" })).toBeNull();
  });

  it("says a DDT the member asked for is asked for, not refused", () => {
    render(
      <MyTicket
        ticket={{
          ticketStatus: "needs_directed_ticket",
          ddt: "none",
          wap: "requested",
        }}
      />,
    );
    const mine = screen.getByRole("region", { name: "From the captains" });
    expect(mine.textContent).toContain("Asked for, not given yet");
    expect(mine.textContent).toContain("Requested");
    expect(screen.queryByText(/The camp has given you a DDT/)).toBeNull();
  });
});
