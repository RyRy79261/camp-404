import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { Questionnaire, type SaveResult } from "@camp404/types";
import { QuestionnaireRunner } from "../questionnaire/runner";

// The shared questionnaire runner: page navigation, validation, branching,
// progress, saves and focus. Text inputs and plain buttons only, so the tests
// are not fighting Radix portals.

const ok = (): Promise<SaveResult> => Promise.resolve({ ok: true });

const TWO_PAGES = Questionnaire.parse({
  version: "test-1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Page One",
      questions: [
        { id: "name", kind: "short_text", prompt: "Your name", required: true },
      ],
    },
    {
      id: "p2",
      kind: "questions",
      title: "Page Two",
      questions: [{ id: "note", kind: "long_text", prompt: "Anything else" }],
    },
  ],
});

// A header break, a conditional question and a conditional note.
const SURVEY = Questionnaire.parse({
  version: "1",
  title: "Survey",
  pages: [
    {
      id: "about",
      kind: "questions",
      title: "About you",
      questions: [
        { id: "h", kind: "header_break", headingText: "Tell us about you" },
        { id: "name", kind: "short_text", prompt: "Name", required: true },
      ],
    },
    {
      id: "lead",
      kind: "questions",
      title: "Leadership",
      questions: [
        { id: "lead", kind: "boolean", prompt: "Lead a team?" },
        {
          id: "lead-note",
          kind: "explainer",
          bodyText: "Team leads get an extra briefing.",
          style: "note",
          visibleIf: { fieldId: "lead", op: "eq", value: true },
        },
        {
          id: "team",
          kind: "short_text",
          prompt: "Which team?",
          required: true,
          visibleIf: { fieldId: "lead", op: "eq", value: true },
        },
      ],
    },
  ],
});

// Page one routes past page two when the answer is "no".
const BRANCHING = Questionnaire.parse({
  version: "1",
  pages: [
    {
      id: "start",
      kind: "questions",
      title: "Start",
      questions: [
        {
          id: "camping",
          kind: "single_select",
          prompt: "Camping with us?",
          options: [
            { value: "yes", label: "Yes" },
            { value: "no", label: "No", goTo: "end" },
          ],
        },
      ],
    },
    {
      id: "tent",
      kind: "questions",
      title: "Your tent",
      questions: [
        { id: "tent", kind: "short_text", prompt: "Tent size", required: true },
      ],
    },
    {
      id: "end",
      kind: "questions",
      title: "Last bits",
      questions: [
        { id: "notes", kind: "short_text", prompt: "Notes", required: false },
      ],
    },
  ],
});

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
}

async function waitForEnabled(name: string) {
  await waitFor(() =>
    expect(screen.getByRole("button", { name })).toHaveProperty(
      "disabled",
      false,
    ),
  );
}

describe("QuestionnaireRunner — pages and validation", () => {
  it("renders the first page with its progress", () => {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    // The rail names every section on the path.
    expect(
      screen.getByRole("list", { name: "Sections" }).textContent,
    ).toContain("Page Two");
  });

  it("blocks Next when a required field is empty", () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={action}
        persistProgress
      />,
    );
    next();
    expect(screen.getByRole("alert").textContent).toContain("required");
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
  });

  it("saves on Next when it persists progress, and advances", async () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={action}
        persistProgress
      />,
    );
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "Ash" },
    });
    next();
    await screen.findByRole("heading", { name: "Page Two" });
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenLastCalledWith({ name: "Ash" }, false);
  });

  it("advances without saving when it does not persist progress", () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );
    next();
    expect(screen.getByRole("heading", { name: "Page Two" })).toBeTruthy();
    expect(action).not.toHaveBeenCalled();
  });

  it("Back returns to the previous page without re-saving", async () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
        persistProgress
      />,
    );
    next();
    await screen.findByRole("heading", { name: "Page Two" });
    await waitForEnabled("Back");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("keeps Back disabled on the first page", () => {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.getByRole("button", { name: "Back" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("submits with final=true on the last page", async () => {
    const action = vi.fn(ok);
    const onComplete = vi.fn();
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
        onComplete={onComplete}
      />,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(action).toHaveBeenLastCalledWith({ name: "Ash" }, true);
  });

  it("runs the checks across answers before moving on", () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
        checkAnswers={(r): Record<string, string> =>
          r.name === "Ash" ? { name: "Not that name" } : {}
        }
      />,
    );
    next();
    expect(screen.getByRole("alert").textContent).toBe("Not that name");
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
  });
});

describe("QuestionnaireRunner — failed saves", () => {
  function renderSaving(action: () => Promise<SaveResult>) {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
        persistProgress
      />,
    );
  }

  it("shows a form-level error and stays put when the action throws", async () => {
    // A thrown save (e.g. encryption misconfig) must not silently fail to
    // advance.
    renderSaving(() => Promise.reject(new Error("boom")));
    next();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("couldn't save"),
    );
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
  });

  it("shows a returned _form error and stays put", async () => {
    renderSaving(() =>
      Promise.resolve({
        ok: false,
        errors: { _form: "We couldn't save your answers just now." },
      }),
    );
    next();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("couldn't save"),
    );
    expect(screen.getByRole("heading", { name: "Page One" })).toBeTruthy();
  });

  it("shows a returned _root error", async () => {
    renderSaving(() =>
      Promise.resolve({ ok: false, errors: { _root: "Unknown form." } }),
    );
    next();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Unknown form."),
    );
  });

  it("puts a server field error beside its field", async () => {
    renderSaving(() =>
      Promise.resolve({ ok: false, errors: { name: "Server says no" } }),
    );
    next();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Server says no"),
    );
    expect(
      screen.getByLabelText(/Your name/).getAttribute("aria-invalid"),
    ).toBe("true");
  });

  it("goes back to the page that owns a server error on submit", async () => {
    const action = vi.fn(
      async (_: unknown, final: boolean): Promise<SaveResult> =>
        final ? { ok: false, errors: { name: "Taken" } } : { ok: true },
    );
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await screen.findByRole("heading", { name: "Page One" });
    expect(screen.getByRole("alert").textContent).toBe("Taken");
  });
});

describe("QuestionnaireRunner — moving between pages", () => {
  it("focuses the new page's heading after Next, but not on first render", () => {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ada" }}
        action={ok}
      />,
    );
    expect(document.activeElement).toBe(document.body);
    next();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Page Two" }),
    );
  });

  it("drops a save failure when the member goes Back", async () => {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ada" }}
        action={() => Promise.reject(new Error("boom"))}
      />,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() =>
      expect(screen.getByText(/couldn't save your answers/i)).toBeTruthy(),
    );
    await waitForEnabled("Back");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.queryByText(/couldn't save your answers/i)).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Page One" }),
    );
  });

  it("uses Next, Submit and Submitting…", async () => {
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{ name: "Ada" }}
        action={() => new Promise(() => {})}
      />,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByRole("button", { name: "Submitting…" }),
    ).toBeTruthy();
  });

  it("says Skip for a lone optional question with no answer", () => {
    const single = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "photo",
          kind: "questions",
          title: "Photo",
          questions: [
            { id: "a", kind: "short_text", prompt: "A", required: false },
          ],
        },
        {
          id: "b",
          kind: "questions",
          title: "B",
          questions: [{ id: "b", kind: "short_text", prompt: "B" }],
        },
      ],
    });
    render(
      <QuestionnaireRunner
        questionnaire={single}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.getByRole("button", { name: "Skip" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("A"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "Next" })).toBeTruthy();
  });
});

describe("QuestionnaireRunner — visibility and branching", () => {
  it("renders content and question blocks together", () => {
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Tell us about you" }),
    ).toBeTruthy();
    expect(screen.getByLabelText(/Name/)).toBeTruthy();
    expect(screen.getByText("Step 1 of 2")).toBeTruthy();
  });

  it("shows a conditional block and question only once the answer matches", () => {
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{ name: "Ada" }}
        action={ok}
      />,
    );
    next();
    expect(screen.queryByText("Team leads get an extra briefing.")).toBeNull();
    expect(screen.queryByLabelText(/Which team/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Yes" }));
    expect(screen.getByText("Team leads get an extra briefing.")).toBeTruthy();
    expect(screen.getByLabelText(/Which team/)).toBeTruthy();
  });

  it("does not require a hidden question, and keeps its answer", async () => {
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{ name: "Ada", team: "Kitchen" }}
        action={action}
      />,
    );
    next();
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    // The hidden answer is posted; the server decides what it keeps.
    await waitFor(() =>
      expect(action).toHaveBeenCalledWith(
        { name: "Ada", team: "Kitchen", lead: false },
        true,
      ),
    );
  });

  it("follows a choice's goTo past a page, and Back retraces the walk", () => {
    render(
      <QuestionnaireRunner
        questionnaire={BRANCHING}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "No" }));
    // The skipped page leaves the path.
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Last bits" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("heading", { name: "Start" })).toBeTruthy();
  });
});

describe("QuestionnaireRunner — resume and progress", () => {
  it("resumes at the first page still missing a required answer", () => {
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{ name: "Ada", lead: true }}
        action={ok}
        resume
      />,
    );
    expect(screen.getByRole("heading", { name: "Leadership" })).toBeTruthy();
    expect(screen.getByText("Step 2 of 2")).toBeTruthy();
    // The walk up to it is kept, so Back works.
    expect(screen.getByRole("button", { name: "Back" })).toHaveProperty(
      "disabled",
      false,
    );
  });

  it("starts at the top when there are no saved answers", () => {
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{}}
        action={ok}
        resume
      />,
    );
    expect(screen.getByRole("heading", { name: "About you" })).toBeTruthy();
  });

  it("starts at the top without resume, whatever was saved", () => {
    render(
      <QuestionnaireRunner
        questionnaire={SURVEY}
        initialResponses={{ name: "Ada", lead: true }}
        action={ok}
      />,
    );
    expect(screen.getByRole("heading", { name: "About you" })).toBeTruthy();
  });

  it("hides the progress for a single-page form", () => {
    const single = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p1",
          kind: "questions",
          title: "Only",
          questions: [
            { id: "n", kind: "short_text", prompt: "Name", required: false },
          ],
        },
      ],
    });
    render(
      <QuestionnaireRunner
        questionnaire={single}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByText(/of 1/)).toBeNull();
  });

  it("counts answers and gives a lone page one full-width Submit, as a gate", () => {
    const single = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "p1",
          kind: "questions",
          title: "Only",
          questions: [
            { id: "a", kind: "short_text", prompt: "A" },
            { id: "b", kind: "short_text", prompt: "B" },
          ],
        },
      ],
    });
    render(
      <QuestionnaireRunner
        questionnaire={single}
        initialResponses={{ a: "x" }}
        action={ok}
        answeredProgress
        fullWidthSubmit
      />,
    );
    expect(screen.getByText("1 of 2 answered")).toBeTruthy();
    expect(screen.getByText("50%")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Back" })).toBeNull();
    expect(screen.getByRole("button", { name: "Submit" })).toBeTruthy();
  });

  it("shows an intro page's heading and body", () => {
    const intro = Questionnaire.parse({
      version: "1",
      pages: [
        { id: "i", kind: "intro", heading: "Welcome in", body: "Two minutes." },
        {
          id: "p",
          kind: "questions",
          title: "Q",
          questions: [
            { id: "q", kind: "short_text", prompt: "Q", required: false },
          ],
        },
      ],
    });
    render(
      <QuestionnaireRunner
        questionnaire={intro}
        initialResponses={{}}
        action={ok}
      />,
    );
    expect(screen.getByRole("heading", { name: "Welcome in" })).toBeTruthy();
    expect(screen.getByText("Two minutes.")).toBeTruthy();
    next();
    expect(screen.getByRole("heading", { name: "Q" })).toBeTruthy();
  });
});

describe("QuestionnaireRunner — autosave", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("saves a draft on the server shortly after the member stops typing", async () => {
    vi.useFakeTimers();
    const action = vi.fn(ok);
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={action}
        autosave
      />,
    );
    // Nothing is saved on opening the form.
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(action).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "A" },
    });
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "Ada" },
    });
    expect(screen.getByText("Saving…")).toBeTruthy();
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // One save, of the last answers — the pause, not every keystroke.
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith({ name: "Ada" }, false);
    expect(screen.getByText("Saved")).toBeTruthy();
  });

  it("says when a draft did not save", async () => {
    vi.useFakeTimers();
    render(
      <QuestionnaireRunner
        questionnaire={TWO_PAGES}
        initialResponses={{}}
        action={() =>
          Promise.resolve({
            ok: false,
            errors: { _form: "This form is closed." },
          })
        }
        autosave
      />,
    );
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "Ada" },
    });
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByText("Not saved")).toBeTruthy();
  });

  it("never lets a draft land after the final submit", async () => {
    const calls: boolean[] = [];
    let releaseDraft: () => void = () => {};
    const action = vi.fn(async (_: unknown, final: boolean) => {
      if (!final) await new Promise<void>((r) => (releaseDraft = r));
      calls.push(final);
      return { ok: true } as const;
    });
    render(
      <QuestionnaireRunner
        questionnaire={Questionnaire.parse({
          version: "1",
          pages: [TWO_PAGES.pages[0]],
        })}
        initialResponses={{}}
        action={action}
        autosave
      />,
    );
    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "Ada" },
    });
    // The draft save starts and hangs…
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    // …the member submits meanwhile…
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await act(async () => {
      releaseDraft();
    });
    await waitFor(() => expect(calls).toEqual([false, true]));
  });
});

describe("QuestionnaireRunner — preview", () => {
  it("lets a required image through, since uploads are off", async () => {
    const onComplete = vi.fn();
    render(
      <QuestionnaireRunner
        questionnaire={Questionnaire.parse({
          version: "1",
          pages: [
            {
              id: "p",
              kind: "questions",
              title: "Photos",
              questions: [
                {
                  id: "tent",
                  kind: "image",
                  prompt: "Your tent",
                  required: true,
                },
              ],
            },
          ],
        })}
        initialResponses={{}}
        action={ok}
        preview
        onComplete={onComplete}
      />,
    );
    expect(screen.getByText(/Uploads are off in the preview/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });
});
