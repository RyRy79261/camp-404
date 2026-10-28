"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Check, Copy, Upload, X } from "lucide-react";
import { campDayKey, formatMoney } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { ProgressBar } from "@camp404/ui/components/progress-bar";
import { ProofDialog } from "@/app/(console)/dues/my-dues-forms";
import { MY_DUES_PATH } from "@/lib/dues-copy";
import {
  hiddenOn,
  hideUntilTomorrow,
  PAY_GUIDE_HIDDEN_KEY,
  readHiddenUntil,
} from "@/lib/pay-guide-hidden";
import {
  nextPaymentWords,
  type NextPaymentWords,
  type PayGuideData,
} from "@/lib/pledge-view";

// The pay guide (camp fees sprint, the owner's pick: mock-up step 4, Option
// A). On the desktop a card rises from the tray at the bottom right; on a
// phone a banner sits above the bottom bar and opens as a sheet. Each is the
// other's `md:hidden` / `max-md:hidden` twin, so the layout is CSS, never a
// screen check. It talks about the NEXT payment, not the whole fee: the
// amount and day, what is paid of the total, the member's reference with
// Copy, the camp's bank details from South Africa or from abroad, and "Send
// your proof of payment" (My dues' own proof form, in a dialog).
//
// Who sees it is the server's call (getMyFeePayment's showPayGuide: the year
// is collecting fees, they owe, and they did not ask for a subsidy), read in
// the console layout for a full desktop only: never the blocking layer, never
// the held desktop, and never in a window, so no frozen copy holds it. "Remind
// me tomorrow" hides it until the next camp day, in this browser only (a day
// in browser storage, nothing else). My dues' "How to pay" opens it again.

export type { PayGuideData };

interface PayGuideHost {
  /** Open the guide, even when hidden until tomorrow. */
  open: () => void;
}

const HostContext = createContext<PayGuideHost | null>(null);
const StateContext = createContext<HostState | null>(null);

interface HostState {
  data: PayGuideData;
  words: NextPaymentWords;
  /** Hidden by "Remind me tomorrow" (and not opened since). */
  hidden: boolean;
  expanded: boolean;
  setExpanded: (open: boolean) => void;
  sheetOpen: boolean;
  setSheetOpen: (open: boolean) => void;
  remindTomorrow: () => void;
}

// Browser storage as a store: this tab's own writes and other tabs' both
// reach every reader.
const HIDDEN_EVENT = "camp404:pay-guide-hidden";
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === PAY_GUIDE_HIDDEN_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HIDDEN_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HIDDEN_EVENT, onChange);
  };
}

/**
 * Holds the guide's state for the desktop: wrap the desktop in it, draw
 * `PayGuideOverlay` where the card and banner go, and a page's "How to pay"
 * finds it. With no data (not collecting, nothing owed, a subsidy, a held or
 * restricted desktop) it provides nothing, and draws nothing.
 */
export function PayGuideProvider({
  data,
  children,
}: {
  data: PayGuideData | null;
  children: ReactNode;
}) {
  const words = useMemo(
    () =>
      data
        ? nextPaymentWords(data.next, {
            paidCents: data.paidCents,
            feeTotalCents: data.feeTotalCents,
          })
        : null,
    [data],
  );
  // The server knows nothing of the browser's storage: until the first
  // client render, the guide counts as hidden, so it never flashes up.
  const stored = useSyncExternalStore(
    subscribe,
    () => readHiddenUntil() ?? "",
    () => "9999-12-31",
  );
  const [forced, setForced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const hidden = !forced && hiddenOn(stored || null, campDayKey(new Date()));

  const remindTomorrow = useCallback(() => {
    hideUntilTomorrow(campDayKey(new Date()));
    setForced(false);
    setExpanded(false);
    setSheetOpen(false);
    window.dispatchEvent(new Event(HIDDEN_EVENT));
  }, []);
  const host = useMemo<PayGuideHost>(
    () => ({
      open: () => {
        setForced(true);
        setExpanded(true);
        setSheetOpen(true);
      },
    }),
    [],
  );

  if (!data || !words) return <>{children}</>;
  return (
    <HostContext.Provider value={host}>
      <StateContext.Provider
        value={{
          data,
          words,
          hidden,
          expanded,
          setExpanded,
          sheetOpen,
          setSheetOpen,
          remindTomorrow,
        }}
      >
        {children}
      </StateContext.Provider>
    </HostContext.Provider>
  );
}

/**
 * The card (desktop) and the banner and sheet (phone). `covered`: a phone's
 * program or sheet covers the home screen, so the banner keeps out of its
 * way (the sheet, once asked for, still opens over it).
 */
export function PayGuideOverlay({ covered = false }: { covered?: boolean }) {
  const state = useContext(StateContext);
  if (!state) return null;
  const { words, hidden, expanded, sheetOpen } = state;
  return (
    <>
      {!hidden && (
        <section
          aria-label="Camp fee"
          data-pay-guide
          className="absolute bottom-2 right-12 z-40 w-[25rem] max-w-[calc(100%-4rem)] select-text border-2 border-os-primary bg-os-panel text-os-fg shadow-[6px_6px_0_0_rgb(0_0_0/0.55)] max-md:hidden"
        >
          {expanded ? (
            <GuideBody
              state={state}
              onClose={() => state.setExpanded(false)}
              closeLabel="Close the pay guide"
            />
          ) : (
            <div className="relative p-4">
              <button
                type="button"
                onClick={state.remindTomorrow}
                aria-label="Remind me tomorrow"
                title="Remind me tomorrow"
                className="absolute right-2 top-2 p-1 text-os-muted hover:text-os-fg"
              >
                <X className="size-4" aria-hidden />
              </button>
              <p className="font-pixel text-[10px] uppercase text-os-primary">
                Camp fee
              </p>
              <p className="mt-1 pr-6 text-[15px] font-semibold tabular-nums">
                {words.short}
              </p>
              <p className="text-sm text-os-muted">
                {words.lead} {words.paid}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => state.setExpanded(true)}
                >
                  Show me how to pay
                </Button>
                <QuietButton onClick={state.remindTomorrow}>
                  Remind me tomorrow
                </QuietButton>
              </div>
            </div>
          )}
        </section>
      )}

      {!hidden && !covered && !sheetOpen && (
        <div
          data-pay-guide-banner
          className="absolute inset-x-0 bottom-0 z-40 flex items-center gap-2 border-t-2 border-os-primary bg-os-panel px-3 py-2 text-os-fg md:hidden"
        >
          <p className="min-w-0 flex-1 text-sm">
            <span className="block font-semibold tabular-nums">
              {words.short}
            </span>
            <span className="block text-xs text-os-muted">
              Your camp fee payment
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => state.setSheetOpen(true)}
          >
            How to pay
          </Button>
          <button
            type="button"
            onClick={state.remindTomorrow}
            aria-label="Remind me tomorrow"
            className="grid size-9 place-items-center text-os-muted hover:text-os-fg"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {sheetOpen && <PhoneGuideSheet state={state} />}
    </>
  );
}

function PhoneGuideSheet({ state }: { state: HostState }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => ref.current?.focus({ preventScroll: true }), []);
  const close = () => state.setSheetOpen(false);
  return (
    <div className="md:hidden">
      <div
        aria-hidden
        onClick={close}
        className="fixed inset-x-0 top-0 bottom-[var(--os-phone-bar,0px)] z-[84] bg-black/60"
      />
      <section
        ref={ref}
        role="region"
        aria-label="How to pay your camp fee"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !e.defaultPrevented) {
            e.stopPropagation();
            close();
          }
        }}
        className="os-window-in fixed inset-x-0 bottom-[var(--os-phone-bar,0px)] z-[85] max-h-[calc(100dvh-var(--os-phone-bar,0px)-3rem)] select-text overflow-y-auto overscroll-contain border-t-2 border-os-primary bg-os-panel text-os-fg shadow-[0_-8px_24px_rgb(0_0_0/0.6)] outline-none"
      >
        <div aria-hidden className="mx-auto mt-2 h-1 w-10 bg-os-line" />
        <GuideBody state={state} onClose={close} closeLabel="Close" />
      </section>
    </div>
  );
}

/** The open guide: the same on the desktop card and in the phone's sheet. */
function GuideBody({
  state,
  onClose,
  closeLabel,
}: {
  state: Pick<HostState, "data" | "words"> & {
    remindTomorrow?: () => void;
  };
  onClose?: () => void;
  closeLabel?: string;
}) {
  const { data, words } = state;
  return (
    <div className="relative flex flex-col p-4">
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="absolute right-2 top-2 p-1 text-os-muted hover:text-os-fg"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
      <PayGuideDetails
        data={data}
        words={words}
        onLeave={onClose}
        onRemindTomorrow={state.remindTomorrow}
      />
    </div>
  );
}

/** The guide's content, wherever it is drawn. */
export function PayGuideDetails({
  data,
  words,
  onLeave,
  onRemindTomorrow,
}: {
  data: PayGuideData;
  words: NextPaymentWords;
  /** Called when a link inside leaves for My dues. */
  onLeave?: () => void;
  onRemindTomorrow?: () => void;
}) {
  const fromId = useId();
  const [from, setFrom] = useState<"za" | "abroad">("za");
  const { southAfrica: za, abroad } = data.bank;
  const ref = data.refCode;
  const amount = formatMoney(words.amountCents);
  const zaRows = rows([
    ["Bank", za.bank],
    ["Account name", za.accountName],
    ["Account number", za.accountNumber],
    ["Branch code", za.branchCode],
  ]);
  const abroadRows = rows([
    ["SWIFT code", abroad.swift],
    ["Bank", abroad.bankAddress],
    ["Account name", za.accountName],
    ["Account number", abroad.accountNumber ?? za.accountNumber],
  ]);
  const shown = from === "za" ? zaRows : abroadRows;
  return (
    <div className="flex flex-col">
      <p className="font-pixel text-[10px] uppercase text-os-primary">
        Camp fee
      </p>
      <p className="mt-1 pr-6 text-[15px] font-semibold tabular-nums">
        {words.sentence}
      </p>
      <p className="text-sm text-os-muted">{words.paid}</p>
      <ProgressBar
        value={data.paidCents}
        max={Math.max(data.feeTotalCents, 1)}
        label="Paid of your camp fee"
        className="mt-2 h-2"
      />

      {ref && (
        <>
          <p className="mb-1 mt-4 font-pixel text-[10px] uppercase text-os-muted">
            Your payment reference
          </p>
          <CopyRef code={ref} />
          <p className="mt-1 text-xs text-os-muted">
            Put it on the payment so Finance knows it is you.
          </p>
        </>
      )}

      <p
        id={fromId}
        className="mb-1 mt-4 font-pixel text-[10px] uppercase text-os-muted"
      >
        How are you paying?
      </p>
      <div
        role="group"
        aria-labelledby={fromId}
        className="grid grid-cols-2 gap-1 border border-os-line p-1"
      >
        {(
          [
            ["za", "From South Africa"],
            ["abroad", "From abroad"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={from === value}
            onClick={() => setFrom(value)}
            className={`px-1 py-2 text-xs font-medium ${
              from === value
                ? "bg-os-primary text-os-bg"
                : "text-os-muted hover:text-os-fg"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {shown.length > 0 ? (
        <dl
          aria-label={
            from === "za"
              ? "Bank details from South Africa"
              : "Bank details from abroad"
          }
          className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 border border-os-line bg-os-bg p-3 text-xs"
        >
          {[...shown, ...(ref ? [["Reference", ref] as const] : [])].map(
            ([term, value]) => (
              <div key={term} className="contents">
                <dt className="text-os-muted">{term}</dt>
                <dd className="m-0 break-words font-medium tabular-nums">
                  {value}
                </dd>
              </div>
            ),
          )}
          <dt className="text-os-muted">Amount</dt>
          <dd className="m-0 font-medium tabular-nums">{amount}</dd>
        </dl>
      ) : (
        <p className="mt-2 text-sm text-os-muted">
          The Finance team hasn&rsquo;t put the bank details here yet. Ask them
          where to pay.
        </p>
      )}
      {from === "abroad" && (
        <>
          <p className="mt-2 text-xs text-os-muted">
            South Africa has no IBAN. If your bank asks for one, type the
            account number.
          </p>
          {abroad.note && (
            <p className="mt-2 border-l-2 border-os-primary pl-2 text-xs">
              {abroad.note}
            </p>
          )}
        </>
      )}

      <p className="mb-1 mt-4 font-pixel text-[10px] uppercase text-os-muted">
        Then
      </p>
      <ProofDialog
        today={campDayKey(new Date())}
        amountCents={words.amountCents}
        trigger={
          <Button type="button" className="w-full">
            <Upload aria-hidden />
            Send your proof of payment
          </Button>
        }
      />
      <p className="mt-1 text-xs text-os-muted">
        A photo or PDF of the bank&rsquo;s confirmation.
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Link
          href={MY_DUES_PATH}
          onClick={onLeave}
          className="text-sm font-medium text-os-primary underline-offset-4 hover:underline"
        >
          Open My dues
        </Link>
        {onRemindTomorrow && (
          <QuietButton onClick={onRemindTomorrow}>
            Remind me tomorrow
          </QuietButton>
        )}
      </div>
    </div>
  );
}

function rows(
  entries: readonly (readonly [string, string | null])[],
): (readonly [string, string])[] {
  return entries.filter((e): e is readonly [string, string] => !!e[1]);
}

function CopyRef({ code }: { code: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <div className="flex items-center justify-between gap-3 border border-l-4 border-os-line border-l-os-primary bg-os-bg px-3 py-2">
      <code className="font-mono text-lg font-semibold tracking-normal">
        {code}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={state === "copied" ? "Copied" : `Copy ${code}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(code);
            setState("copied");
          } catch {
            setState("failed");
          }
        }}
      >
        {state === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
        {state === "copied" ? "Copied" : "Copy"}
      </Button>
      {state === "failed" && (
        <span role="status" className="sr-only">
          Copy didn&rsquo;t work here. Type the reference instead.
        </span>
      )}
    </div>
  );
}

/**
 * My dues' "How to pay": opens the desktop's guide when it has one, else the
 * same guide in a dialog (the year is not collecting yet, or the page is drawn
 * outside the desktop).
 */
export function HowToPayButton({
  data,
  className,
}: {
  data: PayGuideData;
  className?: string;
}) {
  const host = useContext(HostContext);
  const [open, setOpen] = useState(false);
  const words = nextPaymentWords(data.next, {
    paidCents: data.paidCents,
    feeTotalCents: data.feeTotalCents,
  });
  if (!words) return null;
  return (
    <>
      <Button
        type="button"
        className={className}
        onClick={() => (host ? host.open() : setOpen(true))}
      >
        How to pay
      </Button>
      {!host && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:max-w-full max-sm:rounded-none max-sm:border-0">
            <DialogHeader>
              <DialogTitle>How to pay</DialogTitle>
            </DialogHeader>
            <PayGuideDetails
              data={data}
              words={words}
              onLeave={() => setOpen(false)}
            />
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/**
 * "Remind me tomorrow": a quiet line of text beside the one main button, as
 * the mock-up (step 4) draws it. The kit's ghost button wears the chrome's
 * pixel capitals in the skin, too wide to sit beside "Show me how to pay".
 */
function QuietButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-9 px-1 text-sm text-os-muted underline-offset-4 hover:text-os-fg hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  );
}
