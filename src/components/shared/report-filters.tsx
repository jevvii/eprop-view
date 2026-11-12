"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { getWorkspaceFilterOptions } from "@/app/actions/filters";
import {
  EMPTY_WORKSPACE_FILTERS,
  filterSchema,
  filterSearch,
  parseFilterSearch,
  type WorkspaceFilters,
} from "@/app/lib/workspace-filters";
import { scoreToRiskLevel } from "@/app/lib/damage-score";
import type { Report } from "@/app/types";
export type ReportFilterState = WorkspaceFilters;
export const EMPTY_FILTERS = EMPTY_WORKSPACE_FILTERS;
const Context = createContext<{
  filters: WorkspaceFilters;
  update: (patch: Partial<WorkspaceFilters>) => void;
  reset: () => void;
}>({ filters: EMPTY_FILTERS, update: () => {}, reset: () => {} });
export function WorkspaceFiltersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname(),
    router = useRouter();
  const [filters, setFilters] = useState<WorkspaceFilters>(EMPTY_FILTERS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => {
      setFilters(parseFilterSearch(window.location.search));
      setReady(true);
    };
    sync();
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, [pathname]);
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      const q = filterSearch(filters, window.location.search);
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    }, 250);
    return () => clearTimeout(timer);
  }, [filters, pathname, ready, router]);
  const update = (patch: Partial<WorkspaceFilters>) =>
    setFilters((current) => ({ ...current, ...patch }));
  const reset = () => setFilters({ ...EMPTY_FILTERS });
  return (
    <Context.Provider value={{ filters, update, reset }}>
      {children}
    </Context.Provider>
  );
}
export function useReportFilters() {
  return useContext(Context);
}
export const useWorkspaceFilters = useReportFilters;
export function filterReports(
  reports: Report[] | undefined,
  filters: WorkspaceFilters,
): Report[] {
  // Server filtering is authoritative. This compatibility helper uses the same
  // band boundaries and never invents a second definition of Critical.
  return (reports ?? []).filter(
    (r) =>
      filters.risk === "all" || scoreToRiskLevel(r.risk_score) === filters.risk,
  );
}
const control =
  "rounded-lg border border-slate-300 bg-white p-2 text-sm min-h-11 min-w-0 focus-visible:outline-2 focus-visible:outline-primary";
type Options = Awaited<ReturnType<typeof getWorkspaceFilterOptions>>;
export function ReportFilters({
  filters,
  onChange,
  onReset,
  resultCount,
  children,
}: {
  filters: WorkspaceFilters;
  onChange: (patch: Partial<WorkspaceFilters>) => void;
  onReset: () => void;
  resultCount?: number;
  children?: ReactNode;
}) {
  const [options, setOptions] = useState<Options>({
    buildings: [],
    floors: [],
    elements: [],
  });
  const [error, setError] = useState(""),
    [preset, setPreset] = useState(""),
    [presets, setPresets] = useState<Record<string, WorkspaceFilters>>({});
  useEffect(() => {
    let cancelled = false;
    getWorkspaceFilterOptions()
      .then((value) => {
        if (!cancelled) setOptions(value);
      })
      .catch(() => {
        if (!cancelled)
          setError(
            "Building filters are unavailable. Verify database setup and retry.",
          );
      });
    try {
      setPresets(
        Object.fromEntries(
          Object.entries(
            JSON.parse(
              localStorage.getItem("eprop-workspace-presets-v1") ?? "{}",
            ),
          )
            .filter(([, value]) => filterSchema.safeParse(value).success)
            .map(([name, value]) => [name, filterSchema.parse(value)]),
        ),
      );
    } catch {
      setPresets({});
    }
    return () => {
      cancelled = true;
    };
  }, []);
  const select = (
    key: keyof WorkspaceFilters,
    label: string,
    values: [string, string][],
  ) => (
    <label
      key={key}
      className="flex min-w-0 flex-col gap-1 text-xs font-semibold text-slate-700"
    >
      {label}
      <select
        className={control}
        value={filters[key]}
        onChange={(e) =>
          onChange({
            ...{ [key]: e.target.value },
            ...(key === "building"
              ? { floor: "", element: "" }
              : key === "floor"
                ? { element: "" }
                : {}),
          })
        }
      >
        {values.map(([value, title]) => (
          <option key={value} value={value}>
            {title}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section
      aria-label="Workspace filters"
      className="no-print rounded-2xl border border-slate-200 bg-white p-3 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <label className="flex flex-col gap-1 text-xs font-semibold">
          Search
          <input
            type="search"
            className={control}
            value={filters.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </label>
        {select("status", "Status", [
          ["all", "All statuses"],
          ...[
            "open",
            "in_review",
            "critical",
            "completed",
            "pending",
            "in_progress",
            "requires_followup",
            "deferred",
          ].map((s) => [s, s.replaceAll("_", " ")] as [string, string]),
        ])}
        {select("risk", "Risk band", [
          ["all", "All risk bands"],
          ["low", "Low (<4)"],
          ["moderate", "Moderate (4–<6)"],
          ["high", "High (6–<8)"],
          ["critical", "Critical (8–10)"],
        ])}
        {select("severity", "Detection severity", [
          ["all", "All severities"],
          ...["low", "medium", "high", "critical"].map(
            (s) => [s, s] as [string, string],
          ),
        ])}
        {select("damage", "Damage type", [
          ["all", "All damage"],
          ...[
            "crack",
            "corrosion",
            "spalling",
            "deformation",
            "leakage",
            "none",
          ].map((s) => [s, s] as [string, string]),
        ])}
        {select("crack", "Crack category", [
          ["all", "All crack bands"],
          ...["hairline", "fine", "medium", "wide", "severe"].map(
            (s) => [s, s] as [string, string],
          ),
        ])}
        {select("building", "Building", [
          ["", "All buildings"],
          ...options.buildings.map((x) => [x.id, x.name] as [string, string]),
        ])}
        {select("floor", "Floor", [
          ["", "All floors"],
          ...options.floors
            .filter(
              (x) => !filters.building || x.building_id === filters.building,
            )
            .map((x) => [x.id, x.name] as [string, string]),
        ])}
        {select("element", "Element", [
          ["", "All elements"],
          ...options.elements
            .filter((x) => !filters.floor || x.floor_id === filters.floor)
            .map((x) => [x.id, x.identifier] as [string, string]),
        ])}
        {select("verification", "Verification", [
          ["all", "Any verification"],
          ["verified", "Engineer verified"],
          ["unverified", "Awaiting verification"],
        ])}
        {(["from", "to"] as const).map((key) => (
          <label
            key={key}
            className="flex flex-col gap-1 text-xs font-semibold"
          >
            {key === "from" ? "From" : "To"}
            <input
              type="date"
              className={control}
              value={filters[key]}
              onChange={(e) => onChange({ [key]: e.target.value })}
            />
          </label>
        ))}
        {children}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs">
          Saved preset
          <select
            className={control}
            value={preset}
            onChange={(e) => {
              const name = e.target.value;
              setPreset(name);
              if (presets[name]) onChange(presets[name]);
            }}
          >
            <option value="">Choose preset</option>
            {Object.keys(presets).map((name) => (
              <option key={name}>{name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Preset name
          <input
            className={control}
            value={preset}
            maxLength={60}
            onChange={(e) => setPreset(e.target.value)}
          />
        </label>
        <button
          type="button"
          disabled={!preset.trim()}
          className={control}
          onClick={() => {
            const next = { ...presets, [preset.trim()]: filters };
            setPresets(next);
            try {
              localStorage.setItem(
                "eprop-workspace-presets-v1",
                JSON.stringify(next),
              );
            } catch {
              setError("Preset could not be saved in this browser.");
            }
          }}
        >
          Save preset
        </button>
        <button type="button" className={control} onClick={onReset}>
          Clear filters
        </button>
        {resultCount !== undefined && (
          <p role="status" className="text-xs text-slate-600">
            {resultCount} records shown
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
export function WorkspaceFilterBar() {
  const value = useWorkspaceFilters();
  return (
    <ReportFilters
      filters={value.filters}
      onChange={value.update}
      onReset={value.reset}
    />
  );
}

/** Trigger a browser download for a server-generated file. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
