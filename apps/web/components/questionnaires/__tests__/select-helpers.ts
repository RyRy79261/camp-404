import { fireEvent, waitFor, within } from "@testing-library/react";

// Driving the kit's Radix Select under JSDOM, which lacks the pointer-capture
// and scroll calls Radix makes. A click on the trigger opens it (Radix treats a
// pointer-less click as touch), and a click on an option picks it.
//
// The open list is found with a plain selector, not a role query: a role query
// walks the whole accessibility tree, and the builder's is large enough that
// polling it under a loaded test run takes seconds.

async function openList(trigger: HTMLElement): Promise<HTMLElement> {
  fireEvent.click(trigger);
  return waitFor(() => {
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]');
    if (!listbox) throw new Error("The select did not open.");
    return listbox;
  });
}

export function installSelectPolyfills(): void {
  const proto = Element.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
}

/** Open a select by its trigger and pick the option with this name. */
export async function choose(
  trigger: HTMLElement,
  option: string | RegExp,
): Promise<void> {
  const listbox = await openList(trigger);
  fireEvent.click(within(listbox).getByRole("option", { name: option }));
}

/** The option names a select offers (opens it, reads them, closes it). */
export async function optionNames(trigger: HTMLElement): Promise<string[]> {
  const listbox = await openList(trigger);
  const names = within(listbox)
    .getAllByRole("option")
    .map((o) => o.textContent ?? "");
  fireEvent.keyDown(listbox, { key: "Escape" });
  return names;
}
