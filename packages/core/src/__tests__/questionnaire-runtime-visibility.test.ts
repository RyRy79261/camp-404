import { describe, expect, it } from "vitest";
import { Questionnaire, SUBMIT_TARGET } from "@camp404/types";
import {
  deriveProgress,
  firstPageId,
  isBlockVisible,
  isPageVisible,
  nextPageId,
  pageById,
  resolvePath,
  validateSubmission,
  visibleBlocks,
  visibleQuestions,
} from "../questionnaire-runtime";

// The unified runtime honours both branching mechanisms at once: AB's `goTo` /
// `next` routing between pages, and Camp 404's `visibleIf` hiding a page, a
// question or a content block in place. These cases pin how the two compose.

/**
 * start ──(role: sound → goTo "sound")──▶ sound ──▶ gear (hidden unless
 * has_gear) ──next──▶ wrap
 *       └─(role: art → goTo SUBMIT)
 */
const MIXED = Questionnaire.parse({
  version: "1",
  pages: [
    {
      id: "start",
      kind: "questions",
      title: "Start",
      questions: [
        {
          id: "role",
          kind: "single_select",
          prompt: "What do you bring?",
          options: [
            { value: "sound", label: "Sound", goTo: "sound" },
            { value: "art", label: "Art", goTo: SUBMIT_TARGET },
            { value: "food", label: "Food" },
          ],
        },
        {
          id: "has_gear",
          kind: "boolean",
          prompt: "Bringing gear?",
        },
        {
          id: "gear_route",
          kind: "single_select",
          prompt: "Skip ahead?",
          visibleIf: { fieldId: "has_gear", op: "eq", value: true },
          options: [
            { value: "skip", label: "Skip", goTo: "wrap" },
            { value: "stay", label: "Stay" },
          ],
          required: false,
        },
      ],
    },
    {
      id: "sound",
      kind: "questions",
      title: "Sound",
      questions: [
        { id: "watts", kind: "number", prompt: "Watts?", min: 0, max: 6 },
        {
          id: "loud_note",
          kind: "explainer",
          bodyText: "Quiet hours apply.",
          style: "warning",
          visibleIf: { fieldId: "watts", op: "gte", value: 4 },
        },
      ],
    },
    {
      id: "gear",
      kind: "questions",
      title: "Gear",
      next: "wrap",
      visibleIf: { fieldId: "has_gear", op: "eq", value: true },
      questions: [
        {
          id: "gear_list",
          kind: "short_text",
          prompt: "What gear?",
          maxLength: 50,
          required: true,
        },
        {
          id: "gear_route_2",
          kind: "single_select",
          prompt: "Done?",
          options: [
            { value: "yes", label: "Yes", goTo: SUBMIT_TARGET },
            { value: "no", label: "No" },
          ],
          required: false,
        },
      ],
    },
    {
      id: "extra",
      kind: "questions",
      title: "Extra",
      questions: [
        { id: "extra_note", kind: "long_text", prompt: "More?", maxLength: 50 },
      ],
    },
    {
      id: "wrap",
      kind: "questions",
      title: "Wrap",
      questions: [
        {
          id: "notes",
          kind: "long_text",
          prompt: "Anything else?",
          maxLength: 50,
          required: true,
          visibleIf: { fieldId: "role", op: "ne", value: "food" },
        },
      ],
    },
  ],
});

describe("a hidden page", () => {
  it("is skipped, and the walk continues from its own fall-through", () => {
    // gear is hidden, and its fall-through is its `next: "wrap"` — so the walk
    // still passes "extra" by, exactly as it would had gear been shown.
    expect(resolvePath(MIXED, { role: "sound" })).toEqual([
      "start",
      "sound",
      "wrap",
    ]);
    expect(nextPageId(MIXED, "sound", { role: "sound" })).toBe("wrap");
  });

  it("falls through to the following page when it has no `next`", () => {
    const plain = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "a",
          kind: "questions",
          title: "A",
          questions: [{ id: "show", kind: "boolean", prompt: "Show B?" }],
        },
        {
          id: "b",
          kind: "questions",
          title: "B",
          visibleIf: { fieldId: "show", op: "eq", value: true },
          questions: [{ id: "qb", kind: "email", prompt: "B" }],
        },
        {
          id: "c",
          kind: "questions",
          title: "C",
          questions: [{ id: "qc", kind: "email", prompt: "C" }],
        },
      ],
    });
    expect(resolvePath(plain, {})).toEqual(["a", "c"]);
    expect(resolvePath(plain, { show: true })).toEqual(["a", "b", "c"]);
  });

  it("routes nothing from its questions, even when they hold a branching answer", () => {
    // gear_route_2 "yes" would submit — but gear is hidden, so it never fires.
    expect(resolvePath(MIXED, { role: "sound", gear_route_2: "yes" })).toEqual([
      "start",
      "sound",
      "wrap",
    ]);
  });

  it("is walked when shown, and its branch then fires", () => {
    expect(resolvePath(MIXED, { role: "sound", has_gear: true })).toEqual([
      "start",
      "sound",
      "gear",
      "wrap",
    ]);
    expect(
      resolvePath(MIXED, {
        role: "sound",
        has_gear: true,
        gear_route_2: "yes",
      }),
    ).toEqual(["start", "sound", "gear"]);
  });

  it("reports intro pages as always visible", () => {
    const withIntro = Questionnaire.parse({
      version: "1",
      pages: [{ id: "hi", kind: "intro", heading: "Hi", body: "Welcome." }],
    });
    expect(isPageVisible(withIntro.pages[0]!, {})).toBe(true);
    expect(visibleBlocks(withIntro.pages[0]!, {})).toEqual([]);
  });
});

describe("a hidden question", () => {
  it("does not branch", () => {
    // gear_route is hidden (has_gear unanswered), so "skip" does not jump.
    expect(
      nextPageId(MIXED, "start", { role: "food", gear_route: "skip" }),
    ).toBe("sound");
    expect(
      nextPageId(MIXED, "start", {
        role: "food",
        has_gear: true,
        gear_route: "skip",
      }),
    ).toBe("wrap");
  });

  it("lets the last SHOWN branching answer on the page win", () => {
    // role "art" submits; a shown gear_route "skip" after it goes to wrap.
    expect(
      nextPageId(MIXED, "start", {
        role: "art",
        has_gear: true,
        gear_route: "skip",
      }),
    ).toBe("wrap");
    expect(nextPageId(MIXED, "start", { role: "art" })).toBeNull();
  });

  it("is not asked, and not required", () => {
    expect(visibleQuestions(MIXED, { role: "food" }).map((q) => q.id)).toEqual([
      "role",
      "has_gear",
      "watts",
    ]);
    const result = validateSubmission(MIXED, { role: "food", watts: 2 });
    expect(result.ok).toBe(true);
  });

  it("is required once shown", () => {
    const result = validateSubmission(MIXED, { role: "sound", watts: 2 });
    expect(result).toEqual({
      ok: false,
      errors: { notes: "This question is required" },
    });
  });
});

describe("a content block's condition", () => {
  it("shows the block only when it holds", () => {
    const sound = pageById(MIXED, "sound")!;
    expect(visibleBlocks(sound, { watts: 2 }).map((b) => b.id)).toEqual([
      "watts",
    ]);
    expect(visibleBlocks(sound, { watts: 5 }).map((b) => b.id)).toEqual([
      "watts",
      "loud_note",
    ]);
    const note = sound.kind === "questions" ? sound.questions[1]! : null;
    expect(note && isBlockVisible(note, { watts: 4 })).toBe(true);
  });

  it("hides every block on a hidden page", () => {
    expect(visibleBlocks(pageById(MIXED, "gear")!, {})).toEqual([]);
  });
});

describe("the first page", () => {
  const HIDDEN_START = Questionnaire.parse({
    version: "1",
    pages: [
      {
        id: "a",
        kind: "questions",
        title: "A",
        visibleIf: { fieldId: "z", op: "is_answered" },
        questions: [{ id: "q", kind: "email", prompt: "Email" }],
      },
      {
        id: "b",
        kind: "questions",
        title: "B",
        questions: [{ id: "z", kind: "email", prompt: "Email" }],
      },
    ],
  });

  it("is the first SHOWN page", () => {
    expect(firstPageId(HIDDEN_START, {})).toBe("b");
    expect(resolvePath(HIDDEN_START, {})).toEqual(["b"]);
    expect(firstPageId(HIDDEN_START, { z: "a@b.co" })).toBe("a");
  });

  it("is null when nothing is shown", () => {
    const nothing = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "only",
          kind: "questions",
          title: "Only",
          visibleIf: { fieldId: "never", op: "is_answered" },
          questions: [],
        },
      ],
    });
    expect(firstPageId(nothing, {})).toBeNull();
    expect(resolvePath(nothing, {})).toEqual([]);
    expect(deriveProgress(nothing, {})).toMatchObject({
      path: [],
      percent: 100,
      complete: true,
    });
  });

  it("is null for a questionnaire with no pages at all", () => {
    const empty = { version: "1", pages: [] } as unknown as Questionnaire;
    expect(firstPageId(empty, {})).toBeNull();
  });
});

describe("hand-edited loops through hidden pages", () => {
  it("terminates instead of hanging", () => {
    const looping = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "a",
          kind: "questions",
          title: "A",
          next: "b",
          questions: [{ id: "qa", kind: "email", prompt: "A" }],
        },
        {
          id: "b",
          kind: "questions",
          title: "B",
          next: "c",
          visibleIf: { fieldId: "never", op: "is_answered" },
          questions: [],
        },
        {
          id: "c",
          kind: "questions",
          title: "C",
          next: "b",
          visibleIf: { fieldId: "never", op: "is_answered" },
          questions: [],
        },
      ],
    });
    expect(resolvePath(looping, {})).toEqual(["a"]);
    expect(nextPageId(looping, "a", {})).toBeNull();
  });

  it("returns null from a hidden page whose fall-through points nowhere", () => {
    const dangling = Questionnaire.parse({
      version: "1",
      pages: [
        {
          id: "a",
          kind: "questions",
          title: "A",
          next: "ghost",
          questions: [{ id: "qa", kind: "email", prompt: "A" }],
        },
      ],
    });
    expect(nextPageId(dangling, "a", {})).toBeNull();
  });
});

describe("progress with visibility", () => {
  it("counts only the questions a respondent is asked", () => {
    const food = deriveProgress(MIXED, { role: "food", watts: 1 }, "sound");
    expect(food.path).toEqual(["start", "sound", "wrap"]);
    // role, has_gear, watts — gear_route and notes are hidden.
    expect(food.total).toBe(3);
    expect(food.pageIndex).toBe(1);
    expect(food.complete).toBe(true);
  });
});
