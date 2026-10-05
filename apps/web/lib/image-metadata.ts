// Strips what a photo says about where and when it was taken before the file
// is stored: EXIF (GPS position, camera, time), XMP, IPTC and comments. The
// browser already re-encodes pictures through a canvas (lib/image.ts), which
// carries none of it, but the server cannot trust that: an old browser, a
// failed decode or a direct request sends the camera's file as it is. So the
// upload routes run every image through here as well.
//
// Byte surgery, not a re-encode: the picture's pixels are left exactly as
// they were, and no image library is needed. A JPEG keeps its EXIF
// orientation (rewritten as a one-tag EXIF block, nothing else in it), so a
// phone photo that was not re-encoded still shows the right way up.
//
// Returns null when the bytes are not a well-formed JPEG, PNG or WebP, so a
// route can refuse them.

export type StrippableImageType = "image/jpeg" | "image/png" | "image/webp";

export function stripImageMetadata(
  type: string,
  bytes: Uint8Array,
): Uint8Array | null {
  switch (type) {
    case "image/jpeg":
      return stripJpeg(bytes);
    case "image/png":
      return stripPng(bytes);
    case "image/webp":
      return stripWebp(bytes);
    default:
      return null;
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

function ascii(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

// --- JPEG --------------------------------------------------------------

// Segments kept before the scan: everything that decodes the picture, the
// JFIF header (APP0), a colour profile (APP2 "ICC_PROFILE") and Adobe's
// colour-transform flag (APP14). Every other APPn (EXIF and XMP in APP1,
// IPTC in APP13, maker notes, multi-picture data) and every comment goes.
function keepJpegSegment(marker: number, seg: Uint8Array): boolean {
  if (marker === 0xfe) return false; // COM
  if (marker < 0xe0 || marker > 0xef) return true; // not APPn
  if (marker === 0xe0 || marker === 0xee) return true; // JFIF, Adobe
  if (marker === 0xe2) return ascii(seg, 4, "ICC_PROFILE\0");
  return false;
}

function stripJpeg(bytes: Uint8Array): Uint8Array | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const kept: Uint8Array[] = [];
  let orientation = 1;
  let at = 2;
  for (;;) {
    // Fill bytes (0xFF runs) may pad between segments.
    while (bytes[at] === 0xff && bytes[at + 1] === 0xff) at++;
    if (at + 4 > bytes.length || bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1]!;
    // Start of scan: the compressed picture runs from here to the end.
    if (marker === 0xda) {
      const header = kept.findIndex((s) => s[1] === 0xe0) + 1; // after JFIF
      if (orientation !== 1)
        kept.splice(header, 0, orientationApp1(orientation));
      return concat([bytes.subarray(0, 2), ...kept, bytes.subarray(at)]);
    }
    // A picture with no scan, or a marker that has no length here.
    if (
      marker === 0xd9 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      return null;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    if (length < 2 || at + 2 + length > bytes.length) return null;
    const seg = bytes.subarray(at, at + 2 + length);
    if (marker === 0xe1 && ascii(seg, 4, "Exif\0\0")) {
      orientation = exifOrientation(seg.subarray(10)) ?? orientation;
    }
    if (keepJpegSegment(marker, seg)) kept.push(seg);
    at += 2 + length;
  }
}

/** The Orientation tag (0x0112) of IFD0 in a TIFF block, if it is 1–8. */
function exifOrientation(tiff: Uint8Array): number | null {
  const little = ascii(tiff, 0, "II");
  if (!little && !ascii(tiff, 0, "MM")) return null;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  try {
    const ifd = view.getUint32(4, little);
    const count = view.getUint16(ifd, little);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (view.getUint16(entry, little) === 0x0112) {
        const value = view.getUint16(entry + 8, little);
        return value >= 1 && value <= 8 ? value : null;
      }
    }
  } catch {
    // An offset outside the block: no orientation to keep.
  }
  return null;
}

/** An APP1 EXIF segment holding one tag: the orientation. */
function orientationApp1(orientation: number): Uint8Array {
  const segment = [
    [0xff, 0xe1, 0x00, 0x22], // APP1, 34 bytes after the marker
    [0x45, 0x78, 0x69, 0x66, 0x00, 0x00], // "Exif\0\0"
    [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08], // big-endian, IFD0 at 8
    [0x00, 0x01], // one entry:
    [0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01], // Orientation, 1 SHORT
    [0x00, orientation, 0x00, 0x00], // its value
    [0x00, 0x00, 0x00, 0x00], // no next IFD
  ];
  return Uint8Array.from(segment.flat());
}

// --- PNG ---------------------------------------------------------------

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// EXIF, the three text chunks (XMP lives in iTXt) and the last-modified time.
const PNG_DROPPED = new Set(["eXIf", "tEXt", "zTXt", "iTXt", "tIME"]);

function stripPng(bytes: Uint8Array): Uint8Array | null {
  if (!PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = view.getUint32(at);
    const end = at + 12 + length;
    if (end > bytes.length) return null;
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
    if (!PNG_DROPPED.has(type)) kept.push(bytes.subarray(at, end));
    at = end;
    if (type === "IEND") return concat(kept);
  }
  return null;
}

// --- WebP --------------------------------------------------------------

function stripWebp(bytes: Uint8Array): Uint8Array | null {
  if (!ascii(bytes, 0, "RIFF") || !ascii(bytes, 8, "WEBP")) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(bytes.length, 8 + view.getUint32(4, true));
  const kept: Uint8Array[] = [];
  let at = 12;
  while (at + 8 <= end) {
    const fourcc = String.fromCharCode(...bytes.subarray(at, at + 4));
    const size = view.getUint32(at + 4, true);
    const next = at + 8 + size + (size % 2);
    if (at + 8 + size > end) return null;
    if (fourcc !== "EXIF" && fourcc !== "XMP ") {
      const chunk = bytes.slice(at, Math.min(next, end));
      // VP8X's flags say which metadata chunks follow: clear EXIF and XMP.
      if (fourcc === "VP8X" && size >= 1) chunk[8] = chunk[8]! & ~0x0c;
      kept.push(chunk);
    }
    at = next;
  }
  if (kept.length === 0) return null;
  const body = concat(kept);
  const header = new Uint8Array(12);
  header.set(bytes.subarray(0, 12));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  return concat([header, body]);
}
