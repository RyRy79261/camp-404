import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  buildShoppingList,
  canRunProofread,
  mealPlanDayLabel,
  mealPlates,
  snackKey,
} from "@camp404/core";
import {
  getKitchenMenu,
  getShoppingFacts,
  getShoppingPricesFor,
  getSnacks,
} from "../../kitchen-menu";
import { getMealPlan } from "../../meal-plan";
import {
  MEAL_PLAN_PATH,
  SHOPPING_LIST_PATH,
  recipePath,
} from "../../recipe-copy";
import {
  CATEGORY_LABEL,
  shoppingAmountLabel,
  shoppingBuyLabel,
} from "../../recipe-labels";
import {
  listAwaitingAcceptance,
  listReadyToProofread,
  listReviewQueue,
} from "../../recipes";
import { siteUrl } from "../capabilities";
import { runTool } from "../tool-utils";

// The Kitchen's pages, read over MCP (#239's import needs them to check what
// landed), each as its page builds it for THIS person and through its own
// functions:
//
//  - The meal plan: the member's view of /kitchen/meal-plan (the days on
//    site, the plates at each meal, the recipes on each and the snacks). The
//    editors' extras on that page (the dietary counts and the allergen checks)
//    stay on the page.
//  - The shopping list: /kitchen/shopping, worked out by the same
//    buildShoppingList from the same facts, with the shared ticks. Prices come
//    from getShoppingPricesFor, which answers null to anyone but a captain or
//    a Kitchen lead (checked in @camp404/db), so a member's answer has none.
//  - The review queue: /kitchen/recipes/review, for a captain or a Kitchen
//    lead (the gate is kitchenReview, canRunProofread: the page's own rule).
//    Deciding, sending to Claude and accepting stay on the page.

export function registerKitchenTools(server: McpServer): void {
  server.registerTool(
    "get_meal_plan",
    {
      title: "Read this year's meal plan",
      description:
        "This year's meal plan as the Meal plan page shows it: each day on site (named by its date once Logistics has the days), the plates at breakfast and dinner, the recipes on each meal (`verified`: the recipe has a count for those plates), and the year's snacks. The camp does no lunch.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_meal_plan",
        extra,
        argsForAudit: null,
        handler: async () => {
          const [plan, menu, snacks] = await Promise.all([
            getMealPlan(),
            getKitchenMenu(),
            getSnacks(),
          ]);
          const onMeal = (day: number, meal: "breakfast" | "dinner") =>
            menu.items
              .filter((i) => i.day === day && i.meal === meal)
              .sort((a, b) => a.position - b.position)
              .flatMap((i) => {
                const recipe = menu.recipes[i.recipeId];
                if (!recipe) return [];
                const plates = mealPlates(plan.days, day, meal);
                return [
                  {
                    recipeId: i.recipeId,
                    title: recipe.title,
                    verified: recipe.counts.some((c) => c.plates === plates),
                    url: siteUrl(`${recipePath(i.recipeId)}?plates=${plates}`),
                  },
                ];
              });
          return {
            burn: plan.cycle,
            firstDay: plan.firstDay,
            daysOnSite: plan.daysOnSite,
            days: plan.days.map((d, index) => {
              const day = index + 1;
              return {
                day,
                label: mealPlanDayLabel(plan.firstDay, day),
                breakfast: {
                  plates: d.breakfast,
                  recipes: onMeal(day, "breakfast"),
                },
                dinner: { plates: d.dinner, recipes: onMeal(day, "dinner") },
              };
            }),
            snacks: snacks.map((s) => ({ name: s.name, amount: s.amount })),
            url: siteUrl(MEAL_PLAN_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "get_shopping_list",
    {
      title: "Read the shopping list",
      description:
        "The Kitchen's shopping list as its page works it out from the menu: by shop area, each line's exact amount and what to buy, whether it is ticked (ticks are shared by the camp; `tickedAtOtherAmount` means it was ticked before the amount changed), and which meals it comes from. `notCounted` lists menu recipes with no count for their meal's plates yet: they add nothing until proofread. Captains and Kitchen leads also get each line's shop and price (rand cents).",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "get_shopping_list",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const [{ plan, menu, snacks, ticks }, priceRows] = await Promise.all([
            getShoppingFacts(),
            getShoppingPricesFor(scope.campUserId),
          ]);
          const prices = priceRows
            ? new Map(priceRows.map((p) => [p.key, p]))
            : null;
          const list = buildShoppingList({
            days: plan.days,
            menu: menu.items,
            recipes: menu.recipes,
          });
          const tickedAt = new Map(ticks.map((t) => [t.key, t.amount]));
          const dayName = (day: number) => mealPlanDayLabel(plan.firstDay, day);
          const line = (key: string, amount: string) => {
            const at = tickedAt.get(key);
            const p = prices?.get(key);
            return {
              ticked: at === amount,
              tickedAtOtherAmount:
                at !== undefined && at !== amount ? at : null,
              ...(prices
                ? {
                    shop: p?.shop ?? null,
                    priceCents: p?.amountCents ?? null,
                    priceKind: p?.kind ?? "estimate",
                  }
                : {}),
            };
          };
          const groups = list.groups.map((group) => ({
            area: CATEGORY_LABEL[group.category],
            lines: group.lines.map((l) => {
              const amount = shoppingAmountLabel(l.amount);
              return {
                name: l.name,
                amount,
                buy: shoppingBuyLabel(l.amount),
                ...line(l.key, amount),
                from: l.sources.map((s) => ({
                  meal: `${dayName(s.day)}, ${s.meal}`,
                  recipe: s.title,
                  plates: s.plates,
                  amount: shoppingAmountLabel(s.amount),
                })),
              };
            }),
          }));
          if (snacks.length > 0) {
            groups.push({
              area: "Snacks",
              lines: snacks.map((snack) => {
                const amount = snack.amount ?? "";
                return {
                  name: snack.name,
                  amount,
                  buy: amount,
                  ...line(snackKey(snack.id), amount),
                  from: [],
                };
              }),
            });
          }
          return {
            meals: list.meals,
            groups,
            notCounted: list.notCounted.map((n) => ({
              meal: `${dayName(n.day)}, ${n.meal}`,
              recipe: n.title,
              recipeId: n.recipeId,
              plates: n.plates,
            })),
            url: siteUrl(SHOPPING_LIST_PATH),
          };
        },
      }),
  );

  server.registerTool(
    "list_recipe_review_queue",
    {
      title: "List the Kitchen's review queue",
      description:
        "The Kitchen's review page: suggestions waiting for a decision (and those sent back for changes), recipes ready to send to Claude (`blockedReason` says why one cannot go yet), and older drafts waiting to be accepted. Approving, sending to Claude and accepting happen on the page, by a person.",
      inputSchema: z.object({}),
    },
    async (_args, extra) =>
      runTool({
        toolName: "list_recipe_review_queue",
        extra,
        argsForAudit: null,
        handler: async ({ scope }) => {
          const [suggestions, ready, awaiting] = await Promise.all([
            listReviewQueue(),
            listReadyToProofread(),
            listAwaitingAcceptance(),
          ]);
          return {
            suggestions: suggestions.map((r) => ({
              id: r.id,
              title: r.title,
              status: r.status,
              source: r.source,
              sourceUrl: r.sourceUrl,
              suggestedBy: r.submitterName,
              suitabilityNote: r.suitabilityNote,
              changesNote: r.changesNote,
              suggestedAt: r.createdAt,
            })),
            // The page shows this section to those who may send (the gate
            // already says so; asked again so the rule reads here too).
            readyForClaude: canRunProofread(scope.viewerRank, scope.leadTeams)
              ? ready.map((r) => ({
                  id: r.id,
                  title: r.title,
                  status: r.status,
                  inTheBook: r.acceptedVersionId !== null,
                  blockedReason: r.blockedReason,
                  lastError: r.lastError,
                  rerunRequest: r.rerunRequest,
                }))
              : [],
            awaitingAcceptance: awaiting.map((r) => ({
              id: r.id,
              title: r.title,
              finishedAt: r.finishedAt,
              inTheBook: r.acceptedVersionId !== null,
            })),
            url: siteUrl("/kitchen/recipes/review"),
          };
        },
      }),
  );
}
