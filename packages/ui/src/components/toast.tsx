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

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ToastOptions {
  description?: string
  /** ms before auto-dismiss; `Infinity` to persist until dismissed. */
  duration?: number
  /**
   * One follow-up the toast offers ("Open", "Undo"). Pressing it runs onClick
   * and dismisses the toast. With an action, a long description is clipped to
   * three lines, since the action leads to the whole of it.
   */
  action?: ToastAction
}

export interface ToastRecord {
  id: number
  variant: ToastVariant
  title: string
  description?: string
  duration: number
  action?: ToastAction
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
      action: opts?.action,
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

/** How long a toast takes to leave, in ms. */
const EXIT_MS = 150

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function ToastItem({ toast: t }: { toast: ToastRecord }) {
  const [leaving, setLeaving] = React.useState(false)

  // Slide out, then leave the store. With reduced motion, leave at once.
  const close = React.useCallback(() => {
    if (prefersReducedMotion()) {
      dismiss(t.id)
      return
    }
    setLeaving(true)
    setTimeout(() => dismiss(t.id), EXIT_MS)
  }, [t.id])

  React.useEffect(() => {
    if (!Number.isFinite(t.duration)) return
    const timer = setTimeout(close, t.duration)
    return () => clearTimeout(timer)
  }, [close, t.duration])

  return (
    // Each toast carries its own live semantics — role="alert" (implicitly
    // assertive) for errors so failures interrupt; role="status" (implicitly
    // polite) otherwise. This is why the Toaster container is NOT a live region
    // (nesting a role="alert" inside aria-live="polite" is contradictory).
    <div
      role={t.variant === "error" ? "alert" : "status"}
      data-state={leaving ? "closed" : "open"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm shadow-lg",
        "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200",
        "data-[state=closed]:motion-safe:animate-out data-[state=closed]:motion-safe:fade-out-0 data-[state=closed]:motion-safe:slide-out-to-bottom-2",
      )}
    >
      <span className="mt-0.5 shrink-0">{ICONS[t.variant]}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{t.title}</p>
        {t.description && (
          <p
            className={cn(
              "mt-0.5 whitespace-pre-line text-muted-foreground",
              t.action && "line-clamp-3",
            )}
          >
            {t.description}
          </p>
        )}
        {t.action && (
          <button
            type="button"
            onClick={() => {
              t.action?.onClick()
              close()
            }}
            className="mt-1.5 rounded-sm text-[13px] font-semibold text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={close}
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
        "pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 p-4 sm:items-end",
        className,
      )}
    >
      {items.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  )
}
