"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { AbroadWay, CampBankDetails } from "@camp404/types";
import { Button } from "@camp404/ui/components/button";
import { Checkbox } from "@camp404/ui/components/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { InputField } from "@camp404/ui/components/input-field";
import { Label } from "@camp404/ui/components/label";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { saveCampBankDetailsAction } from "../camp-money-actions";

// Where members pay the camp (camp fees sprint, 2026-10-27): an account in
// South Africa, and what someone paying from abroad needs. Every member who
// owes reads them on the pay guide and My dues. The Finance team types the
// real values (nothing is seeded); a save is a compare-and-set on the version
// read, audited. A typing problem shows beside the form.

type AbroadText = Exclude<keyof CampBankDetails["abroad"], "ways" | "iban">;

type Fields = {
  southAfrica: { [F in keyof CampBankDetails["southAfrica"]]: string };
  abroad: { [F in AbroadText]: string } & {
    ways: CampBankDetails["abroad"]["ways"];
    iban: { [F in keyof CampBankDetails["abroad"]["iban"]]: string };
  };
};

function toFields(d: CampBankDetails): Fields {
  return {
    southAfrica: {
      bank: d.southAfrica.bank ?? "",
      accountName: d.southAfrica.accountName ?? "",
      accountNumber: d.southAfrica.accountNumber ?? "",
      branchCode: d.southAfrica.branchCode ?? "",
    },
    abroad: {
      ways: { ...d.abroad.ways },
      payLink: d.abroad.payLink ?? "",
      swift: d.abroad.swift ?? "",
      accountNumber: d.abroad.accountNumber ?? "",
      bankAddress: d.abroad.bankAddress ?? "",
      iban: {
        accountName: d.abroad.iban.accountName ?? "",
        iban: d.abroad.iban.iban ?? "",
        bic: d.abroad.iban.bic ?? "",
        bank: d.abroad.iban.bank ?? "",
      },
      note: d.abroad.note ?? "",
    },
  };
}

/** What Finance ticks: each way's words on the form. */
const WAY_TICKS: { way: AbroadWay; label: string }[] = [
  { way: "payLink", label: "Pay link (Wise, PayPal, Revolut)" },
  {
    way: "swift",
    label: "Bank transfer to the South African account (SWIFT)",
  },
  { way: "iban", label: "IBAN account" },
];

export function BankDetailsForm({
  details,
  version,
}: {
  details: CampBankDetails;
  version: number;
}) {
  const router = useRouter();
  const [fields, setFields] = useState(() => toFields(details));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const sa = (key: keyof Fields["southAfrica"], value: string) =>
    setFields((f) => ({
      ...f,
      southAfrica: { ...f.southAfrica, [key]: value },
    }));
  const abroad = (key: AbroadText, value: string) =>
    setFields((f) => ({ ...f, abroad: { ...f.abroad, [key]: value } }));
  const iban = (key: keyof Fields["abroad"]["iban"], value: string) =>
    setFields((f) => ({
      ...f,
      abroad: { ...f.abroad, iban: { ...f.abroad.iban, [key]: value } },
    }));
  const tick = (way: AbroadWay, on: boolean) =>
    setFields((f) => ({
      ...f,
      abroad: { ...f.abroad, ways: { ...f.abroad.ways, [way]: on } },
    }));
  const ways = fields.abroad.ways;

  function save() {
    setError(null);
    start(async () => {
      const res = await saveCampBankDetailsAction({
        details: fields,
        expectedVersion: version,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Bank details saved");
      router.refresh();
    });
  }

  const field = {
    disabled: pending,
    emoji: false,
    maxLength: 120,
  } as const;

  return (
    <Card>
      <CardHeader className="p-5 pb-3">
        <CardTitle className="text-base">Where members pay</CardTitle>
        <CardDescription>
          The camp&rsquo;s bank account. Every member who owes sees it on My
          dues and the pay guide.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5 p-5 pt-0">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">
            From South Africa
          </legend>
          <div className="grid gap-3 page-sm:grid-cols-2">
            <InputField
              label="Bank"
              value={fields.southAfrica.bank}
              onChange={(e) => sa("bank", e.currentTarget.value)}
              {...field}
            />
            <InputField
              label="Account name"
              value={fields.southAfrica.accountName}
              onChange={(e) => sa("accountName", e.currentTarget.value)}
              {...field}
            />
            <InputField
              label="Account number"
              inputMode="numeric"
              value={fields.southAfrica.accountNumber}
              onChange={(e) => sa("accountNumber", e.currentTarget.value)}
              {...field}
            />
            <InputField
              label="Branch code"
              inputMode="numeric"
              value={fields.southAfrica.branchCode}
              onChange={(e) => sa("branchCode", e.currentTarget.value)}
              {...field}
            />
          </div>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">From abroad</legend>
          <div
            role="group"
            aria-labelledby="abroad-ways-label"
            className="flex flex-col gap-2"
          >
            <p
              id="abroad-ways-label"
              className="text-xs font-medium text-muted-foreground"
            >
              Ways members abroad can pay
            </p>
            {WAY_TICKS.map(({ way, label }) => (
              <div key={way} className="flex items-center gap-2">
                <Checkbox
                  id={`abroad-way-${way}`}
                  checked={ways[way]}
                  disabled={pending}
                  onCheckedChange={(v) => tick(way, v === true)}
                />
                {/* A plain label: the kit's Label wears the chrome's pixel
                    capitals, and these are choices in a sentence. */}
                <label
                  htmlFor={`abroad-way-${way}`}
                  className="cursor-pointer text-sm"
                >
                  {label}
                </label>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Members see only the ways you tick.
            </p>
          </div>
          {ways.payLink && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Pay link</p>
              <InputField
                label="Link"
                type="url"
                helper="Must start with https://."
                value={fields.abroad.payLink}
                onChange={(e) => abroad("payLink", e.currentTarget.value)}
                {...field}
                maxLength={500}
              />
            </div>
          )}
          {ways.swift && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">Bank transfer (SWIFT)</p>
              <div className="grid gap-3 page-sm:grid-cols-2">
                <InputField
                  label="SWIFT code"
                  value={fields.abroad.swift}
                  onChange={(e) => abroad("swift", e.currentTarget.value)}
                  {...field}
                />
                <InputField
                  label="Account number from abroad"
                  helper="Leave it empty to use the South African one."
                  value={fields.abroad.accountNumber}
                  onChange={(e) =>
                    abroad("accountNumber", e.currentTarget.value)
                  }
                  {...field}
                />
              </div>
              <InputField
                label="Bank address"
                value={fields.abroad.bankAddress}
                onChange={(e) => abroad("bankAddress", e.currentTarget.value)}
                {...field}
              />
            </div>
          )}
          {ways.iban && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold">IBAN account</p>
              <div className="grid gap-3 page-sm:grid-cols-2">
                <InputField
                  label="IBAN account name"
                  value={fields.abroad.iban.accountName}
                  onChange={(e) => iban("accountName", e.currentTarget.value)}
                  {...field}
                />
                <InputField
                  label="IBAN"
                  value={fields.abroad.iban.iban}
                  onChange={(e) => iban("iban", e.currentTarget.value)}
                  {...field}
                />
                <InputField
                  label="BIC / SWIFT"
                  value={fields.abroad.iban.bic}
                  onChange={(e) => iban("bic", e.currentTarget.value)}
                  {...field}
                />
                <InputField
                  label="IBAN bank"
                  value={fields.abroad.iban.bank}
                  onChange={(e) => iban("bank", e.currentTarget.value)}
                  {...field}
                />
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bank-transfer-note">Note on transfer fees</Label>
            <Textarea
              id="bank-transfer-note"
              rows={3}
              maxLength={500}
              emoji={false}
              value={fields.abroad.note}
              onChange={(e) => abroad("note", e.currentTarget.value)}
              disabled={pending}
            />
            <p className="text-xs text-muted-foreground">
              For example, who pays the bank&rsquo;s fees on a transfer from
              abroad.
            </p>
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          className="self-start"
          disabled={pending}
          onClick={save}
        >
          {pending && <Loader2 className="animate-spin" aria-hidden />}
          Save bank details
        </Button>
      </CardContent>
    </Card>
  );
}
