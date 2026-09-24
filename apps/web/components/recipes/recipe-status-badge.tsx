import type { RecipeStatus } from "@camp404/types";
import { Badge } from "@camp404/ui/components/badge";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/recipe-labels";

/** A recipe's status as the console's pill. Server-safe. */
export function RecipeStatusBadge({ status }: { status: RecipeStatus }) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABEL[status]}</Badge>;
}
