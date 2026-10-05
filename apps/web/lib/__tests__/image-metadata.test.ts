import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { stripImageMetadata } from "../image-metadata";

// Real files from a real encoder (libvips, through sharp, once): a 24x16
// picture carrying the EXIF a phone writes, a camera make and model and a GPS
// position (32°19'S 19°45'E, Tankwa Town), and on the JPEG orientation 6.

const fixture = (name: string) =>
  new Uint8Array(readFileSync(join(__dirname, "fixtures", name)));

/** Every TIFF block (EXIF) in the file, however the format wraps it. */
function exifBlocks(bytes: Uint8Array): Uint8Array[] {
  const blocks: Uint8Array[] = [];
  for (let i = 0; i + 8 < bytes.length; i++) {
    const tiff =
      (bytes[i] === 0x49 && bytes[i + 1] === 0x49 && bytes[i + 2] === 0x2a) ||
      (bytes[i] === 0x4d && bytes[i + 1] === 0x4d && bytes[i + 3] === 0x2a);
    if (tiff) blocks.push(bytes.subarray(i));
  }
  return blocks;
}

/** The tags in IFD0 of a TIFF block. */
function ifd0Tags(tiff: Uint8Array): Map<number, number> {
  const little = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const tags = new Map<number, number>();
  try {
    const ifd = view.getUint32(4, little);
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      tags.set(
        view.getUint16(entry, little),
        view.getUint16(entry + 8, little),
      );
    }
  } catch {
    // Not a real TIFF header after all: no tags.
  }
  return tags;
}

const GPS_IFD = 0x8825;
const ORIENTATION = 0x0112;
const hasGps = (bytes: Uint8Array) =>
  exifBlocks(bytes).some((b) => ifd0Tags(b).has(GPS_IFD));
const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

describe("stripImageMetadata", () => {
  it.each([
    ["gps-photo.jpg", "image/jpeg"],
    ["gps-photo.png", "image/png"],
    ["gps-photo.webp", "image/webp"],
  ])("takes the GPS position and the camera out of %s", (name, type) => {
    const before = fixture(name);
    // The fixture really carries what the test says it removes.
    expect(hasGps(before)).toBe(true);
    expect(text(before)).toContain("FixtureCam");

    const after = stripImageMetadata(type, before);
    expect(after).not.toBeNull();
    expect(hasGps(after!)).toBe(false);
    expect(text(after!)).not.toContain("FixtureCam");
    expect(text(after!)).not.toContain("GPS Test");
    // Still the same kind of file, and stripping again changes nothing.
    expect(stripImageMetadata(type, after!)).toEqual(after);
  });

  it("keeps a JPEG's orientation and its compressed picture byte for byte", () => {
    const before = fixture("gps-photo.jpg");
    const after = stripImageMetadata("image/jpeg", before)!;
    const tags = exifBlocks(after).map(ifd0Tags);
    expect(tags).toHaveLength(1);
    expect([...tags[0]!.keys()]).toEqual([ORIENTATION]);
    expect(tags[0]!.get(ORIENTATION)).toBe(6);

    const scan = (b: Uint8Array) => {
      for (let i = 2; i < b.length - 1; i++) {
        if (b[i] === 0xff && b[i + 1] === 0xda) return b.subarray(i);
      }
      return new Uint8Array();
    };
    expect(scan(after).length).toBeGreaterThan(0);
    expect(scan(after)).toEqual(scan(before));
  });

  it("clears the WebP header's EXIF flag with the chunk", () => {
    const after = stripImageMetadata("image/webp", fixture("gps-photo.webp"))!;
    const vp8x = text(after).indexOf("VP8X");
    if (vp8x >= 0) expect(after[vp8x + 8]! & 0x0c).toBe(0);
    const riffSize = new DataView(after.buffer).getUint32(4, true);
    expect(riffSize).toBe(after.length - 8);
  });

  it("refuses bytes that are not the picture they claim to be", () => {
    expect(
      stripImageMetadata("image/jpeg", fixture("gps-photo.png")),
    ).toBeNull();
    expect(
      stripImageMetadata("image/png", fixture("gps-photo.jpg")),
    ).toBeNull();
    expect(stripImageMetadata("image/webp", new Uint8Array(4))).toBeNull();
    expect(stripImageMetadata("application/pdf", new Uint8Array(4))).toBeNull();
    // A JPEG cut off inside its picture: the scan starts but never ends.
    const jpg = fixture("gps-photo.jpg");
    expect(stripImageMetadata("image/jpeg", jpg.subarray(0, -2))).toBeNull();
    // A JPEG cut off before its picture starts.
    expect(
      stripImageMetadata(
        "image/jpeg",
        fixture("gps-photo.jpg").subarray(0, 40),
      ),
    ).toBeNull();
  });

  it("drops whatever a phone appended after the end of the picture", () => {
    const jpg = fixture("gps-photo.jpg");
    const clean = stripImageMetadata("image/jpeg", jpg)!;
    const trailer = new TextEncoder().encode("MotionPhoto_Data FixtureCam");
    const withTrailer = new Uint8Array(jpg.length + trailer.length);
    withTrailer.set(jpg);
    withTrailer.set(trailer, jpg.length);
    const after = stripImageMetadata("image/jpeg", withTrailer)!;
    expect(after).toEqual(clean);
    expect([...after.subarray(-2)]).toEqual([0xff, 0xd9]);
  });
});
