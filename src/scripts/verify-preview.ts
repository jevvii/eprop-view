import fs from "node:fs";
import { parse } from "dotenv";
import { Client } from "pg";
const project = "gbuwldihkmapzondxkto";
const local = fs.existsSync(".env.preview.local")
  ? parse(fs.readFileSync(".env.preview.local"))
  : {};
const values = { ...local, ...process.env };
const target = values.NEXT_PUBLIC_SUPABASE_URL;
const masked = (value: string | undefined) =>
  !value || value === "[SENSITIVE]" || /^(placeholder|your[-_])/i.test(value);
async function run() {
  if (!target || new URL(target).hostname !== `${project}.supabase.co`)
    throw new Error(
      "Refusing to use another project. Set the agreed Preview environment before running this check.",
    );
  const connection = values.PREVIEW_DATABASE_URL ?? local.DATABASE_URL;
  if (!connection || masked(connection))
    throw new Error(
      "PREVIEW_DATABASE_URL is missing. Vercel API keys do not provide a PostgreSQL migration connection; set the preview database connection string locally.",
    );
  const parsed = new URL(connection);
  if (
    parsed.hostname !== `db.${project}.supabase.co` &&
    !(parsed.hostname.endsWith(".pooler.supabase.com") && decodeURIComponent(parsed.username) === `postgres.${project}`)
  )
    throw new Error(
      "Database connection does not identify the agreed Preview project. Refusing migration.",
    );
  const client = new Client({
    connectionString: connection,
    connectionTimeoutMillis: 10000,
  });
  try {
    await client.connect();
    if (process.argv.includes("--migrate")) {
      const files = fs.readdirSync("supabase/migrations")
        .filter((name) => /^\d{3}_.*\.sql$/.test(name)).sort();
      const baselineArg = process.argv.find((arg) => arg.startsWith("--baseline="));
      const baseline = baselineArg?.split("=")[1];
      if (baseline && !files.some((name) => name.startsWith(`${baseline}_`)))
        throw new Error("Baseline must match an existing three-digit migration version.");
      const state = await client.query("select to_regclass('public.profiles') as existing, to_regclass('public._eprop_migrations') as tracked");
      if (state.rows[0].existing && !state.rows[0].tracked && !baseline)
        throw new Error("Existing database has no migration ledger. Verify its applied migrations, then rerun with --baseline=NNN for the last confirmed version. Legacy migrations must not be replayed blindly.");
      await client.query("CREATE TABLE IF NOT EXISTS public._eprop_migrations (filename text PRIMARY KEY, applied_at timestamptz DEFAULT now())");
      await client.query("REVOKE ALL ON public._eprop_migrations FROM anon,authenticated");
      if (baseline) {
        for (const filename of files.filter((name) => name.slice(0, 3) <= baseline))
          await client.query("INSERT INTO public._eprop_migrations(filename) VALUES($1) ON CONFLICT(filename) DO NOTHING", [filename]);
      }
      const applied = new Set((await client.query("SELECT filename FROM public._eprop_migrations")).rows.map((row) => row.filename));
      for (const filename of files) {
        if (applied.has(filename)) continue;
        // Existing SQL files optionally own an outer transaction. Keep their
        // statements and ledger entry inside one transaction managed here.
        const sql = fs.readFileSync(`supabase/migrations/${filename}`, "utf8")
          .replace(/^(\s*(?:--[^\n]*\n\s*)*)BEGIN;/i, "$1")
          .replace(/COMMIT;\s*$/i, "");
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query("INSERT INTO public._eprop_migrations(filename) VALUES($1)", [filename]);
          await client.query("COMMIT");
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
        console.log(`Applied ${filename}`);
      }
    }
    const tables = [
      "report_revisions",
      "recommendations",
      "cost_estimates",
      "report_limitations",
      "checklist_templates",
      "checklist_responses",
      "settlement_observations",
      "rebound_tests",
      "soil_investigations",
      "forensic_assessments",
      "audit_events",
      "share_tokens",
    ];
    const result = await client.query(
      "select tablename from pg_tables where schemaname=$1 and tablename=any($2::text[])",
      ["public", tables],
    );
    const available = new Set(result.rows.map((row) => row.tablename));
    const missing = tables.filter((table) => !available.has(table));
    if (missing.length)
      throw new Error(`Preview schema incomplete: ${missing.join(", ")}`);
    const requiredRpcs = [
      "save_report_revision(uuid,jsonb,boolean,timestamp with time zone)",
      "sign_report_recommendation(uuid,text)",
      "create_report_share(uuid,text,timestamp with time zone)",
      "commit_storage_archive(uuid,text,text,text,text,text,bigint)",
      "import_project_records(jsonb)", "project_hazard_context(uuid)",
      "settlement_overview(uuid)", "replace_image_detections(uuid,uuid,text,jsonb)",
      "filter_workspace_records(text,jsonb)", "filtered_dashboard_stats(jsonb)",
      "filtered_damage_trends(jsonb)",
    ];
    const rpcCheck = await client.query(
      "SELECT name FROM unnest($1::text[]) AS name WHERE to_regprocedure('public.' || name) IS NULL", [requiredRpcs],
    );
    if (rpcCheck.rows.length) throw new Error(`Preview RPCs missing: ${rpcCheck.rows.map((row) => row.name).join(", ")}`);
    const roles = await client.query(
      "select role,count(*) from profiles where is_active group by role",
    );
    console.log("Schema tables verified; active role counts:", roles.rows);
    const availableRoles = new Set(roles.rows.map((row) => row.role));
    const missingRoles = ["admin", "engineer", "inspector", "viewer"].filter((role) => !availableRoles.has(role));
    if (missingRoles.length) throw new Error(`Role demonstration incomplete: no active ${missingRoles.join(", ")} account. Provision these roles in Settings before the capstone walkthrough.`);
    console.log(
      masked(values.GEMINI_API_KEY)
        ? "Gemini cannot be tested from this export: sensitive values are placeholders. Use Settings → System Health → Verify Gemini at runtime on Preview."
        : "A local Gemini key is available; run the runtime probes before judging output quality.",
    );
  } finally {
    await client.end();
  }
}
run().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Preview verification failed",
  );
  process.exitCode = 1;
});
