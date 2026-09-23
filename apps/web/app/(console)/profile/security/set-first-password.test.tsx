import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The first-password form. It must need no current password (the member never
// had one), show the server's refusal beside the field, and re-read the page
// on success so the card turns into "Change password".

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("./actions", () => ({ setFirstPassword: vi.fn() }));

import { PASSWORD_MIN_LENGTH } from "@camp404/core";
import { toast } from "@camp404/ui/components/toast";
import { setFirstPassword } from "./actions";
import { SetFirstPassword } from "./set-first-password";

const GOOD = "correct horse battery staple";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

function type(value: string) {
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value },
  });
}

describe("SetFirstPassword", () => {
  it("asks for one new password and no current one", () => {
    render(<SetFirstPassword onSet={vi.fn()} />);
    expect(screen.getByLabelText("New password")).toBeTruthy();
    expect(screen.queryByLabelText("Current password")).toBeNull();
  });

  it("keeps the button off until the password is long enough", () => {
    render(<SetFirstPassword onSet={vi.fn()} />);
    const button = screen.getByRole("button", { name: "Add password" });

    type("x".repeat(PASSWORD_MIN_LENGTH - 1));
    expect((button as HTMLButtonElement).disabled).toBe(true);
    type("x".repeat(PASSWORD_MIN_LENGTH));
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("re-reads the page after the password is added", async () => {
    vi.mocked(setFirstPassword).mockResolvedValue({ ok: true });
    const onSet = vi.fn();
    render(<SetFirstPassword onSet={onSet} />);

    type(GOOD);
    fireEvent.click(screen.getByRole("button", { name: "Add password" }));

    await waitFor(() => expect(onSet).toHaveBeenCalledTimes(1));
    expect(setFirstPassword).toHaveBeenCalledWith(GOOD);
    expect(toast.success).toHaveBeenCalled();
  });

  it("shows a refusal beside the field and stays put", async () => {
    vi.mocked(setFirstPassword).mockResolvedValue({
      ok: false,
      error:
        "Your account already has a password. Reload the page to change it.",
    });
    const onSet = vi.fn();
    render(<SetFirstPassword onSet={onSet} />);

    type(GOOD);
    fireEvent.click(screen.getByRole("button", { name: "Add password" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "already has a password",
    );
    expect(onSet).not.toHaveBeenCalled();
  });
});
