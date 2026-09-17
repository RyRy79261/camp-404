import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));
vi.mock("@/app/(console)/captains/questionnaires/actions", () => ({
  sendAction: vi.fn(),
  closeActivationAction: vi.fn(),
  previewAudienceCount: vi.fn(),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { toast } from "@camp404/ui/components/toast";
import {
  closeActivationAction,
  previewAudienceCount,
  sendAction,
} from "@/app/(console)/captains/questionnaires/actions";
import {
  ActivationForm,
  sendRefusal,
  type ActivationFormProps,
} from "../activation-form";

const members = [
  { id: "11111111-1111-4111-8111-111111111111", label: "Ada", sub: "Kitchen" },
  {
    id: "22222222-2222-4222-8222-222222222222",
    label: "Grace",
    sub: "Structures",
  },
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

function renderForm(over: Partial<ActivationFormProps> = {}) {
  return render(
    <ActivationForm
      questionnaireKey="feedback"
      title="Feedback"
      members={members}
      scopeOptions={scopeOptions}
      teamOptions={teamOptions}
      openActivationId={null}
      {...over}
    />,
  );
}

function sendButton() {
  return screen.getByRole("button", { name: "Send questionnaire" });
}

function preview() {
  return screen.getByRole("status");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(sendAction).mockResolvedValue({ ok: true, activationId: "act1" });
  vi.mocked(closeActivationAction).mockResolvedValue({ ok: true });
  vi.mocked(previewAudienceCount).mockResolvedValue({ ok: true, count: 7 });
});

describe("ActivationForm — sending", () => {
  it("sends directly for a non-blocking everyone send", async () => {
    renderForm();
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: false }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/captains/questionnaires/feedback"),
    );
  });

  it("asks for confirmation before a blocking send to everyone", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("switch", { name: "Blocking" }));
    fireEvent.click(sendButton());

    // The confirm dialog appears and nothing is sent yet.
    expect(await screen.findByText("Block everyone in camp?")).toBeTruthy();
    expect(sendAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Send to everyone" }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({ scope: "everyone", blocking: true }),
    );
  });

  it("sends to the team picked, with the due date as an instant", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /A team/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Structures" }));
    fireEvent.change(screen.getByLabelText("Due date (optional)"), {
      target: { value: "2027-03-01T18:00" },
    });
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith("feedback", {
      scope: "team",
      team: "structures",
      blocking: false,
      dueAt: new Date("2027-03-01T18:00").toISOString(),
      targetUserIds: undefined,
    });
  });

  it("names what is missing instead of sending, and asks the server nothing", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /A team/ }));
    fireEvent.click(sendButton());
    expect(toast.error).toHaveBeenCalledWith("Pick a team to send this to.");
    expect(sendAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: /Specific members/ }));
    fireEvent.click(sendButton());
    expect(toast.error).toHaveBeenCalledWith(
      "Pick at least one member to send this to.",
    );
    expect(sendAction).not.toHaveBeenCalled();
  });

  it("sends to the members ticked", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /Specific members/ }));
    fireEvent.change(screen.getByLabelText("Search members"), {
      target: { value: "gra" },
    });
    expect(screen.queryByLabelText("Ada")).toBeNull();
    fireEvent.click(screen.getByLabelText("Grace"));
    fireEvent.click(sendButton());
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith(
      "feedback",
      expect.objectContaining({
        scope: "individual",
        targetUserIds: [members[1]!.id],
      }),
    );
  });

  it("reports the server's refusal", async () => {
    vi.mocked(sendAction).mockResolvedValue({
      ok: false,
      error: "You can only send to a team you lead.",
    });
    renderForm();
    fireEvent.click(sendButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not send", {
        description: "You can only send to a team you lead.",
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("pre-fills the choices handed over, for the author to confirm", () => {
    renderForm({
      initialAudience: { scope: "team", team: "kitchen" },
      initialBlocking: true,
      initialDueAt: "2027-03-01T23:59",
    });
    expect(
      screen
        .getByRole("radio", { name: /A team/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("radio", { name: "Kitchen" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      screen
        .getByRole("switch", { name: "Blocking" })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(
      (screen.getByLabelText("Due date (optional)") as HTMLInputElement).value,
    ).toBe("2027-03-01T23:59");
  });

  it("ignores a pre-filled team the form doesn't offer", () => {
    renderForm({
      initialAudience: { scope: "team", team: "ministry_of_memes" },
    });
    expect(
      screen
        .getAllByRole("radio")
        .filter((r) => r.getAttribute("aria-checked") === "true")
        .map((r) => r.textContent),
    ).toEqual([expect.stringContaining("A team")]);
  });
});

describe("ActivationForm — an open send", () => {
  it("offers to close the current send instead of a form", async () => {
    renderForm({ openActivationId: "act1" });
    expect(screen.getByText(/already sent/i)).toBeTruthy();
    expect(
      screen.queryByRole("radiogroup", { name: /Who should answer/i }),
    ).toBeNull();

    fireEvent.click(
      screen.getByRole("button", { name: /Close current send/i }),
    );
    // Closing expires every unanswered gate, so it asks first.
    await screen.findByText("Close the current send?");
    expect(closeActivationAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Close send" }));
    await waitFor(() =>
      expect(closeActivationAction).toHaveBeenCalledWith("act1", "feedback"),
    );
    expect(sendAction).not.toHaveBeenCalled();
  });

  it("closes nothing when the captain cancels", async () => {
    renderForm({ openActivationId: "act1" });
    fireEvent.click(
      screen.getByRole("button", { name: /Close current send/i }),
    );
    await screen.findByText("Close the current send?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByText("Close the current send?")).toBeNull(),
    );
    expect(closeActivationAction).not.toHaveBeenCalled();
  });

  it("asks for no preview at all while a send is already open", async () => {
    renderForm({ openActivationId: "act1" });
    // Past the 300 ms debounce window.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(previewAudienceCount).not.toHaveBeenCalled();
  });
});

describe("ActivationForm — a team lead", () => {
  it("is offered a team alone, and no close button", () => {
    const lead = {
      members: [],
      scopeOptions: [{ value: "team", label: "A team" }],
      teamOptions: teamOptions.slice(0, 1),
      asLead: true,
    };
    const { unmount } = renderForm(lead);
    expect(
      screen.getAllByRole("radio", { name: /A team|Everyone|leads|members/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("radiogroup", { name: "Which team?" }),
    ).toBeTruthy();
    expect(screen.getByText("Everyone on a team you lead.")).toBeTruthy();
    unmount();

    renderForm({ ...lead, openActivationId: "act1" });
    expect(screen.getByText(/A captain can close that send/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: /Close current send/i }),
    ).toBeNull();
  });
});

// --- The live audience count ------------------------------------------------
// Zero is SHOWN: a team with nobody on it reaches nobody and the send would
// still report success. An incomplete audience asks the server nothing.

describe("ActivationForm — audience preview", () => {
  it("debounces: nothing is asked of the server on the first render tick", () => {
    renderForm();
    expect(previewAudienceCount).not.toHaveBeenCalled();
    expect(preview().textContent).toBe("Resolving audience…");
  });

  it("shows the previewed count once the debounce settles", async () => {
    renderForm();
    await waitFor(() =>
      expect(preview().textContent).toBe(
        "7 members will receive this right now.",
      ),
    );
    expect(previewAudienceCount).toHaveBeenCalledWith({
      scope: "everyone",
      team: null,
      targetUserIds: [],
    });
  });

  it("renders the singular for exactly one", async () => {
    vi.mocked(previewAudienceCount).mockResolvedValue({ ok: true, count: 1 });
    renderForm();
    await waitFor(() =>
      expect(preview().textContent).toBe(
        "1 member will receive this right now.",
      ),
    );
  });

  it("shows a zero-recipient send instead of letting it look fine", async () => {
    vi.mocked(previewAudienceCount).mockResolvedValue({ ok: true, count: 0 });
    renderForm();
    await waitFor(() =>
      expect(preview().textContent).toMatch(/would reach no members/i),
    );
  });

  it("shows the server's refusal rather than a number", async () => {
    vi.mocked(previewAudienceCount).mockResolvedValue({
      ok: false,
      error: "You can only send to a team you lead.",
    });
    renderForm();
    await waitFor(() =>
      expect(preview().textContent).toBe(
        "You can only send to a team you lead.",
      ),
    );
    expect(preview().textContent).not.toMatch(/\d/);
  });

  it("asks the server nothing until a team is picked", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("radio", { name: /A team/ }));
    expect(preview().textContent).toBe(
      "Pick a team to see how many people it reaches.",
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(previewAudienceCount).not.toHaveBeenCalledWith(
      expect.objectContaining({ scope: "team" }),
    );

    fireEvent.click(screen.getByRole("radio", { name: "Kitchen" }));
    await waitFor(() =>
      expect(previewAudienceCount).toHaveBeenCalledWith({
        scope: "team",
        team: "kitchen",
        targetUserIds: [],
      }),
    );
  });
});

describe("sendRefusal", () => {
  it("names the missing team", () => {
    expect(sendRefusal({ scope: "team", team: "", selectedCount: 0 })).toBe(
      "Pick a team to send this to.",
    );
    expect(
      sendRefusal({ scope: "team", team: "kitchen", selectedCount: 0 }),
    ).toBeNull();
  });

  it("names the missing members", () => {
    expect(
      sendRefusal({ scope: "individual", team: "", selectedCount: 0 }),
    ).toBe("Pick at least one member to send this to.");
    expect(
      sendRefusal({ scope: "individual", team: "", selectedCount: 2 }),
    ).toBeNull();
  });

  it("lets everyone and team-lead sends through", () => {
    expect(
      sendRefusal({ scope: "everyone", team: "", selectedCount: 0 }),
    ).toBeNull();
    expect(
      sendRefusal({ scope: "team_leads", team: "", selectedCount: 0 }),
    ).toBeNull();
  });
});
