import { mayReadPetPhoto, unusedPetModuleKeys } from "@camp404/core";
import { PET_MODULE_KEYS } from "@camp404/games/pets";
import { PageHeading } from "@camp404/ui/components/page-heading";
import { AddPetButton } from "@/components/pets/add-pet";
import { PetCard } from "@/components/pets/pet-card";
import { PetFilter } from "@/components/pets/pet-filter";
import { requireMemberPage } from "@/lib/member-gate";
import {
  isPetReviewer,
  listPetOwnerChoices,
  listPets,
  listUsedPetModuleKeys,
  type PetRow,
} from "@/lib/pets";

export const dynamic = "force-dynamic";

export const metadata = { title: "Camp pets — Camp 404" };

// Camp pets (the owner's approved option A, 2026-10-09, with his rulings of
// the same day). Every approved member opens it: their own pets first,
// waiting ones too, then every pet that is in, as cards with the pet's
// picture (drawn in code), whose it is, what it is, the one stupid thing and
// the hint, which is everyone's. A photo is drawn only for the member who sent
// it and the founders: the page asks mayReadPetPhoto, and the photo route asks
// again. Other members' waiting pets are never read for a member: the list is
// cut on the server (listPets). A founder also gets All / Waiting and the
// review buttons. Never say what "in" means or where a pet goes.

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="flex items-baseline gap-2 font-sans text-sm leading-5 font-semibold tracking-normal normal-case">
        {title}
        <span className="text-[13px] font-medium text-muted-foreground">
          {count}
        </span>
      </h2>
      {children}
    </section>
  );
}

const GRID =
  "grid grid-cols-2 gap-3 page-md:grid-cols-3 page-md:gap-4 page-xl:grid-cols-4";

export default async function PetsPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  const { authUser, campUser } = await requireMemberPage();
  const reviewer = isPetReviewer(authUser);
  const [pets, used, owners, params] = await Promise.all([
    listPets({ viewerId: campUser.id, isReviewer: reviewer }),
    reviewer ? listUsedPetModuleKeys() : Promise.resolve([]),
    reviewer ? listPetOwnerChoices() : Promise.resolve([]),
    searchParams,
  ]);
  const freeKeys = reviewer ? unusedPetModuleKeys(PET_MODULE_KEYS, used) : [];

  const card = (pet: PetRow) => {
    const mine = pet.ownerId !== null && pet.ownerId === campUser.id;
    return (
      <PetCard
        key={pet.id}
        pet={pet}
        mine={mine}
        reviewer={reviewer}
        showPhotos={mayReadPetPhoto({
          viewerId: campUser.id,
          ownerId: pet.ownerId,
          isFounder: reviewer,
        })}
        freeKeys={freeKeys}
        owners={owners}
      />
    );
  };

  const heading = (
    <PageHeading
      eyebrow="Camp"
      title="Camp pets"
      description="The camp's pets, at home and at camp. Send yours in."
      actions={<AddPetButton />}
    />
  );

  if (reviewer) {
    const waiting = pets.filter((p) => p.status === "waiting");
    const show = params.show === "waiting" ? "waiting" : "all";
    const list = show === "waiting" ? waiting : pets;
    return (
      <div className="flex flex-col gap-4">
        {heading}
        <PetFilter show={show} all={pets.length} waiting={waiting.length} />
        {list.length > 0 ? (
          <ul aria-label="Pets" className={GRID}>
            {list.map(card)}
          </ul>
        ) : (
          <p className="border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Nothing waiting. Every pet that was sent is in.
          </p>
        )}
      </div>
    );
  }

  const mine = pets.filter((p) => p.ownerId === campUser.id);
  const everyone = pets.filter(
    (p) => p.ownerId !== campUser.id && p.status === "in",
  );
  return (
    <div className="flex flex-col gap-6">
      {heading}
      {mine.length > 0 && (
        <Section title="Yours" count={mine.length}>
          <ul aria-label="Your pets" className={GRID}>
            {mine.map(card)}
          </ul>
        </Section>
      )}
      <Section title="Everyone's" count={everyone.length}>
        {everyone.length > 0 ? (
          <ul aria-label="Everyone's pets" className={GRID}>
            {everyone.map(card)}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No pets in yet.</p>
        )}
      </Section>
    </div>
  );
}
