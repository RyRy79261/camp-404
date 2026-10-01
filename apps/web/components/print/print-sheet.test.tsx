import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PRINT_SHEET_ATTR } from "@/lib/print";
import { PrintRefusal, PrintSheet } from "./print-sheet";

// The shared print shell (#249): a header line, the title, the page's own
// options, and two buttons, Download PDF (a real file from the server) and
// Print (the browser's dialog). A refusal is drawn without the sheet mark, so
// the PDF route never saves one.

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", "/print/lounge?day=2");
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sheet() {
  return render(
    <PrintSheet
      area="Lounge"
      title="Lounge programme"
      subtitle="Day 2"
      options={<a href="/lounge">Back to the lounge programme</a>}
    >
      <p>Sunrise yoga</p>
    </PrintSheet>,
  );
}

describe("PrintSheet", () => {
  it("draws the header line, the title, the options and both buttons", () => {
    const { container } = sheet();
    expect(screen.getByText("Camp 404 · Lounge")).toBeTruthy();
    expect(
      screen.getByRole("heading", { level: 1, name: "Lounge programme" }),
    ).toBeTruthy();
    expect(screen.getByText("Day 2")).toBeTruthy();
    expect(screen.getByText("Sunrise yoga")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "Print options" }).textContent,
    ).toContain("Back to the lounge programme");
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
    // The sheet carries the mark the PDF route looks for.
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).not.toBeNull();
    // The bar with the buttons never prints.
    expect(
      screen
        .getByRole("navigation", { name: "Print options" })
        .closest(".print\\:hidden"),
    ).not.toBeNull();
  });

  it("Print opens the browser's print dialog", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it("Download PDF asks the server for THIS page and saves the file", async () => {
    // A stand-in for the route's answer: jsdom's Blob is not one Node's own
    // Response can read, so the test hands the button what it reads.
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    });
    const createObjectURL = vi.fn(() => "blob:pdf");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const clicks: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.download);
      });
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    await waitFor(() =>
      expect(clicks).toEqual(["camp-404-lounge-programme.pdf"]),
    );
    const asked = new URL(String(fetchMock.mock.calls[0]![0]), "http://x");
    expect(asked.pathname).toBe("/print/pdf");
    expect(asked.searchParams.get("from")).toBe("/print/lounge?day=2");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    click.mockRestore();
  });

  it("a refused PDF says so beside the button, and saves nothing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    sheet();
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));
    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      "You cannot print this page.",
    );
    expect(click).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeTruthy();
    click.mockRestore();
  });

  it("a refusal has no sheet mark and no buttons", () => {
    const { container } = render(<PrintRefusal>Captains only.</PrintRefusal>);
    expect(container.querySelector(`[${PRINT_SHEET_ATTR}]`)).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
