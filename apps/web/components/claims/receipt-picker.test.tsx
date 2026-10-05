import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The receipt picker shrinks each photo as it is picked, so five phone photos
// fit the 4 MB one request may carry (lib/image.ts does the shrinking).

vi.mock("@/lib/image", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/image")>()),
  downscaleForUpload: vi.fn(async (file: File) =>
    file.type === "application/pdf"
      ? file
      : new File(
          [new Uint8Array(300_000)],
          file.name.replace(/\.\w+$/, ".jpg"),
          {
            type: "image/jpeg",
          },
        ),
  ),
}));

import { downscaleForUpload, RECEIPT_UPLOAD } from "@/lib/image";
import { ReceiptPicker } from "./receipt-picker";

afterEach(cleanup);

function Harness({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [files, setFiles] = useState<File[]>([]);
  return (
    <ReceiptPicker
      files={files}
      onChange={(next) => {
        setFiles(next);
        onFiles(next);
      }}
      maxFiles={5}
      maxBytes={4 * 1024 * 1024}
    />
  );
}

const photo = (name: string) =>
  new File([new Uint8Array(3_500_000)], name, { type: "image/jpeg" });

describe("ReceiptPicker", () => {
  it("keeps the shrunk photos, so five fit under 4 MB", async () => {
    const onFiles = vi.fn();
    render(<Harness onFiles={onFiles} />);
    const pdf = new File(["%PDF-1.7"], "slip.pdf", { type: "application/pdf" });
    const picked = [
      photo("a.jpg"),
      photo("b.jpg"),
      photo("c.jpg"),
      photo("d.jpg"),
      pdf,
    ];
    fireEvent.change(screen.getByLabelText("Receipts"), {
      target: { files: picked },
    });

    await screen.findByText("5 of 5 files · 1.1 MB of 4 MB");
    const files = onFiles.mock.calls.at(-1)![0] as File[];
    expect(files.map((f) => f.name)).toEqual([
      "a.jpg",
      "b.jpg",
      "c.jpg",
      "d.jpg",
      "slip.pdf",
    ]);
    expect(files.reduce((n, f) => n + f.size, 0)).toBeLessThan(4 * 1024 * 1024);
    expect(downscaleForUpload).toHaveBeenCalledWith(picked[0], RECEIPT_UPLOAD);
  });

  it("still counts a photo picked twice once, though it was shrunk", async () => {
    const onFiles = vi.fn();
    render(<Harness onFiles={onFiles} />);
    const input = screen.getByLabelText("Receipts");
    const same = photo("a.jpg");
    fireEvent.change(input, { target: { files: [same] } });
    await screen.findByText("1 of 5 files · 0.3 MB of 4 MB");
    fireEvent.change(input, { target: { files: [same] } });
    await waitFor(() => expect(onFiles).toHaveBeenCalledTimes(1));
    expect(screen.getByText("1 of 5 files · 0.3 MB of 4 MB")).toBeTruthy();
  });
});
