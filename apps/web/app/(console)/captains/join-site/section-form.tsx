"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Alert } from "@camp404/ui/components/alert";
import { Button } from "@camp404/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@camp404/ui/components/card";
import { Input } from "@camp404/ui/components/input";
import { Label } from "@camp404/ui/components/label";
import { Switch } from "@camp404/ui/components/switch";
import { Textarea } from "@camp404/ui/components/textarea";
import { toast } from "@camp404/ui/components/toast";
import { saveJoinSectionAction } from "./actions";

// One join-site window's words as a form. Each section says which fields it
// has (./sections.ts); this draws them, keeps the draft, and saves the whole
// section at once. A problem with what was typed shows beside the section, as
// on every captain form; a save that worked says so in a toast.

type Json = Record<string, unknown>;

export type Column =
  | { key: string; label: string; kind: "text" | "area" }
  | { key: string; label: string; kind: "number" }
  | { key: string; label: string; kind: "check" }
  | { key: string; label: string; kind: "lines" }
  | { key: string; label: string; kind: "select"; options: readonly string[] };

export type Field =
  | { path: string; label: string; kind: "text" | "area"; help?: string }
  | { path: string; label: string; kind: "number"; help?: string }
  | { path: string; label: string; kind: "lines"; help?: string }
  | {
      path: string;
      label: string;
      kind: "rows";
      columns: Column[];
      blank: Json;
      help?: string;
    };

function get(obj: Json, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>((o, k) => (o as Json | undefined)?.[k], obj);
}

function set(obj: Json, path: string, value: unknown): Json {
  const [head, ...rest] = path.split(".") as [string, ...string[]];
  return {
    ...obj,
    [head]: rest.length
      ? set((obj[head] as Json) ?? {}, rest.join("."), value)
      : value,
  };
}

/** One line per item; blank lines dropped. */
const toLines = (text: string) =>
  text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function LinesInput({
  id,
  value,
  onChange,
  rows = 4,
}: {
  id: string;
  value: string[];
  onChange: (v: string[]) => void;
  rows?: number;
}) {
  // The draft text is kept as typed, so blank lines survive until save.
  const [text, setText] = useState(value.join("\n"));
  return (
    <Textarea
      id={id}
      rows={Math.max(rows, value.length + 1)}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toLines(e.target.value));
      }}
    />
  );
}

function RowsInput({
  id,
  rows,
  columns,
  blank,
  onChange,
}: {
  id: string;
  rows: Json[];
  columns: Column[];
  blank: Json;
  onChange: (rows: Json[]) => void;
}) {
  const update = (i: number, key: string, v: unknown) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, [key]: v } : r)));
  const move = (i: number, d: number) => {
    const next = [...rows];
    const [row] = next.splice(i, 1);
    next.splice(i + d, 0, row!);
    onChange(next);
  };
  return (
    <div className="flex flex-col gap-3">
      {rows.map((row, i) => (
        <fieldset
          key={i}
          className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-2"
        >
          <legend className="px-1 text-xs text-muted-foreground">
            {i + 1}
          </legend>
          {columns.map((c) => {
            const cid = `${id}-${i}-${c.key}`;
            const v = row[c.key];
            const wide = c.kind === "area" || c.kind === "lines";
            return (
              <div
                key={c.key}
                className={`flex flex-col gap-1 ${wide ? "sm:col-span-2" : ""}`}
              >
                {c.kind === "check" ? (
                  <label className="flex items-center gap-2 pt-5 text-sm">
                    <Switch
                      checked={Boolean(v)}
                      onCheckedChange={(on) =>
                        update(i, c.key, on || undefined)
                      }
                      aria-label={c.label}
                    />
                    {c.label}
                  </label>
                ) : (
                  <>
                    <Label htmlFor={cid}>{c.label}</Label>
                    {c.kind === "select" ? (
                      <select
                        id={cid}
                        value={String(v ?? "")}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      >
                        {c.options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    ) : c.kind === "lines" ? (
                      <LinesInput
                        id={cid}
                        value={(v as string[]) ?? []}
                        onChange={(lines) => update(i, c.key, lines)}
                        rows={3}
                      />
                    ) : c.kind === "area" ? (
                      <Textarea
                        id={cid}
                        rows={2}
                        value={String(v ?? "")}
                        onChange={(e) =>
                          update(i, c.key, e.target.value || undefined)
                        }
                      />
                    ) : (
                      <Input
                        id={cid}
                        type={c.kind === "number" ? "number" : "text"}
                        inputMode={c.kind === "number" ? "numeric" : undefined}
                        value={String(v ?? "")}
                        onChange={(e) =>
                          update(
                            i,
                            c.key,
                            c.kind === "number"
                              ? Number(e.target.value)
                              : e.target.value,
                          )
                        }
                      />
                    )}
                  </>
                )}
              </div>
            );
          })}
          <div className="flex gap-1 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={i === 0}
              onClick={() => move(i, -1)}
              aria-label={`Move ${i + 1} up`}
            >
              <ArrowUp aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={i === rows.length - 1}
              onClick={() => move(i, 1)}
              aria-label={`Move ${i + 1} down`}
            >
              <ArrowDown aria-hidden />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              aria-label={`Remove ${i + 1}`}
            >
              <Trash2 aria-hidden />
            </Button>
          </div>
        </fieldset>
      ))}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="self-start"
        onClick={() => onChange([...rows, structuredClone(blank)])}
      >
        <Plus aria-hidden /> Add
      </Button>
    </div>
  );
}

export function SectionForm({
  id,
  section,
  title,
  description,
  fields,
  initial,
  prepare,
}: {
  id: string;
  section: string;
  title: string;
  description: string;
  fields: Field[];
  initial: Json;
  /** Last touches before saving, e.g. deriving keys. */
  prepare?: (value: Json) => Json;
}) {
  const router = useRouter();
  const [value, setValue] = useState<Json>(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await saveJoinSectionAction(
        section,
        prepare ? prepare(value) : value,
      );
      if (res.ok) {
        toast.success(`${title} saved. The site shows it within a minute.`);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card id={id} className="scroll-mt-24">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          onSubmit={save}
          aria-label={title}
          className="flex flex-col gap-4"
        >
          {fields.map((f) => {
            const fid = `${id}-${f.path.replace(/\./g, "-")}`;
            const v = get(value, f.path);
            return (
              <div key={f.path} className="flex flex-col gap-1.5">
                <Label htmlFor={f.kind === "rows" ? undefined : fid}>
                  {f.label}
                </Label>
                {f.kind === "rows" ? (
                  <RowsInput
                    id={fid}
                    rows={(v as Json[]) ?? []}
                    columns={f.columns}
                    blank={f.blank}
                    onChange={(rows) => setValue((o) => set(o, f.path, rows))}
                  />
                ) : f.kind === "lines" ? (
                  <LinesInput
                    id={fid}
                    value={(v as string[]) ?? []}
                    onChange={(lines) => setValue((o) => set(o, f.path, lines))}
                  />
                ) : f.kind === "area" ? (
                  <Textarea
                    id={fid}
                    rows={3}
                    value={String(v ?? "")}
                    onChange={(e) =>
                      setValue((o) => set(o, f.path, e.target.value))
                    }
                  />
                ) : (
                  <Input
                    id={fid}
                    type={f.kind === "number" ? "number" : "text"}
                    inputMode={f.kind === "number" ? "decimal" : undefined}
                    value={String(v ?? "")}
                    onChange={(e) =>
                      setValue((o) =>
                        set(
                          o,
                          f.path,
                          f.kind === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                        ),
                      )
                    }
                  />
                )}
                {f.help && (
                  <p className="text-xs text-muted-foreground">{f.help}</p>
                )}
              </div>
            );
          })}

          {error && (
            <Alert variant="error">
              <TriangleAlert />
              <span>{error}</span>
            </Alert>
          )}
          <div className="flex justify-end border-t border-border pt-4">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />}
              {pending ? "Saving…" : `Save ${title.toLowerCase()}`}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
