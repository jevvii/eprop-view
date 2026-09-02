import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
// @ts-expect-error pg untyped in devDependencies
import { Client } from 'pg'
import dotenv from 'dotenv'

// Load environment variables from .env.local
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath })
}

const PENDING_MIGRATIONS = [
  '002_add_user_status.sql',
  '002_reports_audit_trail.sql',
  '003_setup_storage.sql',
  '004_image_ownership.sql',
  '005_asset_commenting.sql',
  '006_ai_module.sql',
  '007_ar_module.sql',
  '008_rbac_and_usecase_parity.sql',
  '009_rbac_enforcement.sql',
  '010_ai_model_registry_v2.sql',
  '011_building_master_data.sql',
  '012_geohazard_layers.sql',
  '013_storage_audit.sql',
]

async function promptPassword(): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question('Enter your Supabase Database Password (from dashboard Settings -> Database): ', (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

async function main() {
  console.log('\n======================================================')
  console.log('   EPROPVIEW — Supabase Database Migration Runner    ')
  console.log('======================================================\n')

  const argInput = process.argv[2]
  let connectionString = process.env.DATABASE_URL
  let dbPassword = process.env.SUPABASE_DB_PASSWORD

  if (argInput) {
    if (argInput.startsWith('postgres://') || argInput.startsWith('postgresql://')) {
      connectionString = argInput
    } else {
      dbPassword = argInput
    }
  }

  // Determine host from NEXT_PUBLIC_SUPABASE_URL if direct connection string is not provided
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gpefqnezxdhxrmwdbkdh.supabase.co'
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]
  const dbHost = `db.${projectRef}.supabase.co`

  if (!connectionString && !dbPassword) {
    dbPassword = await promptPassword()
  }

  if (!connectionString && !dbPassword) {
    console.error('❌ Error: No database password or connection string provided. Aborting.')
    process.exit(1)
  }

  const clientConfig = connectionString
    ? { connectionString, ssl: { rejectUnauthorized: false } }
    : {
        host: dbHost,
        port: 5432,
        database: 'postgres',
        user: 'postgres',
        password: dbPassword,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,
      }

  console.log(`Connecting to PostgreSQL host: ${connectionString ? 'custom connection string' : dbHost}...`)
  const client = new Client(clientConfig)

  try {
    await client.connect()
    console.log(' Connected to Supabase PostgreSQL database!\n')
  } catch (err: any) {
    console.error('❌ Connection failed:', err.message)
    console.error('\nTips:')
    console.error(' 1. If using password only and your network is IPv4, copy your connection URI from the Supabase Dashboard:')
    console.error(`    https://supabase.com/dashboard/project/${projectRef}/settings/database (Under "Connection string" -> "URI")`)
    console.error(` 2. Run with your connection URI:`)
    console.error(`    npm run db:migrate "postgresql://postgres.${projectRef}:[YOUR_PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres"`)
    console.error(' 3. Or paste `supabase/apply_all_pending_migrations.sql` into the Supabase SQL Editor:')
    console.error(`    https://supabase.com/dashboard/project/${projectRef}/sql\n`)
    process.exit(1)
  }

  // Create migration tracking table
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._eprop_migrations (
      id serial PRIMARY KEY,
      filename text UNIQUE NOT NULL,
      applied_at timestamptz DEFAULT now()
    );
  `)

  // Query already applied migrations
  const { rows: appliedRows } = await client.query('SELECT filename FROM public._eprop_migrations;')
  const appliedSet = new Set(appliedRows.map((r: any) => r.filename))

  let successCount = 0
  let skippedCount = 0

  for (const filename of PENDING_MIGRATIONS) {
    const filePath = path.resolve(process.cwd(), 'supabase', 'migrations', filename)

    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Warning: Migration file not found: ${filePath}`)
      continue
    }

    if (appliedSet.has(filename)) {
      console.log(`⏭️  Skipping already applied: ${filename}`)
      skippedCount++
      continue
    }

    console.log(`⏳ Applying: ${filename}...`)
    const sqlContent = fs.readFileSync(filePath, 'utf-8')
    const startTime = Date.now()

    try {
      await client.query('BEGIN')
      await client.query(sqlContent)
      await client.query('INSERT INTO public._eprop_migrations (filename) VALUES ($1);', [filename])
      await client.query('COMMIT')

      const durationMs = Date.now() - startTime
      console.log(`   ${filename} applied successfully (${durationMs}ms)`)
      successCount++
    } catch (err: any) {
      await client.query('ROLLBACK')
      console.error(`❌ Failed applying ${filename}:`, err.message)
      console.error('   Transaction rolled back. Aborting remaining migrations.\n')
      await client.end()
      process.exit(1)
    }
  }

  await client.end()

  console.log('\n======================================================')
  console.log(`   Migration Complete: ${successCount} applied, ${skippedCount} previously applied.`)
  console.log('======================================================\n')
}

main().catch((err) => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
