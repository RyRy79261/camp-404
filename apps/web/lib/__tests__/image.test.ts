import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUILDER_IMAGE_UPLOAD,
  cropResizeToSquare,
  downscaleForUpload,
  RECEIPT_UPLOAD,
} from "../image";

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
    fillRect: vi.fn(),
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

describe("downscaleForUpload", () => {
  const encoded = (bytes: number, type: string) =>
    vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation(function (cb) {
        cb(new Blob([new Uint8Array(bytes)], { type }));
      });
  const bitmap = (width: number, height: number) =>
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width, height, close })),
    );
  const phonePhoto = new File([new Uint8Array(3_000_000)], "IMG_1.HEIC.jpeg", {
    type: "image/jpeg",
    lastModified: 42,
  });

  it("shrinks a phone photo's long edge to 2000 px as a JPEG, upright", async () => {
    bitmap(4032, 3024);
    encoded(400_000, "image/jpeg");
    const out = await downscaleForUpload(phonePhoto, RECEIPT_UPLOAD);
    expect(out.type).toBe("image/jpeg");
    expect(out.size).toBe(400_000);
    expect(out.name).toBe("IMG_1.HEIC.jpg");
    expect(drawImage.mock.calls.at(-1)?.slice(1)).toEqual([0, 0, 2000, 1500]);
    // The camera's orientation is applied to the pixels before EXIF is lost.
    expect(vi.mocked(createImageBitmap)).toHaveBeenCalledWith(phonePhoto, {
      imageOrientation: "from-image",
    });
    expect(close).toHaveBeenCalled();
  });

  it("re-encodes a builder picture as WebP within 1600 px", async () => {
    bitmap(1000, 3200);
    encoded(90_000, "image/webp");
    const out = await downscaleForUpload(phonePhoto, BUILDER_IMAGE_UPLOAD);
    expect(out.type).toBe("image/webp");
    expect(out.name).toBe("IMG_1.HEIC.webp");
    expect(drawImage.mock.calls.at(-1)?.slice(1)).toEqual([0, 0, 500, 1600]);
  });

  it("falls back to JPEG where the browser cannot write WebP", async () => {
    bitmap(800, 600);
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, "toBlob")
      .mockImplementation(function (cb, type) {
        cb(
          new Blob(["x"], { type: type === "image/jpeg" ? type : "image/png" }),
        );
      });
    const out = await downscaleForUpload(phonePhoto, BUILDER_IMAGE_UPLOAD);
    expect(out.type).toBe("image/jpeg");
    expect(toBlob).toHaveBeenCalledTimes(2);
  });

  it("leaves a PDF, an undecodable picture and a smaller original alone", async () => {
    const pdf = new File(["%PDF-1.7"], "slip.pdf", { type: "application/pdf" });
    expect(await downscaleForUpload(pdf, RECEIPT_UPLOAD)).toBe(pdf);

    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => {
        throw new Error("cannot decode");
      }),
    );
    expect(await downscaleForUpload(phonePhoto, RECEIPT_UPLOAD)).toBe(
      phonePhoto,
    );

    // A small screenshot that would only grow: the server strips it instead.
    const small = new File([new Uint8Array(1000)], "s.png", {
      type: "image/png",
    });
    bitmap(300, 200);
    encoded(5000, "image/jpeg");
    expect(await downscaleForUpload(small, RECEIPT_UPLOAD)).toBe(small);
  });
});
