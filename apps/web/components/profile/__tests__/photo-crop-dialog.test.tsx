import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { PhotoCropDialog } from "../photo-crop-dialog";

// jsdom decodes no images and lays nothing out. The photo's size is given to
// the hidden <img> and its load event fired by hand; the frame is 300 px.
const FRAME = 300;

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:photo");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: FRAME,
    height: FRAME,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: FRAME,
    bottom: FRAME,
    toJSON: () => ({}),
  });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function open() {
  const props = {
    file: new File(["x"], "me.jpg", { type: "image/jpeg" }),
    onSave: vi.fn(),
    onCancel: vi.fn(),
    onPickAnother: vi.fn(),
  };
  render(<PhotoCropDialog {...props} />);
  const dialog = screen.getByRole("dialog", { name: "Fit your photo" });
  // A 600×400 landscape photo: it opens on the middle 400 px square.
  const probe = dialog.querySelector('img[aria-hidden="true"]');
  if (!(probe instanceof HTMLImageElement)) throw new Error("no probe img");
  Object.defineProperty(probe, "naturalWidth", { value: 600 });
  Object.defineProperty(probe, "naturalHeight", { value: 400 });
  fireEvent.load(probe);
  const stage = within(dialog).getByRole("group", { name: "Photo position" });
  return { props, dialog, stage };
}

function drag(stage: HTMLElement, dx: number, dy: number) {
  fireEvent.pointerDown(stage, { pointerId: 1, clientX: 150, clientY: 150 });
  fireEvent.pointerMove(stage, {
    pointerId: 1,
    clientX: 150 + dx,
    clientY: 150 + dy,
  });
  fireEvent.pointerUp(stage, { pointerId: 1 });
}

describe("PhotoCropDialog", () => {
  it("shows the frame, both previews and named controls", () => {
    const { dialog } = open();
    const d = within(dialog);
    expect(d.getByRole("img", { name: "Preview: your profile" })).toBeDefined();
    expect(d.getByRole("img", { name: "Preview: in lists" })).toBeDefined();
    expect(d.getByRole("button", { name: "Zoom in" })).toBeDefined();
    expect(d.getByRole("button", { name: "Zoom out" })).toBeDefined();
    expect(d.getByRole("slider", { name: "Zoom" })).toBeDefined();
    expect(d.getByRole("button", { name: "Save photo" })).toBeDefined();
    expect(d.getByRole("button", { name: "Cancel" })).toBeDefined();
    expect(
      d.getAllByRole("button", { name: "Use another photo" }).length,
    ).toBeGreaterThan(0);
  });

  it("Save with no change hands back the middle square", () => {
    const { props, dialog } = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "Save photo" }));
    expect(props.onSave).toHaveBeenCalledWith({ x: 100, y: 0, size: 400 });
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it("dragging the photo moves the square that Save hands back", () => {
    const { props, dialog, stage } = open();
    // 400 source px in a 300 px frame: 30 screen px right is 40 px left.
    drag(stage, 30, 0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save photo" }));
    expect(props.onSave).toHaveBeenCalledWith({ x: 60, y: 0, size: 400 });
  });

  it("a drag past the edge stops with no gap in the circle", () => {
    const { props, dialog, stage } = open();
    drag(stage, 2000, 2000);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save photo" }));
    expect(props.onSave).toHaveBeenCalledWith({ x: 0, y: 0, size: 400 });
  });

  it("zooms with + and the keyboard, and arrow keys move", () => {
    const { props, dialog, stage } = open();
    const d = within(dialog);
    fireEvent.click(d.getByRole("button", { name: "Zoom in" }));
    fireEvent.keyDown(stage, { key: "+" });
    // Zoom 1.4: the square is 400 / 1.4 around the same middle.
    expect(
      d.getByRole("slider", { name: "Zoom" }).getAttribute("aria-valuenow"),
    ).toBe("140");
    fireEvent.keyDown(stage, { key: "ArrowRight" });
    fireEvent.click(d.getByRole("button", { name: "Save photo" }));
    const saved = props.onSave.mock.calls[0]?.[0] as {
      x: number;
      y: number;
      size: number;
    };
    const size = 400 / 1.4;
    expect(saved.size).toBeCloseTo(size);
    // Middle x was 300; ArrowRight moves the photo 10 px right.
    expect(saved.x).toBeCloseTo(300 - size / 2 - (10 * size) / FRAME);
  });

  it("Zoom out is off at zoom 1, and - never goes below it", () => {
    const { dialog, stage } = open();
    const d = within(dialog);
    expect(
      (d.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.keyDown(stage, { key: "-" });
    expect(
      d.getByRole("slider", { name: "Zoom" }).getAttribute("aria-valuenow"),
    ).toBe("100");
  });

  it("Cancel backs out without saving", () => {
    const { props, dialog, stage } = open();
    drag(stage, 30, 0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });

  it("Use another photo asks for a new pick", () => {
    const { props, dialog } = open();
    fireEvent.click(
      within(dialog).getAllByRole("button", { name: "Use another photo" })[0]!,
    );
    expect(props.onPickAnother).toHaveBeenCalled();
    expect(props.onSave).not.toHaveBeenCalled();
  });
});
