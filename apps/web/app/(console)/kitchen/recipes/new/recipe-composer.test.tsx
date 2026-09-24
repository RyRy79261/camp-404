import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

// The import composer checks the form before it posts: a problem shows beside
// its field and nothing is sent. The name is optional, a dictated transcript
// lands in the text box and marks the recipe as dictated, consent to Claude
// starts unticked, and a refusal from the server shows in the card.

vi.mock("../actions", () => ({ suggestRecipeAction: vi.fn() }));

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
}));

vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => true,
}));
vi.mock("@/components/voice/recorder-panel", () => ({
  RecorderPanel: ({
    onTranscript,
  }: {
    onTranscript: (text: string) => void;
  }) => (
    <button type="button" onClick={() => onTranscript("Simmer 20 minutes.")}>
      Stand-in transcript
    </button>
  ),
}));

import { toast } from "@camp404/ui/components/toast";
import { suggestRecipeAction } from "../actions";
import { RecipeComposer } from "./recipe-composer";

const ID = "11111111-1111-4111-8111-111111111111";

const submit = () =>
  fireEvent.click(screen.getByRole("button", { name: "Import recipe" }));
const text = () => screen.getByLabelText(/^Recipe text/) as HTMLInputElement;

afterEach(cleanup);

describe("RecipeComposer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(suggestRecipeAction).mockResolvedValue({
      ok: true,
      data: { id: ID },
    });
  });

  it("lays out the text first, then the optional fields, and no source picker", () => {
    render(<RecipeComposer />);
    const labels = [
      /^Recipe text/,
      /^Name \(optional\)/,
      /^Where it came from \(optional\)/,
      /^Why it suits the camp \(optional\)/,
    ].map((l) => screen.getByLabelText(l));
    for (let i = 1; i < labels.length; i++) {
      expect(
        labels[i - 1]!.compareDocumentPosition(labels[i]!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    }
    expect(screen.queryByRole("radio")).toBeNull();
    expect(
      screen.getByText("Claude names it if you leave this blank."),
    ).toBeTruthy();
    // The counter under the text box.
    expect(screen.getByText("0 / 20000")).toBeTruthy();
  });

  it("asks for the recipe, not a name, and sends nothing", async () => {
    render(<RecipeComposer />);
    submit();
    expect(await screen.findByText("Paste the recipe.")).toBeTruthy();
    expect(text().getAttribute("aria-invalid")).toBe("true");
    expect(screen.queryByText("Give the recipe a name.")).toBeNull();
    expect(suggestRecipeAction).not.toHaveBeenCalled();
  });

  it("refuses a plain http link, and text that is only a link, beside each field", async () => {
    render(<RecipeComposer />);
    fireEvent.change(text(), { target: { value: "https://example.com/dal" } });
    fireEvent.change(screen.getByLabelText(/^Where it came from/), {
      target: { value: "http://example.com/dal" },
    });
    submit();
    expect(
      await screen.findByText(
        /Paste the recipe itself\. Claude does not open links/,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText("Use a link that starts with https://."),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(/^Where it came from/).getAttribute("aria-invalid"),
    ).toBe("true");
    expect(suggestRecipeAction).not.toHaveBeenCalled();
  });

  it("imports pasted text with no name and without consent, then opens it", async () => {
    render(<RecipeComposer />);
    fireEvent.change(text(), {
      target: { value: "Lentils, water, cumin." },
    });
    const consent = screen.getByRole("checkbox", {
      name: /A captain or a Kitchen lead may send this recipe's text to Claude/,
    });
    expect(consent.getAttribute("aria-checked")).toBe("false");
    submit();
    await waitFor(() => expect(suggestRecipeAction).toHaveBeenCalledTimes(1));
    const sent = vi.mocked(suggestRecipeAction).mock.calls[0]![0];
    expect(sent).toMatchObject({
      source: "text",
      text: "Lentils, water, cumin.",
      aiConsent: false,
    });
    expect((sent as { title?: string }).title).toBeUndefined();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/kitchen/recipes/${ID}`),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Recipe imported. A Kitchen lead or a captain checks it next.",
    );
    // The form stays disabled until the transition ends; a click before then
    // is ignored (this raced under a loaded test run).
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Import recipe",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );

    fireEvent.click(consent);
    submit();
    await waitFor(() => expect(suggestRecipeAction).toHaveBeenCalledTimes(2));
    expect(vi.mocked(suggestRecipeAction).mock.calls[1]![0]).toMatchObject({
      aiConsent: true,
    });
  });

  it("appends a dictated transcript to the text and sends it as dictated", async () => {
    render(<RecipeComposer />);
    fireEvent.change(text(), { target: { value: "Lentils and water." } });
    fireEvent.click(screen.getByRole("button", { name: /Dictate the recipe/ }));
    fireEvent.click(
      screen.getByRole("button", { name: "Stand-in transcript" }),
    );
    expect(text().value).toBe("Lentils and water.\nSimmer 20 minutes.");
    submit();
    await waitFor(() => expect(suggestRecipeAction).toHaveBeenCalledTimes(1));
    expect(vi.mocked(suggestRecipeAction).mock.calls[0]![0]).toMatchObject({
      source: "voice",
      text: "Lentils and water.\nSimmer 20 minutes.",
    });
  });

  it("shows a refusal from the server in the card", async () => {
    vi.mocked(suggestRecipeAction).mockResolvedValue({
      ok: false,
      error: "Only approved camp members can do this.",
    });
    render(<RecipeComposer />);
    fireEvent.change(text(), {
      target: { value: "Dal\nLentils, water, cumin." },
    });
    fireEvent.change(screen.getByLabelText(/^Where it came from/), {
      target: { value: "https://example.com/dal" },
    });
    submit();
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Only approved camp members can do this.",
    );
    expect(push).not.toHaveBeenCalled();
  });
});
