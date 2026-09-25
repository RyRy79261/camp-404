// Rand formatting and the budget calculator's arithmetic. The site only shows
// whole rands, like the camp's own money rule (AGENTS.md: rands only), with
// commas as the camp's own copy writes them (R2,000).

const RANDS = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

export function formatRands(amount: number): string {
  return `R${RANDS.format(Math.round(amount))}`;
}

/** A typed amount as whole rands. Only the digits count; blank or junk is 0. */
export function parseRands(text: string): number {
  const n = Number(text.replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

/** What is left for the camp fee once the other costs are paid. */
export function feeFromBudget(budget: number, costs: number[]): number {
  const spent = costs.reduce((a, b) => a + b, 0);
  return Math.max(0, budget - spent);
}
