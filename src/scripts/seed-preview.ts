/**
 * Seed the preview database from the command line.
 *
 * The preview service-role key is stored as a sensitive Vercel value, so the CLI
 * cannot decrypt it. Two ways to run this:
 *
 *   1. Set the values explicitly (they never touch disk):
 *        NEXT_PUBLIC_SUPABASE_URL=https://<preview-ref>.supabase.co \
 *        SUPABASE_SERVICE_ROLE_KEY=<preview service role key> \
 *        npm run seed:preview
 *
 *   2. From the admin UI: Settings → Demo Data → Seed demo data, on a Preview
 *      deployment, where the server already holds the key.
 *
 * `vercel env run` is deliberately NOT recommended: it loads `.env.local` first,
 * so it hands this script the production database. The ref check below caught
 * exactly that during development.
 */

import { createClient } from '@supabase/supabase-js'
import { DEMO_PROJECT_NAME, seedDemoData } from '../app/lib/seed/demo'

const PREVIEW_PROJECT_REF = 'gbuwldihkmapzondxkto'

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
    console.error('Run it through Vercel: vercel env run --environment preview -- npm run seed:preview')
    process.exit(1)
  }

  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    console.error(`NEXT_PUBLIC_SUPABASE_URL is not a valid URL: ${url}`)
    process.exit(1)
  }

  const isPreviewProject = host.includes(PREVIEW_PROJECT_REF)

  console.log('──────────────────────────────────────────────')
  console.log('  ePropView — preview demo seed')
  console.log(`  Target : ${host}`)
  console.log(`  Project: ${DEMO_PROJECT_NAME}`)
  console.log('──────────────────────────────────────────────')

  if (!isPreviewProject && process.env.ALLOW_ANY_PROJECT !== '1') {
    console.error(`Refusing to seed ${host}: it is not the preview project (${PREVIEW_PROJECT_REF}).`)
    console.error('Set ALLOW_ANY_PROJECT=1 only if you are certain this is a disposable database.')
    process.exit(1)
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const result = await seedDemoData(supabase)

  if (!result.seeded) {
    console.log(`\nNothing written. ${result.reason ?? ''}`)
    process.exit(0)
  }

  console.log('\nDemo data written:')
  for (const [key, value] of Object.entries(result.counts)) {
    console.log(`  ${key}: ${value}`)
  }
  console.log('\nSign in as the admin or engineer account to review the new surfaces.')
}

main().catch((error) => {
  console.error('Seed failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
