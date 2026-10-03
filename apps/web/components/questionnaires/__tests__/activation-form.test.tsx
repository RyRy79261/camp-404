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

// --- "Who answers?" (#313) ----------------------------------------------------
// A captain chooses between today's send and an optional questionnaire that
// sits in My forms for anyone who wants it. A team lead is never asked.

describe("ActivationForm — who answers (optional questionnaires)", () => {
  function captainForm() {
    return renderForm({
      offerOptIn: true,
      campMemberCount: 38,
      yearLabel: "2027",
    });
  }

  it("asks a captain first, with today's send chosen and unchanged", () => {
    captainForm();
    const who = screen.getByRole("radiogroup", { name: "Who answers?" });
    expect(who).toBeTruthy();
    expect(
      screen
        .getByRole("radio", { name: /People you choose must answer/ })
        .getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("Audience")).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Blocking" })).toBeTruthy();
    expect(sendButton()).toBeTruthy();
  });

  it("the optional choice says what happens, drops the audience and Blocking, and keeps the button in place", () => {
    captainForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /Anyone may answer \(optional\)/ }),
    );
    expect(screen.getByText("What happens when you send")).toBeTruthy();
    expect(
      screen.getByText(/in My forms for all 38 camp members\./),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Nobody is blocked, and it is not on anyone's to-do list.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("No reminders go out.")).toBeTruthy();
    expect(screen.queryByText("Audience")).toBeNull();
    expect(screen.queryByRole("switch", { name: "Blocking" })).toBeNull();
    expect(screen.queryByLabelText("Due date (optional)")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Send questionnaire" }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: "Put it in My forms" }),
    ).toBeTruthy();
    expect(
      screen.getByText("Opens for 2027 in My forms. No message goes out."),
    ).toBeTruthy();
    // Nothing to count: nobody is asked.
    expect(screen.queryByText(/will receive this/)).toBeNull();
  });

  it("puts it in My forms quietly by default", async () => {
    captainForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /Anyone may answer \(optional\)/ }),
    );
    const tell = screen.getByRole("switch", {
      name: "Tell everyone it's there",
    });
    expect(tell.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Put it in My forms" }));
    await waitFor(() => expect(sendAction).toHaveBeenCalledTimes(1));
    expect(sendAction).toHaveBeenCalledWith("feedback", {
      scope: "opt_in",
      blocking: false,
      announce: false,
    });
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/captains/questionnaires/feedback"),
    );
  });

  it("tells everyone once when the captain switches it on", async () => {
    captainForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /Anyone may answer \(optional\)/ }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Tell everyone it's there" }),
    );
    expect(
      screen.getByText(
        "Opens for 2027 in My forms. Each member gets one inbox note.",
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Put it in My forms" }));
    await waitFor(() =>
      expect(sendAction).toHaveBeenCalledWith(
        "feedback",
        expect.objectContaining({ scope: "opt_in", announce: true }),
      ),
    );
  });

  it("reports the server's refusal and stays put", async () => {
    vi.mocked(sendAction).mockResolvedValue({
      ok: false,
      error: "You can only send to a team you lead.",
    });
    captainForm();
    fireEvent.click(
      screen.getByRole("radio", { name: /Anyone may answer \(optional\)/ }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Put it in My forms" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Could not put it in My forms", {
        description: "You can only send to a team you lead.",
      }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("never asks a team lead", () => {
    renderForm({
      members: [],
      scopeOptions: [{ value: "team", label: "A team" }],
      teamOptions: teamOptions.slice(0, 1),
      asLead: true,
    });
    expect(
      screen.queryByRole("radiogroup", { name: "Who answers?" }),
    ).toBeNull();
    expect(screen.queryByText(/Anyone may answer/)).toBeNull();
    expect(sendButton()).toBeTruthy();
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
