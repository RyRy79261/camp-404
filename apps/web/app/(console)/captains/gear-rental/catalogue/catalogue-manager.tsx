"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  formatMoney,
  parseMoneyToMinor,
  RENTAL_SOURCE_LABELS,
} from "@camp404/core";
import type { RentalItem } from "@camp404/db/rental";
import {
  RENTAL_MAX_ITEMS,
  RENTAL_MAX_SLEEPS,
  type RentalSource,
} from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { AckRow } from "@camp404/ui/components/checkbox";
import { useConfirm } from "@camp404/ui/components/confirm-dialog";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { toast } from "@camp404/ui/components/toast";
import { typedRands } from "@/lib/dues-view";
import { sleepsText } from "@/lib/rental-view";
import {
  addRentalItemAction,
  archiveRentalItemAction,
  editRentalItemAction,
} from "../actions";

// The year's rental catalogue (#241). A typing problem shows beside the form;
// removing an item is a one-tap row action with a toast on failure.

const TYPE_PRICE = "Type the price in rands, like 450 or 450,50.";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

interface Draft {
  name: string;
  isTent: boolean;
  sleeps: string;
  supplierPrice: string;
  campHas: boolean;
  campPrice: string;
  campCount: string;
  reserveCount: string;
  reserveSource: RentalSource;
}

const BLANK: Draft = {
  name: "",
  isTent: false,
  sleeps: "2",
  supplierPrice: "",
  campHas: false,
  campPrice: "",
  campCount: "",
  reserveCount: "0",
  reserveSource: "supplier",
};

function draftOf(item: RentalItem): Draft {
  return {
    name: item.name,
    isTent: item.isTent,
    sleeps: String(item.isTent ? item.sleeps : 2),
    supplierPrice:
      item.supplierPriceCents === null
        ? ""
        : typedRands(item.supplierPriceCents),
    campHas: item.campStockCount !== null,
    campPrice:
      item.campPriceCents === null ? "" : typedRands(item.campPriceCents),
    campCount: item.campStockCount === null ? "" : String(item.campStockCount),
    reserveCount: String(item.reserveCount),
    reserveSource: item.reserveSource,
  };
}

/** A blank price is "none"; anything else must read as rands. */
function price(text: string): number | null | "bad" {
  if (text.trim() === "") return null;
  const cents = parseMoneyToMinor(text);
  return cents === null || cents < 0 ? "bad" : cents;
}

export function CatalogueManager({ items }: { items: RentalItem[] }) {
  const router = useRouter();
  const [confirm, confirmDialog] = useConfirm();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [removing, setRemoving] = useState<string | null>(null);
  const [removePending, startRemove] = useTransition();
  const busy = pending || removePending;
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  function startEdit(item: RentalItem | null) {
    setEditing(item?.id ?? null);
    setDraft(item ? draftOf(item) : BLANK);
    setError(null);
  }

  function save() {
    setError(null);
    const supplierPriceCents = price(draft.supplierPrice);
    const campPriceCents = draft.campHas ? price(draft.campPrice) : null;
    if (supplierPriceCents === "bad" || campPriceCents === "bad") {
      setError(TYPE_PRICE);
      return;
    }
    if (draft.campHas && campPriceCents === null) {
      setError("Give the camp stock a price.");
      return;
    }
    const item = {
      name: draft.name,
      isTent: draft.isTent,
      sleeps: draft.isTent ? Number(draft.sleeps) : 1,
      supplierPriceCents,
      campPriceCents,
      campStockCount: draft.campHas ? Number(draft.campCount) : null,
      reserveCount: Number(draft.reserveCount || "0"),
      reserveSource: draft.reserveSource,
    };
    start(async () => {
      const res = editing
        ? await editRentalItemAction({ itemId: editing, item })
        : await addRentalItemAction(item);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success(editing ? "Item saved" : "Item added");
      startEdit(null);
      router.refresh();
    });
  }

  async function remove(item: RentalItem) {
    const sure = await confirm({
      title: `Remove "${item.name}"?`,
      description:
        "Members can no longer ask for it. Orders that already have it keep it.",
      confirmLabel: "Remove item",
      destructive: true,
    });
    if (!sure) return;
    setRemoving(item.id);
    startRemove(async () => {
      const res = await archiveRentalItemAction({ itemId: item.id });
      if (!res.ok) toast.error(res.error);
      if (editing === item.id) startEdit(null);
      router.refresh();
    });
  }

  const full = !editing && items.length >= RENTAL_MAX_ITEMS;

  return (
    <div className="grid items-start gap-6 page-lg:grid-cols-2">
      {confirmDialog}
      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">This year&rsquo;s items</CardTitle>
          <CardDescription>
            Tents first. An item the camp has none of comes from the supplier
            only.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-5 pt-0">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items yet. Members can order once there is at least one.
            </p>
          ) : (
            <ul aria-label="Rental items" className="divide-y divide-border">
              {items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between gap-3 py-3"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {item.name}
                      {item.isTent && (
                        <Badge variant="outline">
                          {sleepsText(item.sleeps)}
                        </Badge>
                      )}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.supplierPriceCents === null
                        ? "Not from the supplier"
                        : `Supplier ${formatMoney(item.supplierPriceCents)}`}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {item.campStockCount === null ||
                      item.campPriceCents === null
                        ? "No camp stock"
                        : `Camp stock ${formatMoney(item.campPriceCents)}, the camp has ${item.campStockCount}`}
                    </span>
                    {item.reserveCount > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {item.reserveCount} reserved for on site, from{" "}
                        {RENTAL_SOURCE_LABELS[item.reserveSource].toLowerCase()}
                      </span>
                    )}
                  </span>
                  <span className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Change ${item.name}`}
                      disabled={busy}
                      onClick={() => startEdit(item)}
                    >
                      <Pencil aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Remove ${item.name}`}
                      disabled={busy}
                      onClick={() => void remove(item)}
                    >
                      {removePending && removing === item.id ? (
                        <Loader2 className="animate-spin" aria-hidden />
                      ) : (
                        <Trash2 aria-hidden />
                      )}
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-5 pb-3">
          <CardTitle className="text-base">
            {editing ? "Change the item" : "Add an item"}
          </CardTitle>
          <CardDescription>
            Prices are in rands, for one item for the whole Burn.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 p-5 pt-0">
          <InputField
            label="Name"
            value={draft.name}
            maxLength={60}
            placeholder="2-person tent"
            disabled={busy}
            onChange={(e) => set({ name: e.currentTarget.value })}
          />
          <AckRow
            checked={draft.isTent}
            disabled={busy}
            onCheckedChange={(v) => set({ isTent: v === true })}
          >
            It&rsquo;s a tent
            <span className="block text-xs text-muted-foreground">
              A tent gets a label, and members say who shares it.
            </span>
          </AckRow>
          {draft.isTent && (
            <InputField
              label="Sleeps"
              type="number"
              inputMode="numeric"
              min={1}
              max={RENTAL_MAX_SLEEPS}
              value={draft.sleeps}
              disabled={busy}
              onChange={(e) => set({ sleeps: e.currentTarget.value })}
            />
          )}
          <InputField
            label="Supplier price (R)"
            inputMode="decimal"
            value={draft.supplierPrice}
            helper="Leave blank if the supplier doesn't rent it."
            disabled={busy}
            onChange={(e) => set({ supplierPrice: e.currentTarget.value })}
          />
          <AckRow
            checked={draft.campHas}
            disabled={busy}
            onCheckedChange={(v) =>
              set({
                campHas: v === true,
                ...(v === true ? {} : { reserveSource: "supplier" as const }),
              })
            }
          >
            The camp has some of these
            <span className="block text-xs text-muted-foreground">
              Only for gear the camp owns and rents out, like its tents.
            </span>
          </AckRow>
          {draft.campHas && (
            <div className="grid gap-4 page-sm:grid-cols-2">
              <InputField
                label="Camp stock price (R)"
                inputMode="decimal"
                value={draft.campPrice}
                disabled={busy}
                onChange={(e) => set({ campPrice: e.currentTarget.value })}
              />
              <InputField
                label="How many the camp has"
                type="number"
                inputMode="numeric"
                min={1}
                value={draft.campCount}
                disabled={busy}
                onChange={(e) => set({ campCount: e.currentTarget.value })}
              />
            </div>
          )}
          <div className="grid gap-4 page-sm:grid-cols-2">
            <InputField
              label="Reserved for on site"
              type="number"
              inputMode="numeric"
              min={0}
              value={draft.reserveCount}
              helper="Spare ones kept back for the site: adoptees and late arrivals."
              disabled={busy}
              onChange={(e) => set({ reserveCount: e.currentTarget.value })}
            />
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reserve-source">Reserve comes from</Label>
              <select
                id="reserve-source"
                className={selectClass}
                disabled={busy}
                value={draft.reserveSource}
                onChange={(e) =>
                  set({ reserveSource: e.target.value as RentalSource })
                }
              >
                <option value="supplier">The supplier</option>
                {draft.campHas && <option value="camp">Camp stock</option>}
              </select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {full && (
            <p className="text-sm text-muted-foreground">
              A year has at most {RENTAL_MAX_ITEMS} items. Remove one to add
              another.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy || full} onClick={save}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                !editing && <Plus aria-hidden />
              )}
              {editing ? "Save item" : "Add item"}
            </Button>
            {editing && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => startEdit(null)}
              >
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
