"use client"

import * as React from "react"
import { TriangleAlert } from "lucide-react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { Spinner } from "./spinner"

// A themed confirmation step for an action a person should not take by
// accident: title, the consequence in plain words, and the action named on its
// own button. It replaces the browser's window.confirm, which ignores the
// theme, cannot say what will happen in more than a line, and cannot show a
// pending or failed state.
//
// Dismissal is blocked while `pending`, so a slow action cannot be closed
// half-way. A failure shows inside the dialog, where the person is looking.

export interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** What happens if they confirm. */
  description: React.ReactNode
  /** The action, named: "Delete", "Publish to 42 members". */
  confirmLabel: string
  cancelLabel?: string
  /** A destructive action gets the warning icon and the destructive button. */
  destructive?: boolean
  pending?: boolean
  error?: string | null
  onConfirm: () => void
  /** Extra detail between the description and the buttons. */
  children?: React.ReactNode
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  pending = false,
  error,
  onConfirm,
  children,
}: ConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!pending) onOpenChange(next)
      }}
    >
      <DialogContent
        className={cn("sm:max-w-md", destructive && "border-destructive")}
        showCloseButton={!pending}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {destructive && (
              <TriangleAlert aria-hidden className="h-4 w-4 text-destructive" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "default"}
            className="w-full sm:w-auto"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Spinner size="sm" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

type ConfirmOptions = Omit<
  ConfirmDialogProps,
  "open" | "onOpenChange" | "onConfirm" | "pending" | "error"
>

/**
 * A drop-in for `window.confirm` inside an event handler:
 *
 *   const [confirm, confirmDialog] = useConfirm()
 *   if (!(await confirm({ title, description, confirmLabel }))) return
 *   // ...and render {confirmDialog} once.
 *
 * Resolves true on confirm, false on cancel or dismiss. For an action that
 * needs a pending or error state inside the dialog, use ConfirmDialog directly.
 */
function useConfirm(): [
  (options: ConfirmOptions) => Promise<boolean>,
  React.ReactNode,
] {
  const [state, setState] = React.useState<{
    options: ConfirmOptions
    resolve: (value: boolean) => void
  } | null>(null)

  const confirm = React.useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setState({ options, resolve })),
    [],
  )

  const settle = (value: boolean) => {
    state?.resolve(value)
    setState(null)
  }

  const dialog = state ? (
    <ConfirmDialog
      {...state.options}
      open
      onOpenChange={(next) => {
        if (!next) settle(false)
      }}
      onConfirm={() => settle(true)}
    />
  ) : null

  return [confirm, dialog]
}

export { ConfirmDialog, useConfirm }
