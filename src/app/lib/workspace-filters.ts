import { z } from "zod";
export const filterSchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z.string().max(40).default("all"),
    risk: z.enum(["all", "low", "moderate", "high", "critical"]).default("all"),
    severity: z
      .enum(["all", "low", "medium", "high", "critical"])
      .default("all"),
    damage: z
      .enum([
        "all",
        "crack",
        "corrosion",
        "spalling",
        "deformation",
        "leakage",
        "none",
      ])
      .default("all"),
    crack: z
      .enum(["all", "hairline", "fine", "medium", "wide", "severe"])
      .default("all"),
    building: z.union([z.literal(""), z.string().uuid()]).default(""),
    floor: z.union([z.literal(""), z.string().uuid()]).default(""),
    element: z.union([z.literal(""), z.string().uuid()]).default(""),
    from: z.union([z.literal(""), z.iso.date()]).default(""),
    to: z.union([z.literal(""), z.iso.date()]).default(""),
    verification: z.enum(["all", "verified", "unverified"]).default("all"),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || value.from <= value.to,
    "Start date must not follow end date",
  );
export type WorkspaceFilters = z.infer<typeof filterSchema>;
export const EMPTY_WORKSPACE_FILTERS: WorkspaceFilters = filterSchema.parse({});
export type FilterScope =
  "inspections" | "reports" | "maintenance" | "hotspots";
export function parseFilterSearch(search: string): WorkspaceFilters {
  const params = new URLSearchParams(search);
  const fields = Object.fromEntries(
    Object.entries(EMPTY_WORKSPACE_FILTERS).map(([key, value]) => [
      key,
      params.get(key) ?? value,
    ]),
  );
  const parsed = filterSchema.safeParse(fields);
  return parsed.success ? parsed.data : { ...EMPTY_WORKSPACE_FILTERS };
}
export function filterSearch(
  filters: WorkspaceFilters,
  currentSearch = "",
): string {
  const params = new URLSearchParams(currentSearch);
  for (const [key, value] of Object.entries(filters)) {
    if (value === EMPTY_WORKSPACE_FILTERS[key as keyof WorkspaceFilters])
      params.delete(key);
    else params.set(key, value);
  }
  return params.toString();
}
