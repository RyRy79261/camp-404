import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { validateQuestionnaireDefinition } from "@camp404/core";
import { Question, type PageBlock, type Questionnaire } from "@camp404/types";
import { BlockEditor, withCurrentTarget } from "../block-editor";
import { locateIssues } from "../definition-issues";
import { choose, installSelectPolyfills, optionNames } from "./select-helpers";

// The builder's DOM is large. Role queries skip the is-it-hidden walk
// (getComputedStyle up the tree for every candidate), and the time limits are
// raised, because under a full parallel run the first render alone took ten
// seconds. A stuck test still fails, later.
configure({ defaultHidden: true, asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 45_000 });

// One block's card: AfrikaBurn's controls, plus Camp 404's short label, the
// app's use for an answer, voice dictation, "Show only when…" and uploaded
// pictures.

beforeAll(installSelectPolyfills);
afterEach(cleanup);

function renderEditor(
  block: PageBlock,
  extra: Partial<Parameters<typeof BlockEditor>[0]> = {},
) {
  const onChange = vi.fn();
  const onConvert = vi.fn();
  render(
    <BlockEditor
      block={block}
      pageIndex={0}
      blockIndex={0}
      total={1}
      issues={[]}
      branchTargets={[]}
      questionnaireKey="feedback"
      fields={[]}
      onChange={onChange}
      onConvert={onConvert}
      onMove={vi.fn()}
      onDuplicate={vi.fn()}
      onRemove={vi.fn()}
      {...extra}
    />,
  );
  return { onChange, onConvert };
}

const lastChange = (fn: ReturnType<typeof vi.fn>) =>
  fn.mock.calls.at(-1)![0] as Record<string, unknown>;

describe("BlockEditor — the question", () => {
  it("edits the prompt and names the block's buttons after it", () => {
    const { onChange } = renderEditor(
      Question.parse({ id: "colour", kind: "short_text", prompt: "Colour" }),
    );
    expect(
      screen.getByRole("group", { name: "Short answer: Colour" }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete Colour" })).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Move Colour up",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);

    fireEvent.change(screen.getByLabelText("Question prompt"), {
      target: { value: "Favourite colour" },
    });
    expect(lastChange(onChange).prompt).toBe("Favourite colour");
  });

  it("saves a short label, capped at the model's length, and clears a blank one", () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "drives",
        kind: "boolean",
        prompt: "Will you be driving a car to the burn?",
      }),
    );
    const input = screen.getByLabelText("Short label (optional)");
    expect(input.getAttribute("maxLength")).toBe("40");
    fireEvent.change(input, { target: { value: "Driving" } });
    expect(lastChange(onChange).shortLabel).toBe("Driving");
    fireEvent.change(input, { target: { value: "   " } });
    expect(lastChange(onChange).shortLabel).toBeUndefined();
  });

  it("changes the block type through its selector", async () => {
    const { onConvert } = renderEditor(
      Question.parse({ id: "q", kind: "short_text", prompt: "Name" }),
    );
    await choose(
      screen.getByRole("combobox", { name: "Block type" }),
      "Slider",
    );
    expect(onConvert).toHaveBeenCalledWith("slider");
  });

  it("turns Required off and on", () => {
    const { onChange } = renderEditor(
      Question.parse({ id: "q", kind: "date", prompt: "Arriving" }),
    );
    const required = screen.getByRole("switch", { name: "Required" });
    expect(required.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(required);
    expect(lastChange(onChange).required).toBe(false);
  });
});

describe("BlockEditor — what the app uses the answer for", () => {
  it("offers the uses a yes/no question can have, and sets the one picked", async () => {
    const { onChange } = renderEditor(
      Question.parse({ id: "drives", kind: "boolean", prompt: "Driving?" }),
    );
    const select = screen.getByRole("combobox", {
      name: "The app uses this answer as",
    });
    expect(await optionNames(select)).toEqual([
      "Nothing else",
      "Has an anaphylactic allergy",
      "Driving to camp this year (joins the drivers audience)",
    ]);
    await choose(select, /^Driving to camp/);
    expect(lastChange(onChange).role).toBe("driving_this_year");
  });

  it("clears the use when set back to nothing", async () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "arrive",
        kind: "date",
        prompt: "Arriving",
        role: "arrival_date",
      }),
    );
    await choose(
      screen.getByRole("combobox", { name: "The app uses this answer as" }),
      "Nothing else",
    );
    expect("role" in lastChange(onChange)).toBe(false);
  });

  it("fills in Yes / Maybe / No and turns Other off when a choice becomes the attendance question", async () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "coming",
        kind: "single_select",
        prompt: "Coming?",
        allowOther: true,
        otherLabel: "Something else",
        options: [
          { value: "option_1", label: "Sure" },
          { value: "option_2", label: "Nope" },
        ],
      }),
    );
    await choose(
      screen.getByRole("combobox", { name: "The app uses this answer as" }),
      /^Coming this year/,
    );
    const next = lastChange(onChange);
    expect(next.role).toBe("participation_intent");
    expect(next.options).toEqual([
      { value: "yes", label: "Yes, I'm coming" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No, not this year" },
    ]);
    expect("allowOther" in next || "otherLabel" in next).toBe(false);
  });

  it("leaves the options alone when the attendance use is removed", async () => {
    const options = [
      { value: "yes", label: "Yes, I'm coming" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No, not this year" },
    ];
    const { onChange } = renderEditor(
      Question.parse({
        id: "coming",
        kind: "single_select",
        prompt: "Coming?",
        role: "participation_intent",
        options,
      }),
    );
    await choose(
      screen.getByRole("combobox", { name: "The app uses this answer as" }),
      "Nothing else",
    );
    const next = lastChange(onChange);
    expect("role" in next).toBe(false);
    expect(next.options).toEqual(options);
  });

  it("offers nothing for a kind no use fits, but shows a use set elsewhere", () => {
    renderEditor(
      Question.parse({ id: "n", kind: "number", prompt: "How many?" }),
    );
    expect(
      screen.queryByRole("combobox", { name: "The app uses this answer as" }),
    ).toBeNull();
    cleanup();
    renderEditor(
      Question.parse({
        id: "p",
        kind: "image",
        prompt: "Photo",
        role: "profile_photo",
      }),
    );
    expect(
      screen.getByRole("combobox", { name: "The app uses this answer as" })
        .textContent,
    ).toContain("Profile photo");
  });
});

describe("BlockEditor — per-kind controls", () => {
  it("sets a short answer's format, and Any text clears it", async () => {
    const { onChange } = renderEditor(
      Question.parse({ id: "site", kind: "short_text", prompt: "Website" }),
    );
    const format = screen.getByRole("combobox", { name: "Answer format" });
    await choose(format, "A link");
    expect(lastChange(onChange).format).toBe("url");
    cleanup();

    const again = renderEditor(
      Question.parse({
        id: "site",
        kind: "short_text",
        prompt: "Website",
        format: "integer",
        min: 1,
        max: 9,
      }),
    );
    await choose(
      screen.getByRole("combobox", { name: "Answer format" }),
      "Any text",
    );
    const cleared = lastChange(again.onChange);
    // Plain text stores no format, and min/max only belong to the numeric ones.
    expect("format" in cleared || "min" in cleared || "max" in cleared).toBe(
      false,
    );
  });

  it("turns on Other… for a single pick", () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "diet",
        kind: "single_select",
        prompt: "Diet",
        options: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "Allow an “Other…” answer" }),
    );
    expect(lastChange(onChange).allowOther).toBe(true);
  });

  it("offers voice dictation on a paragraph only", () => {
    const { onChange } = renderEditor(
      Question.parse({ id: "bio", kind: "long_text", prompt: "About you" }),
    );
    fireEvent.click(screen.getByRole("switch", { name: "Voice dictation" }));
    expect(lastChange(onChange).enableDictation).toBe(true);
    cleanup();
    renderEditor(
      Question.parse({ id: "n", kind: "short_text", prompt: "Name" }),
    );
    expect(
      screen.queryByRole("switch", { name: "Voice dictation" }),
    ).toBeNull();
  });

  it("adds an option with a fresh value and keeps values fixed while labels change", () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "list",
        kind: "combobox",
        prompt: "Country",
        options: [
          { value: "option_1", label: "South Africa" },
          { value: "option_3", label: "Namibia" },
        ],
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add option" }));
    expect(lastChange(onChange).options).toEqual([
      { value: "option_1", label: "South Africa" },
      { value: "option_3", label: "Namibia" },
      { value: "option_4", label: "" },
    ]);
    fireEvent.change(screen.getByLabelText("Option 1 label"), {
      target: { value: "RSA" },
    });
    expect((lastChange(onChange).options as { value: string }[])[0]).toEqual({
      value: "option_1",
      label: "RSA",
    });
    expect(
      (
        screen.getByRole("button", {
          name: "Remove option 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("keeps a slider's last number when a box is cleared", () => {
    const { onChange } = renderEditor(
      Question.parse({
        id: "s",
        kind: "slider",
        prompt: "Loud",
        min: 1,
        max: 5,
      }),
    );
    fireEvent.change(screen.getByLabelText("Max"), { target: { value: "" } });
    expect(lastChange(onChange).max).toBe(5);
    fireEvent.change(screen.getByLabelText("Max"), { target: { value: "10" } });
    expect(lastChange(onChange).max).toBe(10);
  });

  it("flags an image link to another website beside the box", () => {
    renderEditor({
      id: "map",
      kind: "image_block",
      url: "https://example.com/map.png",
      alt: "",
    });
    expect(screen.getByRole("alert").textContent).toBe(
      "This links to another website. Upload the picture instead.",
    );
    expect(
      screen.getByRole("button", { name: /Replace the picture/ }),
    ).toBeTruthy();
  });

  it("sets a note's style", () => {
    const { onChange } = renderEditor({
      id: "n",
      kind: "explainer",
      bodyText: "Bring water",
      style: "plain",
    });
    fireEvent.click(screen.getByRole("radio", { name: "Warning" }));
    expect(lastChange(onChange).style).toBe("warning");
  });

  it("offers a condition on the questions above", () => {
    const { onChange } = renderEditor(
      { id: "note", kind: "divider" },
      {
        fields: [
          Question.parse({ id: "drives", kind: "boolean", prompt: "Driving?" }),
        ],
      },
    );
    fireEvent.click(screen.getByRole("switch", { name: /Show only when/ }));
    expect(lastChange(onChange).visibleIf).toEqual({
      fieldId: "drives",
      op: "eq",
      value: true,
    });
  });
});

describe("BlockEditor — issues", () => {
  it("shows an option's issue beside that option and the block's own below", () => {
    const definition: Questionnaire = {
      version: "1",
      pages: [
        {
          id: "s",
          kind: "questions",
          title: "Food",
          questions: [
            {
              id: "diet",
              kind: "single_select",
              prompt: "Diet",
              required: false,
              options: [
                { value: "veg", label: "Vegetarian" },
                { value: "veg", label: "Vegan" },
              ],
            },
          ],
        },
      ],
    };
    const result = validateQuestionnaireDefinition(definition);
    const issues = locateIssues(result.ok ? [] : result.issues, definition);
    renderEditor(
      definition.pages[0]!.kind === "questions"
        ? definition.pages[0]!.questions[0]!
        : ({} as PageBlock),
      { issues },
    );
    expect(screen.getByText('duplicate option value "veg"')).toBeTruthy();
  });

  it("keeps a branch target that no longer fits, flagged", () => {
    expect(
      withCurrentTarget([{ value: "s2", label: "2. Two" }], "gone"),
    ).toEqual([
      { value: "s2", label: "2. Two" },
      { value: "gone", label: "gone — invalid target" },
    ]);
    expect(
      withCurrentTarget([{ value: "s2", label: "2. Two" }], "s2"),
    ).toHaveLength(1);
  });
});
