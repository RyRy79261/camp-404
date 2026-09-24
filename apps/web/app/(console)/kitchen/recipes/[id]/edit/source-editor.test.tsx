import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptySourceSections } from "@camp404/core";

// The source editor's flow with the actions mocked: Send queues a run and
// the panel follows the stage the server reports on each poll; a run that
// asked questions opens the dialog; Close keeps the questions on the page;
// Send answer queues the next round; a finished run opens the recipe page;
// a failed one says why and gives the button back.

vi.mock("../../actions", () => ({
  sendSourceForProofreadingAction: vi.fn(),
  answerProofreadQuestionsAction: vi.fn(),
  proofreadProgressAction: vi.fn(),
}));
vi.mock("@/components/recipes/source-section-editor", () => ({
  SourceSectionEditor: ({ ariaLabel }: { ariaLabel: string }) => (
    <div role="textbox" aria-label={ariaLabel} />
  ),
}));
const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push }),
}));

import {
  answerProofreadQuestionsAction,
  proofreadProgressAction,
  sendSourceForProofreadingAction,
} from "../../actions";
import {
  POLL_MS,
  SourceEditor,
  UNREACHABLE,
  type OpenRun,
} from "./source-editor";

const RECIPE = "11111111-1111-4111-8111-111111111111";
const QUESTIONS = ["How much coconut milk?", "Ground or whole cumin?"];
const TITLE = "Claude needs more before it can write this recipe";

type Progress = {
  stage: "sending" | "reading" | "checking" | "saving" | null;
  outcome: "queued" | "running" | "succeeded" | "failed";
  questions: string[] | null;
  error: string | null;
};

function progress(overrides: Partial<Progress>): Progress {
  return {
    stage: null,
    outcome: "running",
    questions: null,
    error: null,
    ...overrides,
  };
}

/** The server answers each poll with the next of these, then the last again. */
function serverSays(...answers: Progress[]) {
  const queue = [...answers];
  vi.mocked(proofreadProgressAction).mockImplementation(async () => ({
    ok: true,
    data: queue.length > 1 ? queue.shift()! : queue[0]!,
  }));
}

function renderEditor(run: OpenRun | null = null) {
  render(
    <SourceEditor
      recipeId={RECIPE}
      title="Camp dal"
      basedOnSourceId="source-1"
      serves={6}
      sections={emptySourceSections()}
      run={run}
    />,
  );
}

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS);
  });
}

const panel = () => screen.queryByRole("status", { name: "Proofreading" });
const current = () =>
  panel()?.querySelector('[aria-current="step"]')?.textContent ?? null;
const sendButton = (hidden = false) =>
  screen.queryByRole("button", { name: "Send for proofreading", hidden });

async function pressSend() {
  await act(async () => {
    fireEvent.click(sendButton()!);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.mocked(sendSourceForProofreadingAction).mockResolvedValue({
    ok: true,
    data: { runId: "run-1", sourceId: "source-2" },
  });
  vi.mocked(answerProofreadQuestionsAction).mockResolvedValue({
    ok: true,
    data: { runId: "run-2" },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("source editor", () => {
  it("sends the source, then follows the stages the server reports, and opens the recipe", async () => {
    serverSays(
      progress({ outcome: "running", stage: "reading" }),
      progress({ outcome: "running", stage: "checking" }),
      progress({ outcome: "running", stage: "saving" }),
      progress({ outcome: "succeeded", stage: "saving" }),
    );
    renderEditor();
    fireEvent.change(screen.getByLabelText("Serves"), {
      target: { value: "8" },
    });
    await pressSend();

    expect(sendSourceForProofreadingAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      basedOnSourceId: "source-1",
      serves: 8,
      sections: emptySourceSections(),
    });
    expect(sendButton()).toBeNull();
    expect(current()).toContain("Sending the recipe");

    await poll();
    expect(current()).toContain("Claude is reading it");
    await poll();
    expect(current()).toContain("Checking the structure");
    await poll();
    expect(current()).toContain("Saving");
    expect(push).not.toHaveBeenCalled();
    await poll();
    expect(push).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE}`);
    // It polls the run it started, not whatever the recipe points at.
    expect(proofreadProgressAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      runId: "run-1",
    });
  });

  it("sends an empty Serves as null", async () => {
    serverSays(progress({ outcome: "queued" }));
    renderEditor();
    fireEvent.change(screen.getByLabelText("Serves"), {
      target: { value: "" },
    });
    await pressSend();
    expect(sendSourceForProofreadingAction).toHaveBeenCalledWith(
      expect.objectContaining({ serves: null }),
    );
  });

  it("opens the questions, keeps them on the page after Close, and sends the answer", async () => {
    serverSays(
      progress({ outcome: "running", stage: "reading" }),
      progress({ outcome: "succeeded", questions: QUESTIONS }),
    );
    renderEditor();
    await pressSend();
    await poll();
    await poll();

    const dialog = screen.getByRole("dialog", { name: TITLE });
    expect(within(dialog).getByText(QUESTIONS[0]!)).toBeTruthy();
    expect(within(dialog).getByText(QUESTIONS[1]!)).toBeTruthy();
    expect(panel()).toBeNull();

    // An empty answer is refused inline, and nothing is sent.
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Send answer" }),
      );
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(
      "Write your answer.",
    );
    expect(answerProofreadQuestionsAction).not.toHaveBeenCalled();

    // Close: the questions stay above Serves, and the button is back.
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "Close and edit the source",
        }),
      );
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: TITLE })).toBeTruthy();
    expect(screen.getByText(QUESTIONS[1]!)).toBeTruthy();
    expect(sendButton()).toBeTruthy();

    // A reload with the questions unanswered opens the dialog again.
    cleanup();
    serverSays(progress({ outcome: "running", stage: "reading" }));
    renderEditor({
      runId: "run-1",
      outcome: "succeeded",
      stage: "saving",
      questions: QUESTIONS,
    });
    const again = screen.getByRole("dialog", { name: TITLE });
    fireEvent.change(within(again).getByLabelText("Your answer"), {
      target: { value: "Two tins, and ground." },
    });
    await act(async () => {
      fireEvent.click(
        within(again).getByRole("button", { name: "Send answer" }),
      );
    });
    expect(answerProofreadQuestionsAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      runId: "run-1",
      answer: "Two tins, and ground.",
    });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(current()).toContain("Sending the recipe");
    await poll();
    expect(current()).toContain("Claude is reading it");
    // The questions go once the next round is under way.
    expect(screen.queryByText(QUESTIONS[0]!)).toBeNull();
  });

  it("answers the questions of the run it sent, and a later send is based on the version it saved", async () => {
    serverSays(progress({ outcome: "succeeded", questions: QUESTIONS }));
    renderEditor();
    await pressSend();
    await poll();
    const dialog = screen.getByRole("dialog", { name: TITLE });
    fireEvent.change(within(dialog).getByLabelText("Your answer"), {
      target: { value: "Two tins." },
    });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Send answer" }),
      );
    });
    expect(answerProofreadQuestionsAction).toHaveBeenCalledWith(
      expect.objectContaining({ runId: "run-1" }),
    );

    serverSays(progress({ outcome: "failed", error: "Claude timed out." }));
    await poll();
    await pressSend();
    expect(sendSourceForProofreadingAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ basedOnSourceId: "source-2" }),
    );
  });

  it("says why a run failed, where the panel was, and gives the button back", async () => {
    serverSays(progress({ outcome: "failed", error: "Claude timed out." }));
    renderEditor();
    await pressSend();
    await poll();
    expect(panel()).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Claude timed out.");
    expect(sendButton()).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("shows a refused send above the sections, with no run started", async () => {
    vi.mocked(sendSourceForProofreadingAction).mockResolvedValue({
      ok: false,
      error: "Claude has done all it can today. Try again tomorrow.",
    });
    renderEditor();
    await pressSend();
    expect(screen.getByRole("alert").textContent).toBe(
      "Claude has done all it can today. Try again tomorrow.",
    );
    expect(panel()).toBeNull();
    expect(sendButton()).toBeTruthy();
    await poll();
    expect(proofreadProgressAction).not.toHaveBeenCalled();
  });

  it("gives the Send button back with a sentence when the server cannot be reached", async () => {
    vi.mocked(sendSourceForProofreadingAction).mockRejectedValue(
      new Error("Failed to fetch"),
    );
    renderEditor();
    await pressSend();
    expect(screen.getByRole("alert").textContent).toBe(UNREACHABLE);
    expect(sendButton()).toBeTruthy();
    expect(panel()).toBeNull();

    // The same for an answer: the button works again, and says why.
    cleanup();
    vi.mocked(answerProofreadQuestionsAction).mockRejectedValue(
      new Error("Failed to fetch"),
    );
    renderEditor({
      runId: "run-1",
      outcome: "succeeded",
      stage: "saving",
      questions: QUESTIONS,
    });
    const dialog = screen.getByRole("dialog", { name: TITLE });
    fireEvent.change(within(dialog).getByLabelText("Your answer"), {
      target: { value: "Two tins." },
    });
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Send answer" }),
      );
    });
    expect(within(dialog).getByRole("alert").textContent).toBe(UNREACHABLE);
    expect(
      (
        within(dialog).getByRole("button", {
          name: "Send answer",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("resumes polling a run that was open when the page loaded", async () => {
    serverSays(progress({ outcome: "running", stage: "checking" }));
    renderEditor({
      runId: "run-1",
      outcome: "running",
      stage: "reading",
      questions: null,
    });
    expect(sendButton()).toBeNull();
    expect(current()).toContain("Claude is reading it");
    await poll();
    expect(current()).toContain("Checking the structure");
  });
});
