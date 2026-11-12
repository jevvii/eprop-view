"use server";
import { createClient } from "@/app/lib/supabase/server";
import { verifySession } from "@/app/lib/dal";
import {
  filterSchema,
  type WorkspaceFilters,
  type FilterScope,
} from "@/app/lib/workspace-filters";
import { z } from "zod";

export async function getFilteredRecordIds(
  scope: FilterScope,
  filters: WorkspaceFilters,
): Promise<string[]> {
  await verifySession();
  const selected = z
    .enum(["inspections", "reports", "maintenance", "hotspots"])
    .parse(scope);
  const parsed = filterSchema.parse(filters);
  const supabase = await createClient();
  const ids: string[] = [];
  for (let offset = 0; offset < 100_000; offset += 500) {
    const { data, error } = await supabase
      .rpc("filter_workspace_records", { p_scope: selected, p_filters: parsed })
      .range(offset, offset + 499);
    if (error)
      throw new Error(
        `Workspace filters could not be applied: ${error.message}`,
      );
    ids.push(...(data ?? []).map((row: { id: string }) => row.id));
    if ((data?.length ?? 0) < 500) return ids;
  }
  throw new Error(
    "Filter result is too large. Narrow the date range or building.",
  );
}

export async function getWorkspaceFilterOptions(): Promise<{
  buildings: { id: string; name: string }[];
  floors: { id: string; name: string; building_id: string }[];
  elements: { id: string; identifier: string; floor_id: string | null }[];
}> {
  await verifySession();
  const supabase = await createClient();
  const [buildings, floors, elements] = await Promise.all([
    supabase.from("buildings").select("id,name").order("name"),
    supabase.from("floors").select("id,name,building_id").order("sort_order"),
    supabase
      .from("structural_elements")
      .select("id,identifier,floor_id")
      .order("identifier"),
  ]);
  for (const result of [buildings, floors, elements])
    if (result.error) throw result.error;
  return {
    buildings: buildings.data ?? [],
    floors: floors.data ?? [],
    elements: elements.data ?? [],
  };
}
