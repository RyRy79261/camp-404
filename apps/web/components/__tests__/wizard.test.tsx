import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { Questionnaire } from "@camp404/types";
import { QuestionnaireWizard } from "@/components/questionnaire/wizard";

// Synthetic two-page questionnaire that only uses text inputs so the test
// isn't fighting Radix portals or pointer-event simulation. The wizard's
// orchestration (page nav, validation, submit) is what we're verifying
// here; the individual primitives are tested by Radix upstream.
const Q: Questionnaire = {
  version: "test-1",
  pages: [
    {
      id: "p1",
      kind: "questions",
      title: "Page One",
      questions: [
        {
          id: "name",
          kind: "short_text",
          prompt: "Your name",
          maxLength: 100,
          required: true,
        },
      ],
    },
    {
      id: "p2",
      kind: "questions",
      title: "Page Two",
      questions: [
        {
          id: "note",
          kind: "long_text",
          prompt: "Anything else",
          maxLength: 500,
          required: false,
        },
      ],
    },
  ],
};

function noopAction() {
  return Promise.resolve({ ok: true } as const);
}

describe("QuestionnaireWizard", () => {
  it("renders the first page on mount", () => {
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{}}
        action={noopAction}
      />,
    );
    expect(screen.getByText("Page One")).toBeDefined();
    expect(screen.getByText("Step 1 of 2")).toBeDefined();
  });

  it("blocks Next when a required field is empty", async () => {
    const action = vi.fn(noopAction);
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{}}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("required");
    });
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText("Page One")).toBeDefined();
  });

  it("advances to the next page after filling a required field", async () => {
    const action = vi.fn(noopAction);
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{}}
        action={action}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Your name/), {
      target: { value: "Ash" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() => expect(screen.getByText("Page Two")).toBeDefined());
    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenLastCalledWith({ name: "Ash" }, false);
  });

  it("Back returns to the previous page without re-saving", async () => {
    const action = vi.fn(noopAction);
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Page Two")).toBeDefined());

    // The useTransition started by Next may still report isPending for a
    // tick after Page Two has rendered — which disables the Back button.
    // Wait until it's actually clickable.
    await waitFor(() => {
      const back = screen.getByRole("button", {
        name: "Back",
      }) as HTMLButtonElement;
      if (back.disabled) throw new Error("Back still disabled");
    });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await waitFor(() => expect(screen.getByText("Page One")).toBeDefined());

    // One Next-driven save; Back doesn't re-call the action.
    expect(action).toHaveBeenCalledTimes(1);
  });

  it("submits with final=true on the last page", async () => {
    const action = vi.fn(noopAction);
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Page Two")).toBeDefined());

    // Wait for the Next-triggered transition to fully settle so Finish is
    // clickable.
    await waitFor(() => {
      const finish = screen.getByRole("button", {
        name: "Finish",
      }) as HTMLButtonElement;
      if (finish.disabled) throw new Error("Finish still disabled");
    });

    fireEvent.click(screen.getByRole("button", { name: "Finish" }));
    await waitFor(() =>
      expect(action).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "Ash" }),
        true,
      ),
    );
  });

  it("surfaces a form-level error and stays put when the action throws", async () => {
    // Regression guard for the onboarding stage 2→3 block: a thrown save
    // action (e.g. encryption misconfig) must NOT silently fail to advance.
    const action = vi.fn(() => Promise.reject(new Error("boom")));
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "couldn't save",
      ),
    );
    // Did not advance past the failing page.
    expect(screen.getByText("Page One")).toBeDefined();
  });

  it("surfaces a returned _form error as the page-level banner and stays put", async () => {
    // The production action does NOT throw on encrypt failure — it RETURNS
    // {ok:false, errors:{_form}}. That flows through setErrors(result.errors),
    // a different branch from the thrown-action catch above.
    const action = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        errors: { _form: "We couldn't save your answers just now." },
      }),
    );
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("couldn't save"),
    );
    expect(screen.getByText("Page One")).toBeDefined();
  });

  it("surfaces a returned _root error in the banner (replay/validation path)", async () => {
    // saveFormReplay + validateResponses return non-field failures under "_root";
    // the banner must render that reserved key too, not just "_form".
    const action = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        errors: { _root: "Unknown form." },
      }),
    );
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Unknown form."),
    );
    expect(screen.getByText("Page One")).toBeDefined();
  });

  it("surfaces server-side validation errors back into the form", async () => {
    const action = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        errors: { name: "Server says no" },
      }),
    );
    render(
      <QuestionnaireWizard
        questionnaire={Q}
        initialResponses={{ name: "Ash" }}
        action={action}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Server says no"),
    );
    // Page didn't advance.
    expect(screen.getByText("Page One")).toBeDefined();
  });
});
