import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { AvatarUpload } from "@camp404/ui/components/avatar-upload";

// jsdom has no object-URL impl; stub create/revoke so the preview path runs.
const createObjectURL = vi.fn(() => "blob:preview");
const revokeObjectURL = vi.fn();
const fetchMock = vi.fn();

const webp = async () => new Blob(["x"], { type: "image/webp" });
const fileInput = (c: HTMLElement) =>
  c.querySelector('input[type="file"]') as HTMLInputElement;
const pick = (input: HTMLInputElement) =>
  fireEvent.change(input, {
    target: { files: [new File(["x"], "p.png", { type: "image/png" })] },
  });

beforeEach(() => {
  createObjectURL.mockClear();
  revokeObjectURL.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvatarUpload — board S11", () => {
  it("renders the empty state (camera, Add photo, Upload-a-photo trigger)", () => {
    const { container } = render(<AvatarUpload value={null} onChange={vi.fn()} />);
    expect(screen.getByText("Add photo")).toBeDefined();
    expect(screen.getByRole("button", { name: "Add a profile photo" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Upload a photo" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Remove profile photo" })).toBeNull();
    // Hidden file input is sr-only + image-only (a11y / picker contract).
    const input = fileInput(container);
    expect(input.classList.contains("sr-only")).toBe(true);
    expect(input.getAttribute("accept")).toBe("image/*");
  });

  it("renders the populated state with image, remove button, Change-photo trigger", () => {
    const { container } = render(
      <AvatarUpload value="/api/avatar?pathname=x" onChange={vi.fn()} />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toContain("pathname=x");
    expect(screen.getByRole("button", { name: "Change profile photo" })).toBeDefined();
    expect(
      screen.getByRole("button", { name: "Remove profile photo" }).getAttribute("aria-label"),
    ).toBe("Remove profile photo");
    expect(screen.getByRole("button", { name: "Change photo" })).toBeDefined();
  });

  it("circle and trigger buttons both open the hidden file picker", () => {
    const { container } = render(<AvatarUpload value={null} onChange={vi.fn()} />);
    const clickSpy = vi.spyOn(fileInput(container), "click");
    fireEvent.click(screen.getByRole("button", { name: "Add a profile photo" }));
    fireEvent.click(screen.getByRole("button", { name: "Upload a photo" }));
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });

  it("preprocesses then POSTs to uploadUrl and commits the returned url", async () => {
    const onChange = vi.fn();
    const preprocessImage = vi.fn(webp);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ url: "/api/avatar?pathname=new" }),
    });

    const { container } = render(
      <AvatarUpload
        value={null}
        onChange={onChange}
        preprocessImage={preprocessImage}
        uploadUrl="/custom/upload"
      />,
    );
    pick(fileInput(container));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/api/avatar?pathname=new"));
    expect(preprocessImage).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/custom/upload");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
  });

  it("defaults to /api/uploads/avatar and a passthrough preprocess", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: "/u" }) });
    const { container } = render(<AvatarUpload value={null} onChange={onChange} />);
    pick(fileInput(container));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/u"));
    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/uploads/avatar");
  });

  it("shows the uploading state: preview image, scrim + spinner, disabled controls", async () => {
    let resolveFetch: (v: unknown) => void = () => {};
    fetchMock.mockReturnValue(new Promise((r) => (resolveFetch = r)));
    const onChange = vi.fn();
    const { container } = render(
      <AvatarUpload value={null} onChange={onChange} preprocessImage={webp} />,
    );
    pick(fileInput(container));

    const trigger = await screen.findByRole("button", { name: "Uploading…" });
    expect(trigger).toHaveProperty("disabled", true);
    expect(screen.getByText("Uploading photo")).toBeDefined(); // Spinner sr-only label
    expect(container.innerHTML).toContain("bg-[var(--overlay)]"); // scrim
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:preview");

    resolveFetch({ ok: true, json: async () => ({ url: "/u" }) });
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/u"));
  });

  it("on upload failure surfaces the error and relabels the trigger Try again", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: "Image too large" }),
    });
    const { container } = render(
      <AvatarUpload value={null} onChange={vi.fn()} preprocessImage={webp} />,
    );
    pick(fileInput(container));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Image too large/),
    );
    expect(screen.getByText("Upload failed")).toBeDefined();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDefined();
    expect(container.querySelector("img")).toBeNull(); // circle reverted to empty
  });

  it("falls back to 'Upload failed' on a non-JSON / fieldless error response", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => {
        throw new Error("not json");
      },
    });
    const { container } = render(
      <AvatarUpload value={null} onChange={vi.fn()} preprocessImage={webp} />,
    );
    pick(fileInput(container));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Upload failed/),
    );
  });

  it("surfaces a preprocess (crop) rejection as an error, then allows retry", async () => {
    const { container } = render(
      <AvatarUpload
        value={null}
        onChange={vi.fn()}
        preprocessImage={async () => {
          throw new Error("Canvas crop failed");
        }}
      />,
    );
    pick(fileInput(container));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Canvas crop failed/),
    );
    // "Try again" is wired to re-open the picker.
    const clickSpy = vi.spyOn(fileInput(container), "click");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it("remove clears the value and revokes the object-URL preview", async () => {
    const onChange = vi.fn();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: "/u" }) });
    const { container } = render(
      <AvatarUpload value={null} onChange={onChange} preprocessImage={webp} />,
    );
    pick(fileInput(container));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Remove profile photo" }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });

  it("revokes the object-URL preview on unmount", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ url: "/u" }) });
    const { container, unmount } = render(
      <AvatarUpload value={null} onChange={vi.fn()} preprocessImage={webp} />,
    );
    pick(fileInput(container));
    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    unmount();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:preview");
  });
});
