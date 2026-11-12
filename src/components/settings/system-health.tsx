"use client";

import { useEffect, useState } from "react";
import {
  verifyGeminiIntegration,
  type GeminiDiagnostic,
} from "@/app/actions/gemini-analysis";
import { createClient } from "@/app/lib/supabase/client";
import { Chip, EmptyState, Panel } from "@/components/structural/ui";

interface HealthCounts {
  projects: number;
  inspections: number;
  reports: number;
  images: number;
  detections: number;
  failedJobs: number;
  openMaintenance: number;
  storageObjects: number;
}

type CountKey = keyof HealthCounts;

/**
 * System health.
 *
 * Real numbers only. Every figure is a counted row; nothing here is estimated or
 * extrapolated, and a failed query renders as "unavailable" rather than zero.
 */
export function SystemHealth() {
  const [counts, setCounts] = useState<Partial<HealthCounts>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [diagnostics, setDiagnostics] = useState<GeminiDiagnostic[]>([]);
  const [checking, setChecking] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState("");
  const [schemaIssues, setSchemaIssues] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    const countOf = async (
      table: string,
      filter?: { column: string; value: string },
    ) => {
      let query = supabase
        .from(table)
        .select("id", { count: "exact", head: true });
      if (filter) query = query.eq(filter.column, filter.value);
      const { count, error } = await query;
      if (error) throw error;
      return count ?? 0;
    };

    const load = async () => {
      try {
        const [
          projects,
          inspections,
          reports,
          images,
          detections,
          failedJobs,
          openMaintenance,
          storageObjects,
        ] = await Promise.all([
          countOf("projects"),
          countOf("inspections"),
          countOf("reports"),
          countOf("inspection_images"),
          countOf("ai_damage_detections"),
          countOf("ai_analysis_jobs", { column: "status", value: "failed" }),
          countOf("maintenance_priorities", {
            column: "status",
            value: "pending",
          }),
          countOf("storage_audit"),
        ]);

        if (!cancelled) {
          setCounts({
            projects,
            inspections,
            reports,
            images,
            detections,
            failedJobs,
            openMaintenance,
            storageObjects,
          });
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    void Promise.all(
      [
        "report_revisions",
        "recommendations",
        "cost_estimates",
        "checklist_templates",
        "settlement_observations",
        "share_tokens",
      ].map(async (table) => {
        const { error } = await supabase
          .from(table)
          .select("id", { head: true, count: "exact" });
        return error ? table : null;
      }),
    ).then((results) => {
      if (!cancelled)
        setSchemaIssues(
          results.filter((value): value is string => value !== null),
        );
    }).catch(() => {
      if (!cancelled) setSchemaIssues(["Schema verification request failed"]);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows: {
    key: CountKey;
    label: string;
    tone?: "good" | "warn" | "bad";
  }[] = [
    { key: "projects", label: "Projects" },
    { key: "inspections", label: "Inspections" },
    { key: "reports", label: "Reports" },
    { key: "images", label: "Stored images" },
    { key: "detections", label: "AI detections" },
    { key: "failedJobs", label: "Failed AI jobs", tone: "bad" },
    { key: "openMaintenance", label: "Maintenance pending", tone: "warn" },
    { key: "storageObjects", label: "Objects in storage audit", tone: "good" },
  ];

  return (
    <Panel
      title="System Health"
      description="Counted from the database on load. A figure that could not be read says unavailable rather than zero."
    >
      <p className="text-xs text-slate-600">
        Environment:{" "}
        {process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("gbuwldihkmapzondxkto")
          ? "Agreed preview project"
          : "Other configured project — verify before seeding or migration"}
        .
      </p>
      {schemaIssues.length > 0 && (
        <p role="alert" className="text-sm text-red-700">
          Required schema unavailable: {schemaIssues.join(", ")}. Apply the
          reviewed migrations to the intended preview database; an empty count
          is not successful setup.
        </p>
      )}
      <section className="rounded-xl border border-slate-200 p-3 space-y-2">
        <h3 className="text-sm font-semibold">Gemini integration check</h3>
        <p className="text-xs text-slate-600">
          Runs four schema/transport probes using synthetic imagery and supplied
          example findings. Uses up to four API requests. This is not an
          accuracy or engineering calibration benchmark.
        </p>
        <button
          type="button"
          disabled={checking}
          className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm focus-visible:outline-2"
          onClick={async () => {
            setChecking(true);
            setDiagnosticError("");
            try {
              setDiagnostics(await verifyGeminiIntegration());
            } catch (error) {
              setDiagnosticError(
                error instanceof Error
                  ? error.message
                  : "Diagnostic unavailable",
              );
            } finally {
              setChecking(false);
            }
          }}
        >
          {checking ? "Checking Gemini…" : "Verify Gemini at runtime"}
        </button>
        {diagnosticError && (
          <p role="alert" className="text-xs text-red-700">
            {diagnosticError}
          </p>
        )}
        <ul role="status" className="space-y-2">
          {diagnostics.map((row) => (
            <li key={row.scenario} className="text-xs">
              <strong>
                {row.scenario}: {row.status}
              </strong>{" "}
              · {row.model ?? "no Gemini response"}
              <p className="whitespace-pre-line">{row.detail}</p>
            </li>
          ))}
        </ul>
      </section>
      {loading && (
        <p className="text-xs text-slate-500 font-medium">Counting…</p>
      )}

      {!loading && failed && (
        <EmptyState
          title="Health check unavailable"
          message="The counts could not be read for this role or connection. Nothing is shown rather than a misleading zero."
        />
      )}

      {!loading && !failed && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {rows.map((row) => (
            <div
              key={row.key}
              className="rounded-xl border border-slate-200 bg-slate-50 p-3"
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {row.label}
              </p>
              <p className="text-2xl font-bold text-slate-900 tabular-nums mt-1">
                {counts[row.key] ?? "—"}
              </p>
              {row.tone && counts[row.key] != null && counts[row.key]! > 0 && (
                <Chip tone={row.tone}>
                  {row.tone === "bad"
                    ? "needs attention"
                    : row.tone === "warn"
                      ? "open"
                      : "ok"}
                </Chip>
              )}
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
