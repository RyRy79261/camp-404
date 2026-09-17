import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DictatePill } from "@camp404/ui/components/dictate-pill";
import { useDictationToggle } from "../use-dictation-toggle";

// Closing the recorder gives focus back to the Dictate pill; a form reset
// closes it without moving focus.

afterEach(cleanup);

function Host() {
  const dictation = useDictationToggle();
  return (
    <>
      <button type="button" onClick={() => dictation.setDictating(false)}>
        Reset form
      </button>
      {dictation.dictating ? (
        <button type="button" onClick={dictation.close}>
          Close dictation
        </button>
      ) : (
        <DictatePill ref={dictation.pillRef} onActivate={dictation.open} />
      )}
    </>
  );
}

describe("useDictationToggle", () => {
  it("returns focus to the pill when the panel closes", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate instead" }));
    fireEvent.click(screen.getByRole("button", { name: "Close dictation" }));
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Dictate instead" }),
    );
  });

  it("leaves focus alone when the host closes it", () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Dictate instead" }));
    const reset = screen.getByRole("button", { name: "Reset form" });
    reset.focus();
    fireEvent.click(reset);
    expect(document.activeElement).toBe(reset);
  });
});
