"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
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
const DEFAULTS: Record<keyof WorkspaceFilters, string> = {
  q: "",
  status: "all",
  risk: "all",
  severity: "all",
  damage: "all",
  crack: "all",
  building: "",
  floor: "",
  element: "",
  from: "",
  to: "",
  verification: "all",
};

const humanise = (value: string) => value.replaceAll("_", " ");

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
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presets, setPresets] = useState<Record<string, WorkspaceFilters>>({});
  const wrapperRef = useRef<HTMLDivElement>(null);

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

  // Dismiss the disclosure on Escape or a click outside it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onPointerDown = (event: MouseEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open]);

  const keys = Object.keys(DEFAULTS) as (keyof WorkspaceFilters)[];
  const activeCount = keys.filter(
    (key) => filters[key] !== DEFAULTS[key],
  ).length;

  const buildingName = (id: string) =>
    options.buildings.find((x) => x.id === id)?.name ?? "Selected building";
  const floorName = (id: string) =>
    options.floors.find((x) => x.id === id)?.name ?? "Selected floor";
  const elementName = (id: string) =>
    options.elements.find((x) => x.id === id)?.identifier ?? "Selected element";

  const remove = (key: keyof WorkspaceFilters) => {
    const patch: Partial<WorkspaceFilters> = {
      [key]: DEFAULTS[key],
    } as Partial<WorkspaceFilters>;
    if (key === "building") {
      patch.floor = "";
      patch.element = "";
    }
    if (key === "floor") patch.element = "";
    onChange(patch);
  };

  const chips = [
    filters.q && { key: "q" as const, label: `Search: “${filters.q}”` },
    filters.status !== "all" && {
      key: "status" as const,
      label: `Status: ${humanise(filters.status)}`,
    },
    filters.risk !== "all" && {
      key: "risk" as const,
      label: `Risk: ${filters.risk}`,
    },
    filters.severity !== "all" && {
      key: "severity" as const,
      label: `Severity: ${filters.severity}`,
    },
    filters.damage !== "all" && {
      key: "damage" as const,
      label: `Damage: ${filters.damage}`,
    },
    filters.crack !== "all" && {
      key: "crack" as const,
      label: `Crack: ${filters.crack}`,
    },
    filters.building && {
      key: "building" as const,
      label: `Building: ${buildingName(filters.building)}`,
    },
    filters.floor && {
      key: "floor" as const,
      label: `Floor: ${floorName(filters.floor)}`,
    },
    filters.element && {
      key: "element" as const,
      label: `Element: ${elementName(filters.element)}`,
    },
    filters.verification !== "all" && {
      key: "verification" as const,
      label: `Verification: ${humanise(filters.verification)}`,
    },
    filters.from && { key: "from" as const, label: `From: ${filters.from}` },
    filters.to && { key: "to" as const, label: `To: ${filters.to}` },
  ].filter(Boolean) as { key: keyof WorkspaceFilters; label: string }[];

  const field = (
    key: keyof WorkspaceFilters,
    label: string,
    values: [string, string][],
  ) => (
    <label
      key={key}
      className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-slate-600"
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
    <div ref={wrapperRef} className="no-print relative">
      <section
        aria-label="Workspace filters"
        className="rounded-xl border border-slate-200 bg-white px-2 py-2 sm:px-3"
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:min-w-[220px]">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="search"
              aria-label="Search records"
              placeholder="Search records…"
              className={`${control} w-full pl-9`}
              value={filters.q}
              onChange={(e) => onChange({ q: e.target.value })}
            />
          </div>

          <div className="hidden items-center gap-2 sm:flex">
          <select
            aria-label="Status"
            className={`${control} w-auto`}
            value={filters.status}
            onChange={(e) => onChange({ status: e.target.value })}
          >
            <option value="all">All statuses</option>
            {[
              "open",
              "in_review",
              "critical",
              "completed",
              "pending",
              "in_progress",
              "requires_followup",
              "deferred",
            ].map((s) => (
              <option key={s} value={s}>
                {humanise(s)}
              </option>
            ))}
          </select>

          <select
            aria-label="Risk band"
            className={`${control} w-auto`}
            value={filters.risk}
            onChange={(e) =>
              onChange({ risk: e.target.value as WorkspaceFilters["risk"] })
            }
          >
            <option value="all">All risk bands</option>
            <option value="low">Low (&lt;4)</option>
            <option value="moderate">Moderate (4–&lt;6)</option>
            <option value="high">High (6–&lt;8)</option>
            <option value="critical">Critical (8–10)</option>
          </select>

          </div>

          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
            className={`${control} inline-flex w-auto items-center gap-1.5 font-semibold`}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            Filters
            {activeCount > 0 && (
              <span className="rounded-full bg-primary px-1.5 text-[10px] font-bold leading-4 text-white">
                {activeCount}
              </span>
            )}
          </button>

          {resultCount !== undefined && (
            <p className="hidden text-xs font-medium text-slate-500 sm:block">
              {resultCount} shown
            </p>
          )}

          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
            >
              Clear all
            </button>
          )}
        </div>

        {chips.length > 0 && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip.key}>
                <button
                  type="button"
                  onClick={() => remove(chip.key)}
                  aria-label={`Remove filter: ${chip.label}`}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  {chip.label}
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p role="alert" className="mt-2 text-xs text-red-700">
            {error}
          </p>
        )}
      </section>

      {open && (
        <div
          role="region"
          aria-label="More filters"
          className="absolute inset-x-0 top-full z-30 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <div className="contents sm:hidden">
              {field("status", "Status", [
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
                ].map((s) => [s, humanise(s)] as [string, string]),
              ])}
              {field("risk", "Risk band", [
                ["all", "All risk bands"],
                ["low", "Low (<4)"],
                ["moderate", "Moderate (4–<6)"],
                ["high", "High (6–<8)"],
                ["critical", "Critical (8–10)"],
              ])}
            </div>
            {field("severity", "Detection severity", [
              ["all", "All severities"],
              ...["low", "medium", "high", "critical"].map(
                (s) => [s, s] as [string, string],
              ),
            ])}
            {field("damage", "Damage type", [
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
            {field("crack", "Crack category", [
              ["all", "All crack bands"],
              ...["hairline", "fine", "medium", "wide", "severe"].map(
                (s) => [s, s] as [string, string],
              ),
            ])}
            {field("building", "Building", [
              ["", "All buildings"],
              ...options.buildings.map(
                (x) => [x.id, x.name] as [string, string],
              ),
            ])}
            {field("floor", "Floor", [
              ["", "All floors"],
              ...options.floors
                .filter(
                  (x) => !filters.building || x.building_id === filters.building,
                )
                .map((x) => [x.id, x.name] as [string, string]),
            ])}
            {field("element", "Element", [
              ["", "All elements"],
              ...options.elements
                .filter((x) => !filters.floor || x.floor_id === filters.floor)
                .map((x) => [x.id, x.identifier] as [string, string]),
            ])}
            {field("verification", "Verification", [
              ["all", "Any verification"],
              ["verified", "Engineer verified"],
              ["unverified", "Awaiting verification"],
            ])}
            {(["from", "to"] as const).map((key) => (
              <label
                key={key}
                className="flex min-w-0 flex-col gap-1 text-[11px] font-semibold text-slate-600"
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

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
              Saved preset
              <select
                className={control}
                value=""
                onChange={(e) => {
                  const name = e.target.value;
                  if (presets[name]) {
                    onChange(presets[name]);
                    setPresetName(name);
                  }
                }}
              >
                <option value="">Choose preset</option>
                {Object.keys(presets).map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-semibold text-slate-600">
              Preset name
              <input
                className={control}
                value={presetName}
                maxLength={60}
                onChange={(e) => setPresetName(e.target.value)}
              />
            </label>
            <button
              type="button"
              disabled={!presetName.trim()}
              className={`${control} disabled:opacity-50`}
              onClick={() => {
                const next = { ...presets, [presetName.trim()]: filters };
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
          </div>
        </div>
      )}
    </div>
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
