import { PageHeading } from "@camp404/ui/components/page-heading";
import { requireMemberPage } from "@/lib/member-gate";
import { RecipeComposer } from "./recipe-composer";

export const dynamic = "force-dynamic";

export const metadata = { title: "Import a recipe — Camp 404" };

// Import a recipe (#243), composed like the AfrikaBurn console's new-bulletin
// page: the heading, then one composer card. Any approved member may import;
// the action checks again. Nothing is read here, so nothing is sent.

export default async function ImportRecipePage() {
  await requireMemberPage();
  return (
    <div className="flex flex-col">
      <PageHeading
        eyebrow="Kitchen / Recipes / Import"
        title="Import a recipe"
        description="Paste a recipe as you found it. A Kitchen lead or a captain checks it, and either can have Claude turn it into a recipe the kitchen can cook from."
      />
      <RecipeComposer />
    </div>
  );
}
