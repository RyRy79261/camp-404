"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Upload } from "lucide-react";
import { useWindowDirty } from "@camp404/os";
import {
  PET_KIND_OTHER_MAX,
  PET_KINDS,
  PET_NAME_MAX,
  PET_THING_MAX,
  PetInput,
  type PetKind,
} from "@camp404/types";
import { PET_KIND_LABEL } from "@camp404/core";
import { Button } from "@camp404/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@camp404/ui/components/dialog";
import { Field } from "@camp404/ui/components/field";
import { Input } from "@camp404/ui/components/input";
import { toast } from "@camp404/ui/components/toast";
import { cn } from "@camp404/ui/lib/utils";
import { PhotoCropDialog } from "@/components/profile/photo-crop-dialog";
import { cropResizeToSquare } from "@/lib/image";
import type { SquareCrop } from "@/lib/photo-crop";
import {
  PET_NEEDS_FRONT,
  PET_NEEDS_SIDE,
  PET_PHOTO_EDGE,
  PET_SENT,
} from "@/lib/pets-copy";

// "Add your pet" (Camp pets, the owner's approved option A, 2026-10-09): a
// dialog on a desktop, the whole screen on a phone. Name, what it is (Cat,
// Dog or Something else, with their own word for it), a photo from the front
// and one from the side, and one stupid thing about them. Every field is
// needed; Send with gaps says what each needs, beside it. Each photo slot
// opens the profile photo's crop step with a square frame, and the square is
// cut and shrunk in the browser before it is sent (lib/image.ts), which also
// drops the camera's EXIF. The photos are only for the founders: the form
// says who sees them. Never say what happens to a pet after it is sent.

type Side = "front" | "side";
type Errors = Partial<
  Record<"name" | "kind" | "kindOther" | "stupidThing" | Side, string>
>;

interface Photo {
  blob: Blob;
  url: string;
}

const SLOT_HELP: Record<Side, string> = {
  front: "Their face, looking at you",
  side: "The whole of them, side on",
};

const CROP_WORDS: Record<Side, string> = {
  front: "their face",
  side: "all of them",
};

function PhotoSlot({
  side,
  photo,
  error,
  onPick,
}: {
  side: Side;
  photo: Photo | null;
  error?: string;
  onPick: (file: File) => void;
}) {
  const input = React.useRef<HTMLInputElement>(null);
  const label = side === "front" ? "Front" : "Side";
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        data-testid={`pet-photo-${side}`}
        aria-label={
          photo ? `Change the ${side} photo` : `Add a photo from the ${side}`
        }
        aria-invalid={error ? true : undefined}
        onClick={() => input.current?.click()}
        className={cn(
          "relative flex h-36 w-full flex-col items-center justify-center gap-1 overflow-hidden border bg-muted/40 px-3 text-center text-xs leading-4 text-muted-foreground transition-colors hover:border-primary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none page-sm:h-40",
          photo ? "border-solid p-0" : "border-dashed",
          error ? "border-destructive" : "border-border",
        )}
      >
        {photo ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- a local preview of the member's own cropped photo */}
            <img
              src={photo.url}
              alt=""
              className="absolute inset-0 size-full object-cover"
            />
            <span className="absolute bottom-2 left-2 bg-black/70 px-1.5 text-[11px] leading-4 font-semibold text-white">
              {label}
            </span>
            <span className="absolute right-2 bottom-2 bg-black/70 px-1.5 text-[11px] leading-4 font-semibold text-white underline underline-offset-2">
              Change
            </span>
          </>
        ) : (
          <>
            <Upload aria-hidden className="mb-1 size-5" />
            <b className="text-sm leading-5 font-semibold text-foreground">
              {label}
            </b>
            <span>{SLOT_HELP[side]}</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        data-testid={`pet-photo-${side}-input`}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
      {error && (
        <p className="text-xs leading-4 font-semibold text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function AddPetButton() {
  const router = useRouter();
  const uid = React.useId();
  const id = (name: string) => `${uid}-${name}`;
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [kind, setKind] = React.useState<PetKind | "">("");
  const [kindOther, setKindOther] = React.useState("");
  const [thing, setThing] = React.useState("");
  const [photos, setPhotos] = React.useState<Record<Side, Photo | null>>({
    front: null,
    side: null,
  });
  const [cropping, setCropping] = React.useState<{
    side: Side;
    file: File;
  } | null>(null);
  const [errors, setErrors] = React.useState<Errors>({});
  const [serverError, setServerError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const pickAgain = React.useRef<HTMLInputElement>(null);

  const dirty =
    open &&
    (name !== "" ||
      kind !== "" ||
      thing !== "" ||
      photos.front !== null ||
      photos.side !== null);
  useWindowDirty(dirty, "Your pet isn't sent yet. Leave it?");

  // Each preview is an object URL: let it go with the photo.
  const urls = React.useRef<string[]>([]);
  React.useEffect(() => {
    const held = urls.current;
    return () => held.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  function reset() {
    setName("");
    setKind("");
    setKindOther("");
    setThing("");
    setPhotos({ front: null, side: null });
    setErrors({});
    setServerError(null);
  }

  function clearError(key: keyof Errors) {
    setErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  async function savePhoto(side: Side, file: File, crop: SquareCrop) {
    setCropping(null);
    try {
      const blob = await cropResizeToSquare(file, crop, {
        size: PET_PHOTO_EDGE,
        quality: 0.85,
      });
      const url = URL.createObjectURL(blob);
      urls.current.push(url);
      setPhotos((p) => ({ ...p, [side]: { blob, url } }));
      clearError(side);
    } catch {
      setErrors((e) => ({
        ...e,
        [side]: "This photo can't be opened. Try another one.",
      }));
    }
  }

  function validate(): Errors {
    const next: Errors = {};
    const parsed = PetInput.safeParse({
      name,
      kind,
      kindOther,
      stupidThing: thing,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "") as keyof Errors;
        next[key] ??= issue.message;
      }
    }
    if (!photos.front) next.front = PET_NEEDS_FRONT;
    if (!photos.side) next.side = PET_NEEDS_SIDE;
    return next;
  }

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setServerError(null);
    if (Object.keys(found).length > 0) return;
    const body = new FormData();
    body.set("name", name);
    body.set("kind", kind);
    body.set("kindOther", kindOther);
    body.set("stupidThing", thing);
    body.set("front", photos.front!.blob, "front.webp");
    body.set("side", photos.side!.blob, "side.webp");
    setPending(true);
    try {
      const res = await fetch("/api/uploads/pet", { method: "POST", body });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        field?: string;
      };
      if (!res.ok) {
        const field = json.field as keyof Errors | undefined;
        const message = json.error ?? "That didn't send. Try again.";
        if (
          field &&
          [
            "name",
            "kind",
            "kindOther",
            "stupidThing",
            "front",
            "side",
          ].includes(field)
        ) {
          setErrors((e) => ({ ...e, [field]: message }));
        } else {
          setServerError(message);
        }
        return;
      }
      toast.success(PET_SENT);
      reset();
      setOpen(false);
      router.refresh();
    } catch {
      setServerError("That didn't send. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Add your pet
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent
          data-window-tint
          className={cn(
            "flex max-h-[90vh] flex-col gap-4 overflow-y-auto sm:max-w-[520px]",
            // A phone gets the whole screen, the buttons at the bottom.
            "max-sm:inset-0 max-sm:h-dvh max-sm:max-h-none max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:p-4",
          )}
        >
          <DialogHeader>
            <DialogTitle>Add your pet</DialogTitle>
            <DialogDescription>
              A cat, a dog, or whatever you call a pet. We&apos;ll take it from
              here.
            </DialogDescription>
          </DialogHeader>

          <form
            noValidate
            onSubmit={send}
            className="flex flex-1 flex-col gap-5"
            aria-label="Add your pet"
          >
            <Field
              label="Name"
              htmlFor={id("name")}
              required
              error={errors.name}
            >
              <Input
                id={id("name")}
                value={name}
                maxLength={PET_NAME_MAX}
                autoComplete="off"
                aria-invalid={errors.name ? true : undefined}
                onChange={(e) => {
                  setName(e.target.value);
                  if (e.target.value.trim()) clearError("name");
                }}
              />
            </Field>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">What is it?</legend>
              <div
                role="radiogroup"
                aria-label="What is it?"
                aria-invalid={errors.kind ? true : undefined}
                className={cn(
                  "grid grid-cols-3 border",
                  errors.kind ? "border-destructive" : "border-border",
                )}
              >
                {PET_KINDS.map((k, i) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={kind === k}
                    onClick={() => {
                      setKind(k);
                      clearError("kind");
                      if (k !== "other") clearError("kindOther");
                    }}
                    className={cn(
                      "h-10 px-1 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      i > 0 && "border-l border-border",
                      kind === k
                        ? "bg-primary/15 text-foreground shadow-[inset_0_-2px_0_var(--color-primary)]"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {PET_KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              {kind === "other" && (
                <Input
                  value={kindOther}
                  maxLength={PET_KIND_OTHER_MAX}
                  autoComplete="off"
                  aria-label="What kind of pet?"
                  placeholder="A tortoise, a goldfish, a sourdough starter"
                  aria-invalid={errors.kindOther ? true : undefined}
                  onChange={(e) => {
                    setKindOther(e.target.value);
                    if (e.target.value.trim()) clearError("kindOther");
                  }}
                />
              )}
              {(errors.kind || errors.kindOther) && (
                <p className="text-xs leading-4 font-semibold text-destructive">
                  {errors.kind ?? errors.kindOther}
                </p>
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">Photos</legend>
              <div className="grid grid-cols-2 gap-3">
                {(["front", "side"] as const).map((side) => (
                  <PhotoSlot
                    key={side}
                    side={side}
                    photo={photos[side]}
                    error={errors[side]}
                    onPick={(file) => setCropping({ side, file })}
                  />
                ))}
              </div>
              <p className="text-xs leading-4 text-muted-foreground">
                Only you and the camp&apos;s founders ever see them.
              </p>
            </fieldset>

            <Field
              label="One stupid thing about them"
              htmlFor={id("thing")}
              required
              help={`One line. ${thing.length} / ${PET_THING_MAX}`}
              error={errors.stupidThing}
            >
              <Input
                id={id("thing")}
                value={thing}
                maxLength={PET_THING_MAX}
                autoComplete="off"
                placeholder="Barks at the kettle. Every time."
                aria-invalid={errors.stupidThing ? true : undefined}
                onChange={(e) => {
                  setThing(e.target.value);
                  if (e.target.value.trim()) clearError("stupidThing");
                }}
              />
            </Field>

            {serverError && (
              <p
                role="alert"
                className="text-sm font-semibold text-destructive"
              >
                {serverError}
              </p>
            )}

            <DialogFooter className="mt-auto max-sm:flex-col-reverse max-sm:gap-2 max-sm:[&>button]:h-12 max-sm:[&>button]:w-full">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Sending…" : "Send"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <input
        ref={pickAgain}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file && cropping) setCropping({ side: cropping.side, file });
        }}
      />
      {cropping && (
        <PhotoCropDialog
          file={cropping.file}
          onSave={(crop) => void savePhoto(cropping.side, cropping.file, crop)}
          onCancel={() => setCropping(null)}
          onPickAnother={() => pickAgain.current?.click()}
          copy={{
            title: `Fit the ${cropping.side} photo`,
            description: `Drag the photo to move it. Zoom until ${CROP_WORDS[cropping.side]} fills the square.`,
            phoneDescription:
              "Drag with one finger to move the photo. Pinch, or use the slider, to zoom.",
            square: true,
            previews: [{ label: "On the card", px: 112 }],
          }}
        />
      )}
    </>
  );
}
