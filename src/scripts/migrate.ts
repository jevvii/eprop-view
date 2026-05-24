import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function migrate() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any
  try {
    const better = await import('better-sqlite3')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Database = (better as any).default
  } catch (e) {
    console.error('better-sqlite3 not available:', e)
    process.exit(1)
  }

  const db = new Database('./backend/db.sqlite3')

  // Migrate users
  const users = db.prepare('SELECT * FROM auth_user').all()
  for (const user of users) {
    const { data: authUser, error } = await supabase.auth.admin.createUser({
      email: user.username + '@eprop.local',
      password: user.username === 'admin' ? 'admin123' : 'inspect2024',
      email_confirm: true,
      user_metadata: { role: user.is_staff ? 'admin' : 'inspector' },
    })

    if (!error && authUser.user) {
      await supabase.from('profiles').insert({
        id: authUser.user.id,
        role: user.is_staff ? 'admin' : 'inspector',
      })
    }
  }

  // Migrate projects
  const projects = db.prepare('SELECT * FROM core_project').all()
  for (const project of projects) {
    await supabase.from('projects').insert({
      name: project.name,
      location: project.location,
      description: project.description,
      status: project.status,
      geom: project.latitude && project.longitude
        ? `SRID=4326;POINT(${project.longitude} ${project.latitude})`
        : null,
      created_at: project.created_at,
      updated_at: project.updated_at,
    })
  }

  // Add more tables as needed...

  db.close()
  console.log('Migration complete')
}

migrate().catch(console.error)
