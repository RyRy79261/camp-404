import { PetPortrait } from "@camp404/games/pets";
import { petKindText } from "@camp404/core";
import { cn } from "@camp404/ui/lib/utils";
import type { PetRow } from "@/lib/pets";
import { petPhotoHref } from "@/lib/pet-photos";
import { PET_WAITING_NOTE } from "@/lib/pets-copy";
import {
  EditHintButton,
  EditThingButton,
  MarkInButton,
  SetOwnerButton,
  type OwnerChoice,
  type PictureChoice,
} from "./pet-controls";

// One pet's card (Camp pets, the owner's approved option A, 2026-10-09): the
// picture on top, then the name, whose it is and what it is, the one stupid
// thing as a quote, and at the foot where it stands. A pet that is in wears
// its picture from the code (a server-drawn SVG); a waiting one shows its two
// photos, which only its member and the captains are ever sent. The hint is
// on every card that has one: it is everyone's (owner, 2026-10-09).
// Server-rendered; the captain's buttons are small client islands.

const DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "Africa/Johannesburg",
});

export interface PetCardProps {
  pet: PetRow;
  /** The viewer's own pet. */
  mine: boolean;
  /** The viewer is a captain: Mark as in, Edit hint, Set owner. */
  reviewer: boolean;
  /** Whether this viewer may see the photos (its member, or a captain). */
  showPhotos: boolean;
  /** For a captain: the pictures no pet wears yet. */
  freeKeys: readonly string[];
  owners: readonly OwnerChoice[];
}

function Status({
  tone,
  children,
}: {
  tone: "warning" | "success";
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs leading-4 font-semibold whitespace-nowrap",
        tone === "warning" ? "text-warning" : "text-success",
      )}
    >
      <span aria-hidden className="size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Picture({ pet, showPhotos }: { pet: PetRow; showPhotos: boolean }) {
  if (pet.status === "in" && pet.moduleKey) {
    return (
      <div
        className="grid h-28 place-items-center border-b border-border bg-background bg-[linear-gradient(color-mix(in_oklab,var(--color-primary)_10%,transparent)_1px,transparent_1px),linear-gradient(90deg,color-mix(in_oklab,var(--color-primary)_10%,transparent)_1px,transparent_1px)] bg-[size:12px_12px] px-4 py-3 page-sm:h-36"
        data-testid="pet-portrait"
      >
        <PetPortrait
          moduleKey={pet.moduleKey}
          className="h-full max-h-28 w-auto max-w-full"
        />
      </div>
    );
  }
  if (!showPhotos) return null;
  const sides = [
    pet.hasFrontPhoto ? ("front" as const) : null,
    pet.hasSidePhoto ? ("side" as const) : null,
  ].filter((s) => s !== null);
  if (sides.length === 0) return null;
  return (
    <div
      data-os-private
      className="flex h-28 gap-px border-b border-border bg-border page-sm:h-36"
    >
      {sides.map((side) => (
        <div key={side} className="relative min-w-0 flex-1 bg-muted">
          {/* A private photo through the gated route: never next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element -- a gated, private photo, streamed by our own route */}
          <img
            src={petPhotoHref(pet.id, side)}
            alt={`${pet.name} from the ${side}`}
            className="block size-full object-cover"
          />
          <span className="absolute bottom-1 left-1 bg-black/70 px-1 text-[10px] leading-4 font-semibold text-white">
            {side === "front" ? "Front" : "Side"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A picture key as a captain reads it: "nipster" is "Nipster". */
function pictureName(key: string): string {
  return key
    .split("-")
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function pictureChoices(keys: readonly string[]): PictureChoice[] {
  return keys.map((key) => ({
    key,
    label: pictureName(key),
    preview: <PetPortrait moduleKey={key} className="h-10 w-auto" />,
  }));
}

export function PetCard({
  pet,
  mine,
  reviewer,
  showPhotos,
  freeKeys,
  owners,
}: PetCardProps) {
  const kind = petKindText(pet.kind, pet.kindOther);
  const whose = mine ? null : pet.ownerName ? `${pet.ownerName}'s` : null;
  const editable = mine || reviewer;
  return (
    <li
      data-testid="pet-card"
      data-pet={pet.name}
      data-status={pet.status}
      className={cn(
        "flex min-w-0 flex-col border bg-card text-card-foreground",
        mine ? "border-primary/60" : "border-border",
      )}
    >
      <Picture pet={pet} showPhotos={showPhotos} />
      <div className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-4 page-sm:px-4">
        <h3 className="truncate text-base leading-6 font-semibold">
          {pet.name}
        </h3>
        <p className="truncate text-[13px] leading-5 text-muted-foreground">
          {mine ? <b className="font-semibold text-primary">Yours</b> : whose}
          {(mine || whose) && " · "}
          {kind}
        </p>
        <div className="mt-2 flex items-start gap-1">
          <blockquote className="min-w-0 flex-1 text-[13px] leading-5 italic text-card-foreground/90">
            &ldquo;{pet.stupidThing}&rdquo;
          </blockquote>
          {editable && (
            <EditThingButton
              petId={pet.id}
              petName={pet.name}
              current={pet.stupidThing}
            />
          )}
        </div>

        <div className="mt-auto flex flex-col gap-2 pt-3">
          {pet.status === "waiting" ? (
            <>
              <Status tone="warning">Waiting</Status>
              {mine && (
                <p className="text-xs leading-4 text-muted-foreground">
                  {PET_WAITING_NOTE}
                </p>
              )}
              {reviewer && !mine && (
                <p className="text-xs leading-4 text-muted-foreground">
                  Sent by {pet.ownerName ?? "a member"},{" "}
                  {DATE.format(pet.createdAt)}
                </p>
              )}
              {reviewer && (
                <MarkInButton
                  petId={pet.id}
                  petName={pet.name}
                  ownerName={pet.ownerName}
                  pictures={pictureChoices(freeKeys)}
                />
              )}
            </>
          ) : (
            <>
              {mine && <Status tone="success">It&apos;s in!</Status>}
              {pet.hint && (
                <div className="border border-border bg-muted/40 px-3 py-2 text-xs leading-4 text-muted-foreground">
                  {mine ? "Your hint" : "Hint"}
                  <b className="mt-0.5 block text-[13px] leading-5 font-semibold text-card-foreground">
                    {pet.hint}
                  </b>
                </div>
              )}
              {reviewer && (
                <div className="flex flex-wrap gap-2">
                  <EditHintButton
                    petId={pet.id}
                    petName={pet.name}
                    current={pet.hint}
                  />
                  {/* A pet a member sent in never changes hands: its
                      photos are only for the sender (setPetOwner refuses). */}
                  {!pet.hasFrontPhoto && !pet.hasSidePhoto && (
                    <SetOwnerButton
                      petId={pet.id}
                      petName={pet.name}
                      ownerId={pet.ownerId}
                      owners={owners}
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}
