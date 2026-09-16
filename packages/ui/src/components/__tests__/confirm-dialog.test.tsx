import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "@testing-library/react"

import { ConfirmDialog, useConfirm } from "../confirm-dialog"

describe("ConfirmDialog", () => {
  it("names the action and says what happens", () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        title="Delete page 2?"
        description="Its 3 blocks go too. This can't be undone."
        confirmLabel="Delete page"
        destructive
      />,
    )
    expect(screen.getByRole("dialog", { name: /Delete page 2\?/ })).toBeTruthy()
    expect(screen.getByText(/Its 3 blocks go too/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Delete page" })).toBeTruthy()
  })

  it("confirms and cancels", () => {
    const onConfirm = vi.fn()
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={onConfirm}
        title="Close the send?"
        description="Members who haven't answered stop being asked."
        confirmLabel="Close send"
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: "Close send" }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it("cannot be confirmed twice or dismissed while pending, and shows a failure", () => {
    const onOpenChange = vi.fn()
    render(
      <ConfirmDialog
        open
        onOpenChange={onOpenChange}
        onConfirm={() => {}}
        title="Delete?"
        description="Gone for good."
        confirmLabel="Delete"
        pending
        error="Couldn't delete it."
      />,
    )
    // The spinner adds its own label to the button's accessible name.
    expect(
      (screen.getByRole("button", { name: /Delete$/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("alert").textContent).toBe("Couldn't delete it.")
  })
})

describe("useConfirm", () => {
  function Harness({ onResult }: { onResult: (value: boolean) => void }) {
    const [confirm, dialog] = useConfirm()
    return (
      <>
        <button
          type="button"
          onClick={async () =>
            onResult(
              await confirm({
                title: "Unpublish?",
                description: "Members stop being able to answer.",
                confirmLabel: "Unpublish",
              }),
            )
          }
        >
          Open
        </button>
        {dialog}
      </>
    )
  }

  it("resolves true on confirm and false on cancel, like window.confirm", async () => {
    const results: boolean[] = []
    render(<Harness onResult={(v) => results.push(v)} />)

    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Unpublish" }))
    })
    fireEvent.click(screen.getByRole("button", { name: "Open" }))
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    })

    expect(results).toEqual([true, false])
    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
