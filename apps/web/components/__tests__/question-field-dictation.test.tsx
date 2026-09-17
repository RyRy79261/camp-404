import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Question } from "@camp404/types";

// Dictation on a long answer: offered only where the author turned it on (and
// the device can record), and it swaps in the recorder panel on demand.

vi.mock("@/components/voice/use-voice-recorder", () => ({
  useVoiceSupported: () => true,
}));
vi.mock("@/components/voice/recorder-panel", () => ({
  RecorderPanel: ({ onDismiss }: { onDismiss: () => void }) => (
    <div role="region" aria-label="Recorder">
      <button type="button" onClick={onDismiss}>
        Close recorder
      </button>
    </div>
  ),
}));

import { QuestionField } from "../questionnaire/field";

const story = (enableDictation: boolean) =>
  Question.parse({
    id: "bio",
    kind: "long_text",
    prompt: "Tell us your story",
    maxLength: 500,
    enableDictation,
  });

describe("QuestionField — long text dictation", () => {
  it("offers Dictate instead when the author enabled it", () => {
    render(
      <QuestionField question={story(true)} value="" onChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Dictate instead" }));
    expect(screen.getByRole("region", { name: "Recorder" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close recorder" }));
    expect(
      screen.getByRole("button", { name: "Dictate instead" }),
    ).toBeTruthy();
  });

  it("offers no dictation when the author did not", () => {
    render(
      <QuestionField question={story(false)} value="" onChange={() => {}} />,
    );
    expect(
      screen.getByRole("textbox", { name: /Tell us your story/ }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Dictate instead" }),
    ).toBeNull();
  });
});
