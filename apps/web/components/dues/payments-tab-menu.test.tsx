import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { PAYMENTS_OWING_PATH } from "@/lib/dues-copy";
import { PaymentsTabMenu } from "./payments-tab-menu";

// The Finance tabs as one menu on a phone (#240). On a page below a tab the
// menu already names that tab, so picking it goes nowhere: a link back sits
// beside it.

afterEach(cleanup);

describe("PaymentsTabMenu", () => {
  it("links back to the tab from a page below it", () => {
    render(<PaymentsTabMenu active={PAYMENTS_OWING_PATH} below />);
    const back = screen.getByRole("link", { name: "Who owes what" });
    expect(back.getAttribute("href")).toBe(PAYMENTS_OWING_PATH);
  });

  it("has no back link on the tab itself", () => {
    render(<PaymentsTabMenu active={PAYMENTS_OWING_PATH} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});
