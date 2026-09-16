import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { toast, Toaster } from "../toast"

afterEach(() => {
  act(() => toast.dismiss())
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduce && query.includes("reduce"),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe("Toaster action", () => {
  it("runs the action, slides the toast out, then removes it", () => {
    vi.useFakeTimers()
    stubReducedMotion(false)
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
    expect(screen.getByRole("status").getAttribute("data-state")).toBe("closed")
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(screen.queryByText("Water run")).toBeNull()
  })

  it("removes it at once when the device asks for less motion", () => {
    stubReducedMotion(true)
    render(<Toaster />)
    act(() => {
      toast.info("Water run")
    })
    fireEvent.click(screen.getByRole("button", { name: "Dismiss: Water run" }))
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
