import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PaymentReference } from "./payment-reference";

// The member's payment reference: shown, and copied on a press, with a way
// through when the browser refuses the clipboard.

afterEach(cleanup);

function mockClipboard(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("PaymentReference", () => {
  it("copies the reference", async () => {
    const writeText = vi.fn(async () => {});
    mockClipboard(writeText);
    render(<PaymentReference code="C404-M017" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy C404-M017" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("C404-M017"));
    expect(await screen.findByRole("button", { name: "Copied" })).toBeTruthy();
  });

  it("tells the member to type it when the clipboard is refused", async () => {
    mockClipboard(async () => {
      throw new Error("denied");
    });
    render(<PaymentReference code="C404-M017" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy C404-M017" }));

    expect(
      await screen.findByText(
        "Copy didn't work here. Type the reference above instead.",
      ),
    ).toBeTruthy();
  });
});
