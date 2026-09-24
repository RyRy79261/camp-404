import {
  resolveUse,
  // Not a React hook: how a step names a line. Renamed so the hooks lint
  // does not read it as one.
  useLabel as lineLabel,
  type PlateLine,
  type RecipeLine,
} from "@camp404/types";
import { formatAmount } from "@/lib/recipe-labels";

// The ingredients one step handles, as chips under the instruction: Noble
// Notations' StepIngredients and its F/Ingredient callout, restyled with Camp
// 404's tokens. A bordered chip per line, its amount on an accent wash in the
// accent colour, the name beside it. The amount is the chosen plate count's
// (the line at the same index of `amounts`), because the page shows one count
// at a time and a step must agree with the ingredient list beside it.
//
// A server component: nothing here is interactive (ticking off waits).

export function StepUses({
  uses,
  lines,
  amounts,
  label,
}: {
  /** The step's `uses`: each a line's name, or "Component: Name". */
  uses: readonly string[];
  /** The recipe's lines, which the names resolve against. */
  lines: readonly RecipeLine[];
  /** The chosen count's amounts, by line index. */
  amounts: readonly (PlateLine | undefined)[];
  /** The list's accessible name, e.g. "Step 3 uses". */
  label: string;
}) {
  if (uses.length === 0) return null;
  return (
    <ul aria-label={label} className="flex w-full flex-wrap items-start gap-2">
      {uses.map((used, i) => {
        const index = resolveUse(lines, used);
        // Every write checks that each use fits one line; a name that does
        // not is shown bare rather than guessed at.
        if (typeof index !== "number") {
          return (
            <li key={`${used}-${i}`} className={CHIP}>
              <span className={CHIP_NAME}>{used}</span>
            </li>
          );
        }
        const line = lines[index]!;
        const count = amounts[index];
        const amount = count
          ? formatAmount(count.quantity, count.quantityMax, count.unit)
          : formatAmount(line.quantity, line.quantityMax, line.unit);
        return (
          <li key={`${used}-${i}`} className={CHIP}>
            {amount && <span className={CHIP_AMOUNT}>{amount}</span>}
            <span className={CHIP_NAME}>{lineLabel(lines, index)}</span>
          </li>
        );
      })}
    </ul>
  );
}

const CHIP =
  "inline-flex max-w-full items-stretch overflow-hidden rounded-sm border border-border";
const CHIP_AMOUNT =
  "shrink-0 whitespace-nowrap bg-accent/10 px-2 py-1 font-mono text-xs tabular-nums text-accent";
const CHIP_NAME = "min-w-0 px-2.5 py-1 text-sm text-foreground";
