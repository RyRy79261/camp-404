"use client"

import * as React from "react"
import {
  CircleCheck,
  Info,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react"

import { cn } from "../lib/utils"

// Lightweight toast system — a module-level store (no context provider needed)
// surfaced imperatively via `toast()`, rendered by a single mounted <Toaster/>.
// Mount <Toaster/> once near the app root; call toast/toast.success/etc anywhere
// (client). Same shape as sonner so swapping later is cheap.

export type ToastVariant = "info" | "success" | "warning" | "error"

export interface ToastOptions {
  description?: string
  /** ms before auto-dismiss; `Infinity` to persist until dismissed. */
  duration?: number
}

export interface ToastRecord {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  duration: number
}

// Module store. CLIENT-ONLY: toast()/dismiss are imperative client APIs and the
// <Toaster/> is "use client"; the server never reads this mutable state
// (getServerSnapshot returns a stable EMPTY), so there's no cross-request
// bleed under SSR. Reassigned (not mutated) so useSyncExternalStore's
// referential equality holds between unrelated renders.
let toasts: ToastRecord[] = []
const EMPTY: ToastRecord[] = []
const listeners = new Set<() => void>()
let nextId = 1

function emit() {
  for (const listener of listeners) listener()
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
function getSnapshot() {
  return toasts
}
function getServerSnapshot() {
  return EMPTY
}

/** The current toast stack — a defensive copy so callers can't mutate the store
 *  out-of-band (mutations must go through toast()/dismiss() to notify subscribers). */
export function getToasts(): readonly ToastRecord[] {
  return toasts.slice()
}

/** Dismiss one toast by id, or all of them when called with no id. */
function dismiss(id?: number) {
  toasts = id === undefined ? [] : toasts.filter((t) => t.id !== id)
  emit()
}

const DEFAULT_DURATION = 5000

// Accept a non-negative finite ms or Infinity (persist); anything else (negative,
// NaN) falls back to the default so a bad value can't make setTimeout fire at ~0.
function normalizeDuration(d: number | undefined): number {
  if (d === undefined) return DEFAULT_DURATION
  if (d === Infinity) return Infinity
  return Number.isFinite(d) && d >= 0 ? d : DEFAULT_DURATION
}

function push(variant: ToastVariant, title: string, opts?: ToastOptions): number {
  const id = nextId++
  toasts = [
    ...toasts,
    {
      id,
      variant,
      title,
      description: opts?.description,
      duration: normalizeDuration(opts?.duration),
    },
  ]
  emit()
  return id
}

type ToastFn = ((title: string, opts?: ToastOptions) => number) & {
  success: (title: string, opts?: ToastOptions) => number
  error: (title: string, opts?: ToastOptions) => number
  warning: (title: string, opts?: ToastOptions) => number
  info: (title: string, opts?: ToastOptions) => number
  /** Dismiss one toast by id, or all of them when called with no id. */
  dismiss: (id?: number) => void
}

export const toast: ToastFn = Object.assign(
  (title: string, opts?: ToastOptions) => push("info", title, opts),
  {
    success: (title: string, opts?: ToastOptions) => push("success", title, opts),
    error: (title: string, opts?: ToastOptions) => push("error", title, opts),
    warning: (title: string, opts?: ToastOptions) => push("warning", title, opts),
    info: (title: string, opts?: ToastOptions) => push("info", title, opts),
    dismiss,
  },
)

// Decorative — the variant is conveyed by role + text, so hide icons from AT.
const ICONS: Record<ToastVariant, React.ReactNode> = {
  info: <Info className="h-4 w-4 text-accent" aria-hidden />,
  success: <CircleCheck className="h-4 w-4 text-success" aria-hidden />,
  warning: <TriangleAlert className="h-4 w-4 text-warning" aria-hidden />,
  error: <XCircle className="h-4 w-4 text-destructive" aria-hidden />,
}

function ToastItem({ toast: t }: { toast: ToastRecord }) {
  React.useEffect(() => {
    if (!Number.isFinite(t.duration)) return
    const timer = setTimeout(() => dismiss(t.id), t.duration)
    return () => clearTimeout(timer)
  }, [t.id, t.duration])

  return (
    // Each toast carries its own live semantics — role="alert" (implicitly
    // assertive) for errors so failures interrupt; role="status" (implicitly
    // polite) otherwise. This is why the Toaster container is NOT a live region
    // (nesting a role="alert" inside aria-live="polite" is contradictory).
    <div
      role={t.variant === "error" ? "alert" : "status"}
      className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg"
    >
      <span className="mt-0.5 shrink-0">{ICONS[t.variant]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{t.title}</p>
        {t.description && (
          <p className="mt-0.5 text-muted-foreground">{t.description}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => dismiss(t.id)}
        aria-label={`Dismiss: ${t.title}`}
        className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}

/** Mount once near the app root. Renders the live toast stack. */
export function Toaster({ className }: { className?: string }) {
  const items = React.useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  )
  return (
    // A labelled region, NOT a live region — each toast announces via its own
    // role (status/alert) so error urgency isn't flattened to polite.
    <div
      role="region"
      aria-label="Notifications"
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end",
        className,
      )}
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
