import {
  cleanup,
  configure,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Questionnaire, QuestionsPage } from "@camp404/types";
import { choose, installSelectPolyfills } from "./select-helpers";

// The builder's DOM is large. Role queries skip the is-it-hidden walk
// (getComputedStyle up the tree for every candidate), and the time limits are
// raised, because under a full parallel run the first render alone took ten
// seconds. A stuck test still fails, later.
configure({ defaultHidden: true, asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 45_000 });

// The builder end to end in the DOM: sections and blocks edit the unified
// questionnaire in place, "Save draft" writes it, publishing is the captain's
// and shows what it refused beside the blocks, deletes and leaving with unsaved
// changes ask first, and blocks reorder by arrows or by dragging.

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("@/app/(console)/captains/questionnaires/actions", () => ({
  closeActivationAction: vi.fn(),
  getCarryOverAction: vi.fn(async () => ({ ok: true, carryOver: true })),
  publishAction: vi.fn(async () => ({
    ok: true,
    version: "gear-check-v1",
    change: "initial",
  })),
  setCarryOverAction: vi.fn(),
  unpublishAction: vi.fn(),
  updateDefinitionAction: vi.fn(async () => ({ ok: true })),
}));
vi.mock("@camp404/ui/components/toast", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  publishAction,
  updateDefinitionAction,
} from "@/app/(console)/captains/questionnaires/actions";
import { toast } from "@camp404/ui/components/toast";
import { QuestionnaireBuilderV2 } from "../builder";

beforeAll(installSelectPolyfills);
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const DEFINITION: Questionnaire = {
  version: "1",
  title: "Gear check",
  pages: [
    {
      id: "s1",
      kind: "questions",
      title: "Gear check",
      pageType: "question",
      questions: [
        {
          id: "colour",
          kind: "short_text",
          prompt: "Favourite colour",
          maxLength: 120,
          required: false,
        },
        {
          id: "tent",
          kind: "boolean",
          prompt: "Bringing a tent?",
          required: false,
        },
      ],
    },
    {
      id: "s2",
      kind: "questions",
      title: "Second",
      questions: [],
    },
  ],
};

function renderBuilder(
  props: Partial<Parameters<typeof QuestionnaireBuilderV2>[0]> = {},
  definition: Questionnaire = DEFINITION,
) {
  return render(
    <QuestionnaireBuilderV2
      initial={{
        key: "gear-check",
        definition,
        status: "draft",
        version: null,
      }}
      isCaptain
      {...props}
    />,
  );
}

const saved = (call = 0) =>
  vi.mocked(updateDefinitionAction).mock.calls[call]![1] as Questionnaire;
const section = (n: number) =>
  screen.getByRole("region", { name: `Section ${n}` });
const status = () => screen.getAllByRole("status").at(-1)!;

describe("QuestionnaireBuilderV2 — layout", () => {
  it("draws AfrikaBurn's three parts: the palette, the details and sections, the lifecycle rail", () => {
    renderBuilder();
    const palette = screen.getByRole("complementary", { name: "Add a block" });
    expect(
      within(palette).getByRole("group", { name: "Content" }),
    ).toBeTruthy();
    expect(
      within(palette).getByRole("button", { name: "Short answer" }),
    ).toBeTruthy();
    expect(
      within(palette).getByRole("button", { name: "Section / page break" }),
    ).toBeTruthy();
    expect(screen.getByText("Details")).toBeTruthy();
    expect(screen.getByText("2 sections · 2 questions")).toBeTruthy();
    expect(
      screen.getByRole("complementary", { name: "Publish and send" }),
    ).toBeTruthy();
    expect(
      screen.getByText(/Every question you add is a question a camp member/),
    ).toBeTruthy();
    expect(status().textContent).toContain("No changes yet");
  });
});

describe("QuestionnaireBuilderV2 — editing and saving", () => {
  it("claims nothing before an edit, says so after one, and saves the unified model", async () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Section 2 title"), {
      target: { value: "Getting there" },
    });
    expect(status().textContent).toContain("Unsaved changes");
    expect(updateDefinitionAction).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(status().textContent).toContain("All changes saved"),
    );
    expect(updateDefinitionAction).toHaveBeenCalledWith(
      "gear-check",
      expect.objectContaining({ version: "1", title: "Gear check" }),
    );
    expect((saved().pages[1] as QuestionsPage).title).toBe("Getting there");
  });

  it("renames the first section with the questionnaire while they match, and keeps the description on it", async () => {
    renderBuilder();
    fireEvent.change(screen.getByPlaceholderText("e.g. Gear check"), {
      target: { value: "Kit check" },
    });
    fireEvent.change(
      screen.getByPlaceholderText(
        "One line telling members why you're asking.",
      ),
      { target: { value: "So nobody sleeps outside." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateDefinitionAction).toHaveBeenCalled());
    expect(saved().title).toBe("Kit check");
    expect(saved().pages[0]).toMatchObject({
      title: "Kit check",
      subtitle: "So nobody sleeps outside.",
    });
  });

  it("keeps the edit and says so when the server refuses the save", async () => {
    vi.mocked(updateDefinitionAction).mockResolvedValueOnce({
      ok: false,
      error: "This questionnaire is too large to save.",
    });
    renderBuilder();
    fireEvent.click(
      within(
        screen.getByRole("complementary", { name: "Add a block" }),
      ).getByRole("button", { name: "Section / page break" }),
    );
    fireEvent.change(screen.getByLabelText("Section 3 title"), {
      target: { value: "Later" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(status().textContent).toContain("Couldn't save."),
    );
    expect(toast.error).toHaveBeenCalledWith("Not saved", {
      description: "This questionnaire is too large to save.",
    });
    // Nothing was rolled back: the author can fix it and save again.
    expect(section(3)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(status().textContent).toContain("All changes saved"),
    );
    expect(updateDefinitionAction).toHaveBeenCalledTimes(2);
  });

  it("will not save a question with no words, and shows where it is", async () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Short answer" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText("1 problem is blocking this save"),
    ).toBeTruthy();
    expect(updateDefinitionAction).not.toHaveBeenCalled();
    const block = screen.getByRole("group", { name: "Short answer: block 3" });
    expect(within(block).getByText("Write the question.")).toBeTruthy();

    fireEvent.change(within(block).getByLabelText("Question prompt"), {
      target: { value: "Tent size?" },
    });
    await waitFor(() =>
      expect(screen.queryByText("1 problem is blocking this save")).toBeNull(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateDefinitionAction).toHaveBeenCalled());
  });
});

describe("QuestionnaireBuilderV2 — adding blocks", () => {
  it("adds from the palette to the section being worked on, with a fresh id", async () => {
    renderBuilder();
    fireEvent.click(section(2));
    expect(screen.getByText("to 2. Second")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Slider" }));
    const added = within(section(2)).getByRole("group", {
      name: "Slider: block 1",
    });
    expect(added.id).toMatch(/^block-q_[0-9a-f]{8}$/);
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(added).getByLabelText("Question prompt"),
      ),
    );
  });

  it("adds from a section's own picker and its Quick question button", async () => {
    renderBuilder();
    await choose(
      screen.getByRole("combobox", { name: "Add a block to section 2" }),
      "Heading",
    );
    fireEvent.click(
      within(section(2)).getByRole("button", { name: "Quick question" }),
    );
    expect(
      within(section(2))
        .getAllByRole("group")
        .map((g) => g.getAttribute("aria-label")),
    ).toEqual(["Heading: block 1", "Short answer: block 2"]);
  });

  it("duplicates a block under a new id, right after it", () => {
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Duplicate Favourite colour" }),
    );
    const blocks = within(section(1)).getAllByRole("group", {
      name: /Favourite colour/,
    });
    expect(blocks).toHaveLength(2);
    expect(blocks[0]!.id).toBe("block-colour");
    expect(blocks[1]!.id).not.toBe("block-colour");
  });
});

describe("QuestionnaireBuilderV2 — reordering", () => {
  const order = () =>
    within(section(1))
      .getAllByRole("group")
      .map((g) => g.id);

  it("moves a block with its arrows, ids and all", async () => {
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Move Favourite colour down" }),
    );
    expect(order()).toEqual(["block-tent", "block-colour"]);
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(updateDefinitionAction).toHaveBeenCalled());
    expect(
      (saved().pages[0] as QuestionsPage).questions.map((b) => b.id),
    ).toEqual(["tent", "colour"]);
  });

  it("moves a section with its arrows", () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Move section 2 up" }));
    expect(screen.getByLabelText("Section 1 title")).toHaveProperty(
      "value",
      "Second",
    );
  });

  it("shows a floating copy of a block picked up with the keyboard, gone on cancel", async () => {
    renderBuilder();
    const handle = screen.getByRole("button", {
      name: "Reorder Favourite colour",
    });
    expect(screen.queryAllByText("Favourite colour")).toHaveLength(0);

    fireEvent.keyDown(handle, { key: " ", code: "Space" });
    await screen
      .findAllByText("Favourite colour")
      .then((found) => expect(found).toHaveLength(1));

    fireEvent.keyDown(handle, { key: "Escape", code: "Escape" });
    await vi.waitFor(() =>
      expect(screen.queryAllByText("Favourite colour")).toHaveLength(0),
    );
  });
});

describe("QuestionnaireBuilderV2 — deletes ask first", () => {
  it("asks before deleting a block, and deletes nothing on cancel", async () => {
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Favourite colour" }),
    );
    await screen.findByText("Delete “Favourite colour”?");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.queryByText("Delete “Favourite colour”?")).toBeNull(),
    );
    expect(
      screen.getByRole("group", { name: "Short answer: Favourite colour" }),
    ).toBeTruthy();
  });

  it("deletes the block once confirmed", async () => {
    renderBuilder();
    fireEvent.click(
      screen.getByRole("button", { name: "Delete Favourite colour" }),
    );
    await screen.findByText("Delete “Favourite colour”?");
    fireEvent.click(screen.getByRole("button", { name: "Delete block" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("group", { name: "Short answer: Favourite colour" }),
      ).toBeNull(),
    );
    expect(status().textContent).toContain("Unsaved changes");
  });

  it("asks before deleting a section, naming what goes with it", async () => {
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Delete section 1" }));
    await screen.findByText("Delete section 1?");
    expect(screen.getByText("Its 2 blocks go with it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Delete section" }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Section 2" })).toBeNull(),
    );
  });

  it("keeps the last section", () => {
    renderBuilder({}, { ...DEFINITION, pages: [DEFINITION.pages[0]!] });
    expect(
      (
        screen.getByRole("button", {
          name: "Delete section 1",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });
});

describe("QuestionnaireBuilderV2 — conditions", () => {
  it("describes a block's and a section's show-when rule, and flags a broken one", () => {
    const definition: Questionnaire = {
      ...DEFINITION,
      pages: [
        {
          ...(DEFINITION.pages[0] as QuestionsPage),
          questions: [
            ...(DEFINITION.pages[0] as QuestionsPage).questions,
            {
              id: "plate",
              kind: "short_text",
              prompt: "Number plate",
              maxLength: 20,
              required: false,
              visibleIf: { fieldId: "removed", op: "is_answered" },
            },
          ],
        },
        {
          ...(DEFINITION.pages[1] as QuestionsPage),
          visibleIf: { fieldId: "tent", op: "eq", value: false },
        },
      ],
    };
    renderBuilder({}, definition);
    expect(
      screen.getByText("Shown when “Bringing a tent?” is No."),
    ).toBeTruthy();
    expect(
      within(
        screen.getByRole("group", { name: "Short answer: Number plate" }),
      ).getByText(/The question this depends on is missing/),
    ).toBeTruthy();
  });
});

describe("QuestionnaireBuilderV2 — publishing", () => {
  it("saves unsaved changes first, then publishes", async () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Section 2 title"), {
      target: { value: "Later" },
    });
    expect(
      screen.getByText("Your unsaved changes are saved first."),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(publishAction).toHaveBeenCalledWith("gear-check"),
    );
    expect(updateDefinitionAction).toHaveBeenCalledTimes(1);
    expect(
      vi.mocked(updateDefinitionAction).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(publishAction).mock.invocationCallOrder[0]!);
    expect(toast.success).toHaveBeenCalledWith("Published");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows what publishing refused beside the block it is about", async () => {
    vi.mocked(publishAction).mockResolvedValueOnce({
      ok: false,
      errors: [
        '"Bringing a tent?" and "Driving?" are both marked for the same use. Mark only one.',
      ],
      issues: [
        {
          path: "pages[0].questions[1].role",
          code: "duplicate_role",
          message:
            '"Bringing a tent?" and "Driving?" are both marked for the same use. Mark only one.',
          pageId: "s1",
          blockId: "tent",
        },
      ],
    });
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    expect(
      await screen.findByText("1 problem is blocking publishing"),
    ).toBeTruthy();
    const block = screen.getByRole("group", {
      name: "Yes / No: Bringing a tent?",
    });
    expect(
      within(block).getByText(/are both marked for the same use/),
    ).toBeTruthy();
    expect(updateDefinitionAction).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("Not published", {
      description: "1 problem is blocking publishing.",
    });
  });

  it("says a refusal that is not about the questionnaire's content", async () => {
    vi.mocked(publishAction).mockResolvedValueOnce({
      ok: false,
      errors: ["Only captains can publish or send."],
      issues: [],
    });
    renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Not published", {
        description: "Only captains can publish or send.",
      }),
    );
  });

  it("shows a team lead why Publish is out of reach", () => {
    renderBuilder({ isCaptain: false });
    const publish = screen.getByRole("button", { name: "Publish" });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect(
      document.getElementById(publish.getAttribute("aria-describedby")!)
        ?.textContent,
    ).toMatch(/Only captains can publish/);
  });
});

describe("QuestionnaireBuilderV2 — leaving with unsaved changes", () => {
  it("asks before following a link, and goes once the author agrees", async () => {
    renderBuilder();
    const cancel = screen.getByRole("link", { name: "Cancel" });
    fireEvent.click(cancel);
    // Nothing unsaved: the link is left to do its job.
    expect(screen.queryByText("Leave without saving?")).toBeNull();

    fireEvent.change(screen.getByLabelText("Section 2 title"), {
      target: { value: "Later" },
    });
    fireEvent.click(cancel);
    await screen.findByText("Leave without saving?");
    expect(push).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole("button", { name: "Leave without saving" }),
    );
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/captains/questionnaires"),
    );
  });

  it("asks the browser before a reload", () => {
    renderBuilder();
    fireEvent.change(screen.getByLabelText("Section 2 title"), {
      target: { value: "Later" },
    });
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
