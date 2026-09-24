// Default reasons a lead is closed as lost. Plain, general-sales wording (the old list was
// software-specific: "Product Fit / Missing Features"). Workspaces can replace these in Settings.
export const DEFAULT_LOSS_REASONS = [
  "Budget doesn't fit",
  "Bought elsewhere / chose a competitor",
  "Not interested any more",
  "Couldn't reach them",
  "Not buying now — maybe later",
  "Wrong or fake enquiry",
  "Other",
];

export const lossReasonsKey = (organizationId: string) => `loss_reasons:${organizationId}`;

/** Trims, drops blanks/duplicates, caps length — and always keeps an "Other" escape hatch. */
export function cleanLossReasons(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list) {
    const r = raw.trim().slice(0, 80);
    if (r && !out.some((x) => x.toLowerCase() === r.toLowerCase())) out.push(r);
  }
  if (!out.some((r) => r.toLowerCase() === "other")) out.push("Other");
  return out.slice(0, 20);
}
