# Kitchen menu planner (#244) and shopping list (#245): layouts for approval

Status: **approved 2026-09-30 (layouts A and A, see "Owner's answers"
below) and built** in the kitchen menu PR (2026-10-01): the menu inside the
meal plan, the shopping list at `/kitchen/shopping`, and the snacks. Left out
until asked: prices, suppliers, stock, the allergen cross-check and a PDF
(#249). The proposal below is kept as it was approved.

## Rules these layouts follow

- Follow **Noble Notations**, the owner's recipe site: ingredients grouped by
  category, each step shows what it uses, notes at the bottom. Its shopping
  list (`/list`) is one combined list **grouped by shop area**, with tick boxes
  and a tick-all per group, and a filter over the groups.
- Only what is asked for. No counters, no limits, no extra controls. Full
  width; nothing cut off; plain words.
- Plates per day and meal already come from the **meal plan**
  (`/kitchen/meal-plan`: rows = days with real dates, columns = Breakfast,
  Lunch, Dinner). The menu builds on that page, it does not replace it.
- A recipe at a plate count is **proofread by Claude once per count** and
  cached (`recipe_plate_counts`). The menu reuses those counts; a count that
  isn't verified shows "Proofread for N" (captains and Kitchen leads), the
  same one-selector pattern the owner approved for the recipe page.
- Snacks are separate from meals (owner on #244): their own list, not menu
  slots.
- Editors: captains and Kitchen leads (`canEditMealPlan`). Everyone reads.

## Screen 1: the menu (#244)

**Option A: recipes inside the meal plan table (recommended)**

The existing meal plan page gains a recipe under each plate count. Same rows,
same columns, one page.

```
+--------------------------------------------------------------------------+
| Meal plan                                         [Save] [Copy Day 1 ...] |
| Days on site [11]   Day 1 [Thu 23 Apr 2027]                              |
+-----------------+-------------------+-------------------+----------------+
| Day             | Breakfast         | Lunch             | Dinner         |
+-----------------+-------------------+-------------------+----------------+
| Day 1 · Thu 23  | 12 plates         | 0                 | 12 plates      |
|                 | Shakshuka         |  -                | Dal & rice     |
|                 | Verified          |                   | Proofread for 12|
+-----------------+-------------------+-------------------+----------------+
| Day 2 · Fri 24  | 60 plates         | 0                 | 30 plates      |
|                 | + Add a recipe    |  -                | Chilli sin carne|
|                 |                   |                   | Verified       |
+-----------------+-------------------+-------------------+----------------+
| ...                                                                      |
+--------------------------------------------------------------------------+
  "+ Add a recipe" opens a picker: search the recipe book, pick one.
  A meal may hold more than one recipe (a main and a side): each on its line.
```

- Pros: one page for plates and dishes; matches what the Kitchen already
  approved; a whole week is visible at a glance on a desktop.
- Cons: cells get tall with two or three recipes, and a three-column table
  is tight on a phone (a phone layout would show one card per day).

**Option B: one day at a time**

```
+--------------------------------------------------------------------------+
| Menu                                          < Day 3 · Sat 25 Apr >      |
+--------------------------------------------------------------------------+
| Breakfast · 60 plates                                                    |
|   Shakshuka                              Verified                        |
|   Bread rolls                            Proofread for 60                |
|   + Add a recipe                                                         |
+--------------------------------------------------------------------------+
| Dinner · 30 plates                                                       |
|   Chilli sin carne                       Verified                        |
|   + Add a recipe                                                         |
+--------------------------------------------------------------------------+
```

- Pros: roomy; reads well on a phone; room for notes per meal.
- Cons: a second page next to the meal plan; no week-at-a-glance, so the
  perishables-early check is harder to see.

**Recommendation: A.** It adds one thing to a page the owner already
approved, and the week view is what the kitchen plans from.

**Data it needs**

- Existing: `kitchen_meal_plans` + `kitchen_meal_plan_days` (days, dates,
  plates per meal); `recipes` (book, status accepted); `recipe_versions`
  (the accepted version); `recipe_plate_counts` (is this plate count
  verified?).
- New: `kitchen_menu_items` (cycle, day, meal, recipe id, the version chosen,
  position). One row per recipe on a meal. The plates come from the meal plan
  day, never stored twice.

## Screen 2: the shopping list (#245)

The list is worked out, not typed: for each menu item, take the verified
`recipe_plate_counts` lines for that meal's plates, and add them up by
ingredient and unit. A menu item whose count isn't verified yet is listed
at the top as "Not counted yet: proofread first", never guessed.

**Option A: Noble Notations' list, grouped by shop area (recommended)**

```
+--------------------------------------------------------------------------+
| Shopping list · 2027                          [Print] [Filter.......]     |
| From 14 meals. Not counted yet: Dal & rice (Day 1) - proofread first     |
+--------------------------------------------------------------------------+
| Produce                                                   [ ] Tick all   |
|   [ ] Onions              6 kg        Day 1 dinner, Day 2 dinner, ...    |
|   [ ] Tomatoes            4.5 kg      Day 1 breakfast, ...               |
| Legume                                                                   |
|   [ ] Red lentils         3 kg        Day 1 dinner                       |
| Spice                                                                    |
|   [ ] Cumin, ground       120 g       3 meals                            |
+--------------------------------------------------------------------------+
  Groups are INGREDIENT_CATEGORIES (produce, protein, dairy, ...).
  Each line opens to show where the amount comes from.
```

- Pros: the owner's own design; one list to shop from; prints cleanly.
- Cons: a tick here is one person's; if two people shop, both see the same
  ticks (see question 4).

**Option B: by day, for fresh shops**

```
+--------------------------------------------------------------------------+
| Shopping list · 2027        [Everything] [Before we leave] [Fresh shop]  |
+--------------------------------------------------------------------------+
| Before we leave (keeps)                                                  |
|   Produce: Onions 6 kg · Potatoes 10 kg                                  |
|   Legume:  Red lentils 3 kg                                              |
| Fresh shop, Day 4 (for Days 5-11)                                        |
|   Produce: Tomatoes 3 kg · Coriander 6 bunches                           |
+--------------------------------------------------------------------------+
```

- Pros: fits "perishables first" and the last-day fresh shop in #245.
- Cons: needs each ingredient's keeping class, which the catalogue no longer
  keeps reliably (legacy from the first draft), and a rule for which shop
  covers which days. More to decide.

**Recommendation: A first**, as a plain combined list. B can be a later tab
once the camp says which days the fresh shop covers.

**Data it needs**

- Existing: the menu (above); `recipe_plate_counts.lines` (name, quantity,
  unit per plate count); the recipe version's `body` lines for each
  ingredient's category (shop area).
- New: `kitchen_shopping_ticks` (cycle, ingredient + unit key, ticked by,
  when), if ticks are shared.
- **Not** from inventory: PR #300's `inventory_items` is the camp's **gear**
  (pots, burners, cooler boxes), counted in whole items. It is not food
  stock, so "subtract stock on hand" does not apply to it. The kitchen
  gear it holds is useful later for a "do we have enough pots?" check.
- **Left out** until asked: prices, buyers, suppliers, order status, costing,
  and the allergen cross-check. Each is its own step.

## Owner's answers (2026-09-30)

The owner approved both layouts, so the Kitchen build may start.

1. **Menu layout: A.** Recipes sit inside the meal plan table.
2. **Shopping list layout: A.** One list grouped by shop area, like Noble
   Notations. B (by shop trip) is not planned.
3. **More than one recipe per meal:** yes.
4. **Ticks:** shared by the whole camp, and **any member may tick** (not only
   Kitchen leads and captains).
5. **Snacks:** their own short list, added into the shopping list, built
   after the menu.
