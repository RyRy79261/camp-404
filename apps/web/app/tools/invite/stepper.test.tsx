import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Stepper } from "./stepper";

describe("Stepper", () => {
  it("renders the current value in the number input", () => {
    render(<Stepper value="3" onChange={() => {}} aria-label="count" />);
    expect((screen.getByLabelText("count") as HTMLInputElement).value).toBe("3");
  });

  it("increments via +", () => {
    const onChange = vi.fn();
    render(<Stepper value="3" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Increase"));
    expect(onChange).toHaveBeenCalledWith("4");
  });

  it("decrements via −", () => {
    const onChange = vi.fn();
    render(<Stepper value="3" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Decrease"));
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("disables − at the min", () => {
    render(<Stepper value="1" onChange={() => {}} min={1} />);
    expect((screen.getByLabelText("Decrease") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("disables + at the max", () => {
    render(<Stepper value="100" onChange={() => {}} max={100} />);
    expect((screen.getByLabelText("Increase") as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});
