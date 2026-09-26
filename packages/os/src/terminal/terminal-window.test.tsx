import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { out, type CommandTable } from "./engine";
import { TerminalWindow } from "./terminal-window";

// A command's `effect` goes to the app with its output; the window itself
// knows nothing of what it means.

const TABLE: CommandTable<string, null> = {
  commands: {
    purr: () => ({ lines: [out("prrr")], effect: "wiggle" }),
    hello: () => ({ lines: [out("hi")] }),
  },
};

function run(text: string) {
  const input = screen.getByRole("textbox");
  fireEvent.change(input, { target: { value: text } });
  fireEvent.submit(input.closest("form")!);
}

describe("TerminalWindow", () => {
  it("hands a command's effect to the app, with its output", () => {
    const onEffect = vi.fn();
    render(
      <TerminalWindow
        commands={TABLE}
        context={null}
        welcome={[]}
        openApp={() => {}}
        close={() => {}}
        onEffect={onEffect}
      />,
    );
    run("hello");
    expect(onEffect).not.toHaveBeenCalled();
    run("purr");
    expect(onEffect).toHaveBeenCalledExactlyOnceWith("wiggle");
    expect(screen.getByRole("log").textContent).toContain("prrr");
  });
});
