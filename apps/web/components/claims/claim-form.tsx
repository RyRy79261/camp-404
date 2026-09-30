"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send } from "lucide-react";
import { parseMoneyToMinor } from "@camp404/core";
import {
  CLAIM_ACCOUNT_MAX,
  CLAIM_DESCRIPTION_MAX,
  CLAIM_MAX_FILES,
  type ClaimAccountType,
} from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { DateControl } from "@camp404/ui/components/date-control";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { BANK_DETAILS_AUDIENCE } from "@/lib/claims-copy";
import { ACCOUNT_TYPE_LABELS } from "@/lib/claims-view";
import { PROOF_MAX_BYTES } from "@/lib/dues-copy";

// A member's claim for money they spent for a team (#242): the team, what
// they bought, the amount, the day, one or more receipts and the bank account
// to pay them back into. It goes to /api/uploads/claim in one request, which
// checks the files and refuses a claim with none. Problems with what they
// typed show beside the form.

const TYPE_AMOUNT = "Type the amount in rands, like 450 or 450,50.";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50";

export function ClaimForm({
  teams,
  defaultTeam,
  today,
}: {
  teams: { key: string; label: string }[];
  defaultTeam: string | null;
  today: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [team, setTeam] = useState(defaultTeam ?? "");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(today);
  const [files, setFiles] = useState<File[]>([]);
  const [accountType, setAccountType] = useState<ClaimAccountType>("sa");
  const [account, setAccount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    if (!team) return setError("Pick the team it was for.");
    if (!description.trim()) return setError("Say what you bought.");
    const cents = parseMoneyToMinor(amount);
    if (cents === null || cents <= 0) return setError(TYPE_AMOUNT);
    if (!spentOn) return setError("Pick the day you bought it.");
    if (files.length === 0) {
      return setError("Add at least one receipt: a photo or a PDF.");
    }
    if (files.length > CLAIM_MAX_FILES) {
      return setError(`Add at most ${CLAIM_MAX_FILES} files to one claim.`);
    }
    if (files.reduce((sum, f) => sum + f.size, 0) > PROOF_MAX_BYTES) {
      return setError(
        "The receipts come to over 4 MB. Send smaller photos or PDFs.",
      );
    }
    if (!account.trim()) {
      return setError("Add the bank account to pay you back into.");
    }
    const form = new FormData();
    form.set("team", team);
    form.set("description", description);
    form.set("amountCents", String(cents));
    form.set("spentOn", spentOn);
    form.set("accountType", accountType);
    form.set("accountDetails", account);
    for (const file of files) form.append("receipt", file);
    start(async () => {
      let res: Response;
      try {
        res = await fetch("/api/uploads/claim", { method: "POST", body: form });
      } catch {
        setError("That didn't send. Check your connection and try again.");
        return;
      }
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(body.error ?? "That didn't send. Try again.");
        return;
      }
      toast.success("Claim sent. The team's lead will look at it.");
      setDescription("");
      setAmount("");
      setAccount("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-team">Team</Label>
        <select
          id="claim-team"
          className={selectClass}
          value={team}
          onChange={(e) => setTeam(e.target.value)}
          disabled={pending}
        >
          <option value="" disabled>
            Pick the team it was for
          </option>
          {teams.map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-what">What you bought</Label>
        <Textarea
          id="claim-what"
          rows={2}
          maxLength={CLAIM_DESCRIPTION_MAX}
          value={description}
          onChange={(e) => setDescription(e.currentTarget.value)}
          disabled={pending}
          placeholder="Two gas bottle refills, for example"
        />
      </div>
      <InputField
        label="Amount (R)"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.currentTarget.value)}
        disabled={pending}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-day">Day you bought it</Label>
        <DateControl
          id="claim-day"
          value={spentOn}
          max={today}
          onChange={(e) => setSpentOn(e.currentTarget.value)}
          disabled={pending}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-receipts">Receipts</Label>
        <input
          ref={fileRef}
          id="claim-receipts"
          type="file"
          multiple
          accept="application/pdf,image/jpeg,image/png,image/webp"
          className="text-sm file:mr-3 file:rounded-md file:border file:border-border file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-secondary-foreground"
          onChange={(e) => setFiles(Array.from(e.currentTarget.files ?? []))}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          At least one: PDFs or photos, up to {CLAIM_MAX_FILES} files and 4 MB
          in all. Only you and the Finance team can open them.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-bank">Your bank</Label>
        <select
          id="claim-bank"
          className={selectClass}
          value={accountType}
          onChange={(e) => setAccountType(e.target.value as ClaimAccountType)}
          disabled={pending}
        >
          {(Object.keys(ACCOUNT_TYPE_LABELS) as ClaimAccountType[]).map(
            (key) => (
              <option key={key} value={key}>
                {ACCOUNT_TYPE_LABELS[key]}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="claim-account">Bank details</Label>
        <Textarea
          id="claim-account"
          rows={3}
          maxLength={CLAIM_ACCOUNT_MAX}
          value={account}
          onChange={(e) => setAccount(e.currentTarget.value)}
          disabled={pending}
          placeholder={
            accountType === "sa"
              ? "Account holder, bank, account number and branch code"
              : "Account holder, bank, IBAN or account number, and SWIFT code"
          }
        />
        <p className="text-xs text-muted-foreground">{BANK_DETAILS_AUDIENCE}</p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="button" disabled={pending} onClick={send}>
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden />
        ) : (
          <Send aria-hidden />
        )}
        Send my claim
      </Button>
    </div>
  );
}
