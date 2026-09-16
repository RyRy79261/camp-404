import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../actions", () => ({
  sendAction: vi.fn(),
  closeActivationAction: vi.fn(),
  previewAudienceCount: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { AudienceCount, SendForm } from "./send-form";
import {
  closeActivationAction,
  previewAudienceCount,
  sendAction,
} from "../../actions";

const members = [
  { id: "m1", label: "Ada", sub: "kitchen" },
  { id: "m2", label: "Grace", sub: "structures" },
];

const scopeOptions = [
  { value: "everyone", label: "Everyone" },
  { value: "team", label: "A team" },
  { value: "team_leads", label: "Team leads" },
  { value: "individual", label: "Specific members" },
];
const teamOptions = [
  { value: "kitchen", label: "Kitchen" },
  { value: "structures", label: "Structures" },
];

function renderForm(openActivationId: string | null = null) {
  return render(
    <SendForm
      questionnaireKey="feedback"
      title="Feedback"
      members={members}
      scopeOptions={scopeOptions}
      teamOptions={teamOptions}
      openActivationId={openActivationId}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendAction).mockResolvedValue({ ok: true, activationId: "act1" });
  vi.mocked(closeActivationAction).mockResolvedValue({ ok: true });
  vi.mocked(previewAudienceCount).mockResolvedValue({ ok: true, count: 7 });
});

describe("SendForm", () => {
  it("sends directly for a non-blocking everyone send", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: false }),
    );
  });

  it("asks for confirmation before a blocking send to everyone", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("switch")); // turn blocking on
    fireEvent.click(screen.getByRole("button", { name: /^Send$/ }));

    // The confirm dialog appears and nothing is sent yet.
    expect(
      await screen.findByText("Block everyone in camp?"),
    ).toBeTruthy();
    expect(sendAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send to everyone" }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: true }),
    );
  });

  it("offers to close the current send instead of a form when one is open", async () => {
    renderForm("act1");
    expect(screen.getByText(/already sent/i)).toBeTruthy();
    // no scope picker is rendered in this state
    expect(screen.queryByLabelText(/Who should answer/i)).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Close current send/i }),
    );
    await waitFor(() =>
      expect(closeActivationAction).toHaveBeenCalledWith("act1", "feedback"),
    );
    expect(sendAction).not.toHaveBeenCalled();
  });
});

// --- The zero-vs-null contract (item 2.6) ----------------------------------
// One predicate carries the whole value of this item:
//   showCount = count !== null && count !== undefined
// `null` hides the line; `0` SHOWS it. Getting it backwards — treating 0 as
// falsy — hides exactly the case the preview exists to expose, so it is pinned
// here rather than left to the component's shape.

describe("AudienceCount", () => {
  it("SHOWS the line at zero", () => {
    render(<AudienceCount count={0} />);
    expect(screen.getByRole("status").textContent).toMatch(/no members/i);
  });

  it("hides the line for null", () => {
    render(<AudienceCount count={null} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("hides the line for undefined", () => {
    render(<AudienceCount count={undefined} />);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("renders the singular for exactly one", () => {
    render(<AudienceCount count={1} />);
    expect(screen.getByRole("status").textContent).toBe(
      "This will reach 1 member.",
    );
  });

  it("renders the plural for many", () => {
    render(<AudienceCount count={12} />);
    expect(screen.getByRole("status").textContent).toBe(
      "This will reach 12 members.",
    );
  });
});

describe("SendForm — audience preview", () => {
  it("debounces: nothing is asked of the server on the first render tick", () => {
    renderForm();
    expect(previewAudienceCount).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the previewed count once the debounce settles", async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "This will reach 7 members.",
      ),
    );
    expect(previewAudienceCount).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "everyone", team: null }),
    );
  });

  it("shows a zero-recipient send instead of letting it look fine", async () => {
    vi.mocked(previewAudienceCount).mockResolvedValue({ ok: true, count: 0 });
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/no members/i),
    );
  });

  it("keeps the line hidden when the preview refuses", async () => {
    vi.mocked(previewAudienceCount).mockResolvedValue({
      ok: false,
      error: "opt_in activations are not yet supported.",
    });
    renderForm();
    await waitFor(() => expect(previewAudienceCount).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("asks for no preview at all while a send is already open", async () => {
    renderForm("act1");
    expect(screen.getByText(/already sent/i)).toBeTruthy();
    // Past the 300 ms debounce window — the effect bails before the timer, so
    // the locked "close the current send" state costs no query either.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(previewAudienceCount).not.toHaveBeenCalled();
  });
});
