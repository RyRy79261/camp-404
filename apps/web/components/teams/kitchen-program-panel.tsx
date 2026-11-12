import { ChefHat } from "lucide-react";
import { ALLERGEN_CHECKER, KITCHEN_REVIEWER } from "@camp404/core";
import {
  getMealChecks,
  getMenuDietaryFor,
  getShoppingFacts,
} from "@/lib/kitchen-menu";
import { listAwaitingAcceptance, listReviewQueue } from "@/lib/recipes";
import { kitchenGlance } from "@/lib/team-glance/kitchen";
import { TeamGlanceCard } from "./team-glance-card";
import type { TeamPanelProps } from "./team-panels";

// The Kitchen's own panel on its program: the same reads the meal plan, the
// shopping list and the recipe book use (the test store under E2E), turned
// into the panel's figures. The review queue is read for its count only. The
// allergy figures are read only
// for a captain or a Kitchen lead (the meal plan editor's own rule), as the
// meal plan page reads them; getMenuDietaryFor checks the viewer again.

export async function KitchenProgramPanel({
  actor,
  viewerId,
  now,
}: TeamPanelProps) {
  const editor = ALLERGEN_CHECKER.allows(actor);
  const [facts, queue, awaiting, checks, dietary] = await Promise.all([
    getShoppingFacts(),
    listReviewQueue(),
    listAwaitingAcceptance(),
    getMealChecks(),
    editor ? getMenuDietaryFor(viewerId) : Promise.resolve(null),
  ]);
  const reviewWaiting =
    queue.filter((r) => r.status === "suggested").length + awaiting.length;
  return (
    <TeamGlanceCard
      id="kitchen"
      icon={ChefHat}
      glance={kitchenGlance({
        now,
        facts,
        reviewWaiting,
        canReview: KITCHEN_REVIEWER.allows(actor),
        allergy: editor && dietary ? { dietary, plans: checks.plans } : null,
      })}
    />
  );
}
