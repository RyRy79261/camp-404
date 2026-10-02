import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cropResizeToSquare } from "../image";

// jsdom has no canvas or image decoder: stand in for both and watch which
// source square reaches drawImage.
const drawImage = vi.fn();
const close = vi.fn();

beforeEach(() => {
  drawImage.mockReset();
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 600, height: 400, close })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    function (cb) {
      cb(new Blob(["x"], { type: "image/webp" }));
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const photo = new File(["x"], "p.jpg", { type: "image/jpeg" });

describe("cropResizeToSquare", () => {
  it("cuts the square the member chose and resizes it to 512", async () => {
    const blob = await cropResizeToSquare(photo, { x: 180, y: 100, size: 200 });
    expect(blob.type).toBe("image/webp");
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      180,
      100,
      200,
      200,
      0,
      0,
      512,
      512,
    );
    expect(close).toHaveBeenCalled();
  });

  it("cuts the middle square when no crop is given", async () => {
    await cropResizeToSquare(photo);
    expect(drawImage.mock.calls[0]?.slice(1)).toEqual([
      100, 0, 400, 400, 0, 0, 512, 512,
    ]);
  });

  it("pulls a crop that runs off the photo back inside it", async () => {
    await cropResizeToSquare(photo, { x: 550, y: -40, size: 300 });
    expect(drawImage.mock.calls[0]?.slice(1, 5)).toEqual([300, 0, 300, 300]);
  });
});
