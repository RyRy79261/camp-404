import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { toast, Toaster } from "../toast"

afterEach(() => {
  act(() => toast.dismiss())
})

describe("Toaster action", () => {
  it("runs the action and dismisses the toast", () => {
    const onClick = vi.fn()
    render(<Toaster />)
    act(() => {
      toast.info("Water run", {
        description: "Truck leaves at 9.",
        action: { label: "Open", onClick },
      })
    })
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    expect(onClick).toHaveBeenCalledOnce()
    expect(screen.queryByText("Water run")).toBeNull()
  })

  it("clips a long description only when the action leads to the rest", () => {
    render(<Toaster />)
    act(() => {
      toast.info("With action", {
        description: "Long body",
        action: { label: "Open", onClick: () => {} },
      })
      toast.error("Without action", { description: "A full error message" })
    })
    expect(screen.getByText("Long body").className).toContain("line-clamp-3")
    expect(screen.getByText("A full error message").className).not.toContain(
      "line-clamp",
    )
  })
})
