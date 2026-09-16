import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ImageUploadButton } from "../image-upload-button";

// The image block's "Upload a picture": posts the file for this questionnaire
// and hands back the stored link, or shows why it failed.

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function pick(file: File) {
  const input = document.querySelector(
    'input[type="file"]',
  ) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

describe("ImageUploadButton", () => {
  it("uploads for this questionnaire and returns the link", async () => {
    const fetchFn = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        url: "/api/avatar?pathname=builder-images%2Fmap.jpg",
      }),
    }));
    vi.stubGlobal("fetch", fetchFn);
    const onUploaded = vi.fn();
    render(
      <ImageUploadButton questionnaireKey="camp-map" onUploaded={onUploaded} />,
    );

    pick(new File([new Uint8Array([1])], "map.jpg", { type: "image/jpeg" }));

    await waitFor(() =>
      expect(onUploaded).toHaveBeenCalledWith(
        "/api/avatar?pathname=builder-images%2Fmap.jpg",
      ),
    );
    expect((fetchFn.mock.calls[0] as unknown[])[0]).toBe(
      "/api/uploads/builder-image?questionnaire=camp-map",
    );
  });

  it("shows the server's reason when the upload is refused", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: "The picture is larger than 5 MB." }),
      })),
    );
    const onUploaded = vi.fn();
    render(
      <ImageUploadButton questionnaireKey="camp-map" onUploaded={onUploaded} />,
    );

    pick(new File([new Uint8Array([1])], "big.jpg", { type: "image/jpeg" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "The picture is larger than 5 MB.",
    );
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
