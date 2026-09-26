import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { captureLastSeen } from "@camp404/os";
import { AccountTwoFactor } from "@camp404/ui/components/account-two-factor";
import { PasswordInput } from "@camp404/ui/components/password-input";

// Sign-in and security lives in the My account window, and the desktop copies
// a window's body before every switch and whenever the page goes idle. A
// background window must never show a two-factor secret or a password: the
// copy is built from the REAL screens here, so a new secret block that is not
// marked shows up as a failure.

const SECRET = "JBSWY3DPEHPK3PXP";
const TOTP_URI = `otpauth://totp/Camp404:alice@example.com?secret=${SECRET}&issuer=Camp404`;
const CODES = ["11112222", "33334444", "55556666"];

type AccountAuthClient = ComponentProps<typeof AccountTwoFactor>["client"];

function client(): AccountAuthClient {
  return {
    twoFactor: {
      enable: vi.fn().mockResolvedValue({
        data: { totpURI: TOTP_URI, backupCodes: CODES },
        error: null,
      }),
      verifyTotp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      verifyBackupCode: vi.fn(),
      disable: vi.fn(),
      generateBackupCodes: vi.fn(),
    },
    passkey: { addPasskey: vi.fn(), deletePasskey: vi.fn() },
  };
}

afterEach(cleanup);

describe("a last-seen copy of Sign-in and security", () => {
  it("blanks the QR code, the setup key and the code being typed", async () => {
    const { container } = render(
      <AccountTwoFactor
        client={client()}
        enabled={false}
        requiresPassword={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Enter the 6-digit code");
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });
    // Present on the live screen first, so the absence below means something.
    expect(container.innerHTML).toContain("JBSW Y3DP");
    // The QR code: the only drawing with more than a few paths' worth of
    // data (it encodes the otpauth URI, secret included).
    const qr = [...container.querySelectorAll("svg path")]
      .map((p) => p.getAttribute("d") ?? "")
      .sort((a, b) => b.length - a.length)[0]!;
    expect(qr.length).toBeGreaterThan(200);

    const html = captureLastSeen(container, 0)!.html;
    expect(html).toContain("Scan this with your app");
    expect(html).not.toContain("JBSW Y3DP");
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain(qr);
    expect(html).not.toContain("123456");
  });

  it("blanks the backup codes, which are shown only once", async () => {
    const { container } = render(
      <AccountTwoFactor
        client={client()}
        enabled={false}
        requiresPassword={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Turn on two-factor" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByLabelText("Enter the 6-digit code");
    fireEvent.change(screen.getByLabelText("Enter the 6-digit code"), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verify and turn on" }));
    await screen.findByText("Save your backup codes now");
    expect(container.textContent).toContain(CODES[0]);

    const html = captureLastSeen(container, 0)!.html;
    expect(html).toContain("Save your backup codes now");
    for (const code of CODES) expect(html).not.toContain(code);
  });

  it("never copies a password, even one the member revealed", () => {
    // Controlled, as every account form is: React then keeps the value
    // attribute in step with the typing.
    function Field() {
      const [value, setValue] = useState("");
      return (
        <PasswordInput
          aria-label="Current password"
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      );
    }
    const { container } = render(<Field />);
    const input = screen.getByLabelText("Current password");
    fireEvent.change(input, { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input.getAttribute("type")).toBe("text");
    expect(container.innerHTML).toContain("correct horse");

    expect(captureLastSeen(container, 0)!.html).not.toContain("correct horse");
  });
});
