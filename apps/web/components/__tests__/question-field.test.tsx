import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Question } from "@camp404/types";

// `image` reads the activation off the route so the upload route can resolve
// the question against THAT activation's pinned definition; outside a route
// context `useParams()` is null, which is the burner-profile shape. AvatarUpload
// is stubbed to the one thing under test here — the URL it is handed; its own
// POST behaviour is covered in profile/__tests__.
const route = vi.hoisted(() => ({
  params: null as Record<string, string | string[]> | null,
}));
vi.mock("next/navigation", () => ({ useParams: () => route.params }));
vi.mock("@camp404/ui/components/avatar-upload", () => ({
  AvatarUpload: ({ uploadUrl }: { uploadUrl?: string }) => (
    <div data-testid="upload" data-url={uploadUrl ?? "(component default)"} />
  ),
}));

import { QuestionField } from "../questionnaire/field";

afterEach(cleanup);

const q = (raw: unknown) => Question.parse(raw);

describe("QuestionField — labels", () => {
  it("labels a text box with its prompt and ties the hint and error to it", () => {
    render(
      <QuestionField
        question={q({
          id: "name",
          kind: "short_text",
          prompt: "Your name",
          helper: "As on your ID",
        })}
        value=""
        error="This question is required"
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole("textbox", { name: "Your name" });
    expect(input.getAttribute("id")).toBe("q-name");
    expect(input.getAttribute("aria-required")).toBe("true");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const described = input.getAttribute("aria-describedby") ?? "";
    expect(described.split(" ")).toEqual(["q-name-help", "q-name-error"]);
    expect(screen.getByRole("alert").textContent).toBe(
      "This question is required",
    );
  });

  it("names a composite control by its prompt and says it is required", () => {
    render(
      <QuestionField
        question={q({
          id: "lead",
          kind: "boolean",
          prompt: "Lead a team?",
          required: true,
        })}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("group", { name: /^Lead a team\?.*\(required\)$/ }),
    ).toBeTruthy();
  });
});

describe("QuestionField — single_select", () => {
  const drivingOptions = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
    { value: "maybe", label: "Maybe — still working it out" },
  ];
  const driving = q({
    id: "logistics.driving",
    kind: "single_select",
    prompt: "Will you be driving a car to the burn?",
    options: drivingOptions,
  });

  it("renders radio rows by default, not a dropdown", () => {
    render(
      <QuestionField
        question={driving}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("radiogroup")).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("emits the chosen option's value", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={driving}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Yes" }));
    expect(onChange).toHaveBeenCalledWith("yes");
  });

  it("renders a dropdown when the author asks for one", () => {
    render(
      <QuestionField
        question={q({ ...driving, display: "dropdown" })}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(
      screen.getByRole("combobox", { name: /driving a car/ }),
    ).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("shows option pictures in an image grid, but only Camp 404's own", () => {
    render(
      <QuestionField
        question={q({
          id: "tent",
          kind: "single_select",
          prompt: "Tent",
          display: "image_grid",
          options: [
            {
              value: "dome",
              label: "Dome",
              imageUrl:
                "https://camp404store.public.blob.vercel-storage.com/dome.jpg",
            },
            {
              value: "bell",
              label: "Bell",
              imageUrl: "https://tracker.example/pixel.gif",
            },
          ],
        })}
        value="dome"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole("img", { name: "Dome" })).toBeTruthy();
    expect(screen.queryByRole("img", { name: "Bell" })).toBeNull();
    expect(
      screen.getByRole("radio", { name: /Dome/ }).getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("honours presentation order", () => {
    render(
      <QuestionField
        question={driving}
        options={[...drivingOptions].reverse()}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("radio")[0]?.textContent).toContain("Maybe");
  });
});

describe("QuestionField — number", () => {
  // A 0–6 team interest: a row of whole-number cells to tap. The stored value
  // is the chosen integer.
  const interest = q({
    id: "team_interest.kitchen",
    kind: "number",
    prompt: "Kitchen",
    min: 0,
    max: 6,
    minLabel: "Not for me",
    maxLabel: "Sign me up",
    required: false,
  });

  it("renders a cell per whole number from min..max (0–6 ⇒ 7 cells)", () => {
    render(
      <QuestionField
        question={interest}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(screen.getAllByRole("radio").map((c) => c.textContent)).toEqual([
      "0",
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.getByText("Not for me")).toBeTruthy();
  });

  it("emits the chosen cell as a number", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={interest}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("types a wide range into a number box with its bounds", () => {
    const onChange = vi.fn();
    const people = q({
      id: "people",
      kind: "number",
      prompt: "People",
      min: 1,
      max: 80,
    });
    const { rerender } = render(
      <QuestionField question={people} value={undefined} onChange={onChange} />,
    );
    const input = screen.getByRole("spinbutton", { name: /People/ });
    expect(input.getAttribute("min")).toBe("1");
    expect(input.getAttribute("max")).toBe("80");
    fireEvent.change(input, { target: { value: "12" } });
    expect(onChange).toHaveBeenLastCalledWith(12);
    rerender(
      <QuestionField question={people} value={12} onChange={onChange} />,
    );
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe("QuestionField — slider", () => {
  it("renders number cells for the segmented display, not a dragged slider", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({
          id: "rating",
          kind: "slider",
          prompt: "Rate it",
          min: 1,
          max: 5,
          step: 1,
          display: "segmented",
        })}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.getAllByRole("radio").map((c) => c.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "4" }));
    expect(onChange).toHaveBeenCalledWith(4);
  });

  it("renders a slider named by its prompt, starting at the minimum", () => {
    render(
      <QuestionField
        question={q({
          id: "heat",
          kind: "slider",
          prompt: "Heat",
          min: 2,
          max: 9,
        })}
        value={undefined}
        onChange={() => {}}
      />,
    );
    const slider = screen.getByRole("slider", { name: /Heat/ });
    expect(slider.getAttribute("aria-valuenow")).toBe("2");
  });
});

describe("QuestionField — boolean", () => {
  const lead = q({
    id: "lead",
    kind: "boolean",
    prompt: "Want to lead a team?",
  });

  it("offers Yes and No with neither picked until the member answers", () => {
    render(
      <QuestionField question={lead} value={undefined} onChange={() => {}} />,
    );
    expect(
      screen.getByRole("button", { name: "Yes" }).getAttribute("aria-pressed"),
    ).toBe("false");
    expect(
      screen.getByRole("button", { name: "No" }).getAttribute("aria-pressed"),
    ).toBe("false");
  });

  it("emits a real boolean, No included", () => {
    const onChange = vi.fn();
    render(<QuestionField question={lead} value={true} onChange={onChange} />);
    expect(
      screen.getByRole("button", { name: "Yes" }).getAttribute("aria-pressed"),
    ).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "No" }));
    expect(onChange).toHaveBeenCalledWith(false);
  });
});

describe("QuestionField — email & phone", () => {
  it("email uses the email input type and emits the typed string", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ id: "e", kind: "email", prompt: "Email" })}
        value={undefined}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("textbox") as HTMLInputElement;
    expect(input.type).toBe("email");
    fireEvent.change(input, { target: { value: "a@b.co" } });
    expect(onChange).toHaveBeenCalledWith("a@b.co");
  });

  it("phone uses the tel input type", () => {
    render(
      <QuestionField
        question={q({ id: "p", kind: "phone", prompt: "Phone" })}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect((screen.getByRole("textbox") as HTMLInputElement).type).toBe("tel");
  });
});

describe("QuestionField — AfrikaBurn's scale kinds", () => {
  it("linear scale: one radio per step with end labels", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({
          id: "fun",
          kind: "linear_scale",
          prompt: "How fun?",
          min: 1,
          max: 5,
          minLabel: "Meh",
          maxLabel: "Wild",
        })}
        value={3}
        onChange={onChange}
      />,
    );
    expect(screen.getAllByRole("radio")).toHaveLength(5);
    expect(
      screen.getByRole("radio", { name: "3" }).getAttribute("aria-checked"),
    ).toBe("true");
    expect(screen.getByText("Wild")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect(onChange).toHaveBeenCalledWith(5);
  });

  it("rating: names each step out of the total", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ id: "r", kind: "rating", prompt: "Rate", steps: 4 })}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Tap to rate — up to 4")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "2 out of 4" }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it("scale: labelled steps as option cards emitting the step value", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({
          id: "cook",
          kind: "scale",
          prompt: "Cooking",
          steps: [
            { value: "none", label: "Can't boil an egg" },
            { value: "chef", label: "Chef" },
          ],
        })}
        value={undefined}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Chef" }));
    expect(onChange).toHaveBeenCalledWith("chef");
  });

  it("toggle: a segmented control", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({
          id: "id.type",
          kind: "toggle",
          prompt: "ID type",
          options: [
            { value: "sa_id", label: "SA ID" },
            { value: "passport", label: "Passport" },
          ],
        })}
        value={undefined}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("radiogroup", { name: "ID type (required)" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Passport" }));
    expect(onChange).toHaveBeenCalledWith("passport");
  });
});

describe("QuestionField — grids", () => {
  const grid = (kind: "multi_choice_grid" | "checkbox_grid") =>
    q({
      id: "shifts",
      kind,
      prompt: "Shifts",
      rows: [
        { id: "mon", label: "Monday" },
        { id: "tue", label: "Tuesday" },
      ],
      columns: [
        { value: "am", label: "Morning" },
        { value: "pm", label: "Evening" },
      ],
    });

  it("a choice grid takes one column per row, and a second tap clears it", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <QuestionField
        question={grid("multi_choice_grid")}
        value={{ mon: ["am"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Monday: Evening" }));
    expect(onChange).toHaveBeenLastCalledWith({ mon: ["pm"] });
    rerender(
      <QuestionField
        question={grid("multi_choice_grid")}
        value={{ mon: ["pm"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "Monday: Evening" }));
    expect(onChange).toHaveBeenLastCalledWith({});
  });

  it("a checkbox grid takes several columns per row", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={grid("checkbox_grid")}
        value={{ tue: ["am"] }}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Tuesday: Evening" }));
    expect(onChange).toHaveBeenLastCalledWith({ tue: ["am", "pm"] });
  });
});

describe("QuestionField — other AfrikaBurn kinds", () => {
  it("years: offers the burn years and disables the ones with no burn", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ id: "y", kind: "years", prompt: "Years" })}
        value={["2024"]}
        onChange={onChange}
      />,
    );
    expect(
      screen.getByRole("button", { name: "2020 — no burn was held" }),
    ).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("button", { name: "2025" }));
    expect(onChange).toHaveBeenLastCalledWith(["2024", "2025"]);
    fireEvent.click(screen.getByRole("button", { name: "2024" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("time: a time box", () => {
    render(
      <QuestionField
        question={q({ id: "t", kind: "time", prompt: "Arrival time" })}
        value="09:30"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText(/Arrival time/).getAttribute("type")).toBe(
      "time",
    );
  });

  it("file link: a link box, since uploads here take images only", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({ id: "f", kind: "file_link", prompt: "Your plan" })}
        value={undefined}
        onChange={onChange}
      />,
    );
    const input = screen.getByLabelText(/Your plan/);
    expect(input.getAttribute("type")).toBe("url");
    fireEvent.change(input, {
      target: { value: "https://example.org/plan.pdf" },
    });
    expect(onChange).toHaveBeenCalledWith("https://example.org/plan.pdf");
  });

  it("multi select: chips that are checkboxes, with a selection hint", () => {
    const onChange = vi.fn();
    render(
      <QuestionField
        question={q({
          id: "m",
          kind: "multi_select",
          prompt: "Teams",
          minSelections: 1,
          maxSelections: 2,
          options: [
            { value: "a", label: "Kitchen" },
            { value: "b", label: "Build" },
          ],
        })}
        value={["a"]}
        onChange={onChange}
      />,
    );
    expect(screen.getByText("Pick 1–2 options.")).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Build" }));
    expect(onChange).toHaveBeenLastCalledWith(["a", "b"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Kitchen" }));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});

describe("QuestionField — image upload endpoint", () => {
  const imageQuestion = (id: string, role?: "profile_photo") =>
    q({
      id,
      kind: "image",
      prompt: "Add a photo",
      ...(role ? { role } : {}),
    });
  const uploadUrl = () => screen.getByTestId("upload").getAttribute("data-url");

  afterEach(() => {
    route.params = null;
  });

  it("posts an ordinary image answer to the questionnaire route, by question id", () => {
    render(
      <QuestionField
        question={imageQuestion("kitchen.setup_photo")}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(uploadUrl()).toBe(
      "/api/uploads/questionnaire-image?question=kitchen.setup_photo",
    );
  });

  it("names the activation when the runner is mounted on one", () => {
    // Without this the upload route cannot tell WHICH questionnaire is being
    // answered, so it can only authorize the burner profile's questions.
    route.params = { activationId: "act-1" };
    render(
      <QuestionField
        question={imageQuestion("gear.photo")}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(uploadUrl()).toBe(
      "/api/uploads/questionnaire-image?question=gear.photo&activation=act-1",
    );
  });

  it("keeps the burner profile photo on the avatar route, activation or not", () => {
    // The profile photo question IS the member's profile photo (onboarding
    // mirrors it onto users.profile_image_url), so it must never take the
    // answers path. It is found by role, so the id does not matter.
    route.params = { activationId: "act-1" };
    render(
      <QuestionField
        question={imageQuestion("any.photo.id", "profile_photo")}
        value={undefined}
        onChange={() => {}}
      />,
    );
    expect(uploadUrl()).toBe("(component default)");
  });

  it("offers no upload in the author preview", () => {
    render(
      <QuestionField
        question={imageQuestion("tent")}
        value={undefined}
        onChange={() => {}}
        uploadsOff
      />,
    );
    expect(screen.queryByTestId("upload")).toBeNull();
    expect(
      screen.getByText(
        "Uploads are off in the preview. Members can add a photo here.",
      ),
    ).toBeTruthy();
  });
});
