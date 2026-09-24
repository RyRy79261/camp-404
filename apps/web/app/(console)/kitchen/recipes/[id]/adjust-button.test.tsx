import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "Adjust with Claude" with the actions mocked: the dialog asks "What should
// change?" and refuses an empty answer inline; Send to Claude queues an
// adjust run for THIS version, and the dialog shows the loading panel with
// the stage the server reports on each poll; Claude's questions open the
// questions dialog, and the button waits as "Claude needs more details —
// answer here"; a finished run opens the recipe page (or reloads it there);
// a failure says why beside the words, which stay.

vi.mock("../actions", () => ({
  adjustVersionAction: vi.fn(),
  answerProofreadQuestionsAction: vi.fn(),
  proofreadProgressAction: vi.fn(),
}));
const push = vi.fn();
const refresh = vi.fn();
let pathname =
  "/kitchen/recipes/11111111-1111-4111-8111-111111111111/versions/1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push }),
  usePathname: () => pathname,
}));

import {
  adjustVersionAction,
  answerProofreadQuestionsAction,
  proofreadProgressAction,
} from "../actions";
import { POLL_MS } from "@/components/recipes/proofread-questions";
import { ANSWER_QUESTIONS_LABEL } from "@/lib/recipe-copy";
import { AdjustButton } from "./adjust-button";

const RECIPE = "11111111-1111-4111-8111-111111111111";
const VERSION = "22222222-2222-4222-8222-222222222222";
const QUESTIONS = ["Which squash? The request says “something orange”."];

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

async function poll() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(POLL_MS);
  });
}

const panel = () => screen.queryByRole("status", { name: "Proofreading" });
const current = () =>
  panel()?.querySelector('[aria-current="step"]')?.textContent ?? null;

async function openAndSend(words: string) {
  fireEvent.click(screen.getByRole("button", { name: "Adjust with Claude" }));
  fireEvent.change(screen.getByLabelText("What should change?"), {
    target: { value: words },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Send to Claude" }));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  pathname = `/kitchen/recipes/${RECIPE}/versions/1`;
  vi.mocked(adjustVersionAction).mockResolvedValue({
    ok: true,
    data: { runId: "run-1" },
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

describe("AdjustButton", () => {
  it("refuses an empty change inline, sending nothing", async () => {
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={1} />);
    await openAndSend("   ");
    expect(screen.getByRole("alert").textContent).toBe(
      "Say what should change.",
    );
    expect(adjustVersionAction).not.toHaveBeenCalled();
  });

  it("sends the change for this version, follows the stages, and opens the recipe page", async () => {
    serverSays(
      progress({ stage: "reading" }),
      progress({ stage: "checking" }),
      progress({ outcome: "succeeded", stage: "saving" }),
    );
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={1} />);
    await openAndSend("Use butternut instead of sweet potato.");
    expect(screen.getByText(/from version 1 and what you say/)).toBeTruthy();
    expect(adjustVersionAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      versionId: VERSION,
      instruction: "Use butternut instead of sweet potato.",
    });
    expect(current()).toContain("Sending the recipe");
    await poll();
    expect(current()).toContain("Claude is reading it");
    expect(proofreadProgressAction).toHaveBeenLastCalledWith({
      recipeId: RECIPE,
      runId: "run-1",
    });
    await poll();
    expect(current()).toContain("Checking the structure");
    await poll();
    expect(panel()).toBeNull();
    expect(push).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE}`);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("reloads the recipe page when that is where it is", async () => {
    pathname = `/kitchen/recipes/${RECIPE}`;
    serverSays(progress({ outcome: "succeeded", stage: "saving" }));
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={3} />);
    await openAndSend("Less chilli.");
    await poll();
    expect(refresh).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it("opens Claude's questions, waits as the answer button, and follows the next round", async () => {
    serverSays(progress({ outcome: "succeeded", questions: QUESTIONS }));
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={1} />);
    await openAndSend("Add something orange.");
    await poll();
    expect(
      screen.getByText("Claude needs more before it can write this recipe"),
    ).toBeTruthy();
    expect(screen.getByText(QUESTIONS[0]!)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Answer later" }));
    expect(
      screen.getByRole("button", { name: ANSWER_QUESTIONS_LABEL }),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: ANSWER_QUESTIONS_LABEL }),
    );
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "Butternut." },
    });
    serverSays(
      progress({ stage: "reading" }),
      progress({ outcome: "succeeded", stage: "saving" }),
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    });
    expect(answerProofreadQuestionsAction).toHaveBeenCalledWith({
      recipeId: RECIPE,
      runId: "run-1",
      answer: "Butternut.",
    });
    expect(panel()).not.toBeNull();
    await poll();
    expect(proofreadProgressAction).toHaveBeenLastCalledWith({
      recipeId: RECIPE,
      runId: "run-2",
    });
    await poll();
    expect(push).toHaveBeenCalledWith(`/kitchen/recipes/${RECIPE}`);
  });

  it("says why a run failed beside the words, which stay", async () => {
    serverSays(
      progress({ outcome: "failed", error: "Claude took too long to answer." }),
    );
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={1} />);
    await openAndSend("Less salt.");
    await poll();
    expect(screen.getByRole("alert").textContent).toBe(
      "Claude took too long to answer.",
    );
    expect(
      (screen.getByLabelText("What should change?") as HTMLTextAreaElement)
        .value,
    ).toBe("Less salt.");
    expect(push).not.toHaveBeenCalled();
  });

  it("passes the server's refusal through inline", async () => {
    vi.mocked(adjustVersionAction).mockResolvedValueOnce({
      ok: false,
      error: "Only a Kitchen lead or a captain can send a recipe to Claude.",
    });
    render(<AdjustButton recipeId={RECIPE} versionId={VERSION} version={1} />);
    await openAndSend("Less salt.");
    expect(screen.getByRole("alert").textContent).toBe(
      "Only a Kitchen lead or a captain can send a recipe to Claude.",
    );
    expect(panel()).toBeNull();
  });

  it("is disabled while another run on the recipe is with Claude", () => {
    render(
      <AdjustButton
        recipeId={RECIPE}
        versionId={VERSION}
        version={1}
        run={{
          runId: "run-0",
          stage: "reading",
          outcome: "running",
          questions: null,
        }}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "Adjust with Claude",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});
