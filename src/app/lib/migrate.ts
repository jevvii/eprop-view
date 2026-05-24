import { createClient } from '@supabase/supabase-js'

export interface MigrationResult {
  success: boolean
  message: string
  usersMigrated: number
  projectsMigrated: number
  errors: string[]
}

export async function runMigration(): Promise<MigrationResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const errors: string[] = []
  let usersMigrated = 0
  let projectsMigrated = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any
  try {
    const better = await import('better-sqlite3')
    Database = better.default
  } catch (e) {
    return { success: false, message: 'SQLite library not available', usersMigrated: 0, projectsMigrated: 0, errors: [String(e)] }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any = null
  try {
    db = new Database('./backend/db.sqlite3')

    // Migrate users
    const users = db.prepare('SELECT * FROM auth_user').all()
    for (const user of users) {
      const password = user.username === 'admin'
        ? (process.env.MIGRATION_ADMIN_PASSWORD || 'admin123')
        : (process.env.MIGRATION_DEFAULT_PASSWORD || 'inspect2024')

      const { data: authUser, error } = await supabase.auth.admin.createUser({
        email: user.username + '@eprop.local',
        password,
        email_confirm: true,
        user_metadata: { role: user.is_staff ? 'admin' : 'inspector' },
      })

      if (error) {
        errors.push(`User ${user.username}: ${error.message}`)
        continue
      }

      if (authUser.user) {
        const { error: insertError } = await supabase.from('profiles').insert({
          id: authUser.user.id,
          role: user.is_staff ? 'admin' : 'inspector',
        })
        if (insertError) {
          errors.push(`Profile ${user.username}: ${insertError.message}`)
        } else {
          usersMigrated++
        }
      }
    }

    // Migrate projects
    const projects = db.prepare('SELECT * FROM core_project').all()
    for (const project of projects) {
      const lat = Number(project.latitude)
      const lng = Number(project.longitude)
      const geom = !isNaN(lat) && !isNaN(lng) && project.latitude && project.longitude
        ? `SRID=4326;POINT(${lng} ${lat})`
        : null

      const { error } = await supabase.from('projects').insert({
        name: project.name,
        location: project.location,
        description: project.description,
        status: project.status,
        geom,
        created_at: project.created_at,
        updated_at: project.updated_at,
      })

      if (error) {
        errors.push(`Project ${project.name}: ${error.message}`)
      } else {
        projectsMigrated++
      }
    }

    return {
      success: errors.length === 0,
      message: `Migrated ${usersMigrated} users and ${projectsMigrated} projects`,
      usersMigrated,
      projectsMigrated,
      errors,
    }
  } catch (error) {
    return {
      success: false,
      message: String(error),
      usersMigrated,
      projectsMigrated,
      errors: [...errors, String(error)],
    }
  } finally {
    if (db) db.close()
  }
}
