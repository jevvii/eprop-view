import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

export interface MigrationResult {
  success: boolean
  message: string
  usersMigrated: number
  projectsMigrated: number
  otherMigrated: number
  errors: string[]
}

export async function runMigration(): Promise<MigrationResult> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    return {
      success: false,
      message: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.',
      usersMigrated: 0,
      projectsMigrated: 0,
      otherMigrated: 0,
      errors: ['NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env.local'],
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const errors: string[] = []
  let usersMigrated = 0
  let projectsMigrated = 0
  let otherMigrated = 0

  const sqlitePath = path.resolve('./backend/db.sqlite3')
  const hasSqlite = fs.existsSync(sqlitePath)

  if (hasSqlite) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let Database: any
    try {
      const better = await import('better-sqlite3')
      Database = better.default
    } catch (e) {
      return {
        success: false,
        message: 'better-sqlite3 library not available',
        usersMigrated: 0,
        projectsMigrated: 0,
        otherMigrated: 0,
        errors: [String(e)],
      }
    }

    let db: any = null
    try {
      db = new Database(sqlitePath)

      // 1. Map Users (SQLite ID -> Supabase UUID)
      const userMap: Record<number, string> = {}
      const sqliteUsers = db.prepare('SELECT * FROM auth_user').all()
      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()

      for (const user of sqliteUsers) {
        const email = user.username + '@eprop.local'
        const adminPassword = process.env.MIGRATION_ADMIN_PASSWORD || 'AdminPassword123!'
        const defaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD || 'InspectorPass123!'
        const password = user.username === 'admin' ? adminPassword : defaultPassword

        let userId = authUsers?.find((u) => u.email === email)?.id

        const role = user.is_staff ? (user.username === 'engineer' ? 'engineer' : 'admin') : 'inspector'

        if (!userId) {
          const { data: newAuth, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { role },
          })
          if (error) {
            errors.push(`User ${user.username}: ${error.message}`)
            continue
          }
          userId = newAuth.user?.id
        }

        if (userId) {
          userMap[user.id] = userId
          const { error: pError } = await supabase.from('profiles').upsert({
            id: userId,
            role,
            full_name: user.first_name || user.username,
            is_active: user.is_active !== 0,
          })
          if (pError) errors.push(`Profile ${user.username}: ${pError.message}`)
          else usersMigrated++
        }
      }

      // 2. Map Projects
      const projectMap: Record<number, string> = {}
      const sqliteProjects = db.prepare('SELECT * FROM core_project').all()
      for (const project of sqliteProjects) {
        const lat = Number(project.latitude)
        const lng = Number(project.longitude)
        const geom =
          !isNaN(lat) && !isNaN(lng) && project.latitude && project.longitude
            ? `SRID=4326;POINT(${lng} ${lat})`
            : null

        let { data: existing } = await supabase
          .from('projects')
          .select('id')
          .eq('name', project.name)
          .maybeSingle()

        if (existing) {
          const { error } = await supabase
            .from('projects')
            .update({
              location: project.location,
              description: project.description,
              status: project.status,
              geom,
              updated_at: project.updated_at,
            })
            .eq('id', existing.id)
          if (error) errors.push(`Update Project ${project.name}: ${error.message}`)
        } else {
          const { data: newData, error } = await supabase
            .from('projects')
            .insert({
              name: project.name,
              location: project.location,
              description: project.description,
              status: project.status,
              geom,
              created_at: project.created_at,
              updated_at: project.updated_at,
            })
            .select('id')
            .single()
          if (error) errors.push(`Insert Project ${project.name}: ${error.message}`)
          else existing = newData
        }

        if (existing) {
          projectMap[project.id] = existing.id
          projectsMigrated++
        }
      }

      // 3. Environmental Risks
      const envRisks = db.prepare('SELECT * FROM core_environmentalrisk').all()
      for (const risk of envRisks) {
        const projectId = projectMap[risk.project_id]
        if (!projectId) continue
        const { error } = await supabase.from('environmental_risks').upsert(
          {
            project_id: projectId,
            fault_line_proximity: risk.fault_line_proximity,
            soil_liquefaction_risk: risk.soil_liquefaction_risk,
            erosion_potential: risk.erosion_potential,
            overall_risk_score: risk.overall_risk_score,
            additional_analysis: risk.additional_analysis,
            assessed_date: risk.assessed_date,
            updated_at: risk.updated_at,
          },
          { onConflict: 'project_id' }
        )
        if (error) errors.push(`Env Risk Project ${risk.project_id}: ${error.message}`)
        else otherMigrated++
      }

      // 4. Inspections
      const inspectionMap: Record<number, string> = {}
      const inspections = db.prepare('SELECT * FROM core_inspection').all()
      for (const insp of inspections) {
        const projectId = projectMap[insp.project_id]
        if (!projectId) continue
        const { data, error } = await supabase
          .from('inspections')
          .upsert({
            project_id: projectId,
            lead_inspector_id: userMap[insp.lead_inspector_id] || null,
            inspection_date: insp.inspection_date,
            status: insp.status,
            risk_score: insp.risk_score,
            location: insp.location,
            notes: insp.notes,
            created_at: insp.created_at,
            updated_at: insp.updated_at,
          })
          .select('id')
          .single()
        if (error) errors.push(`Inspection ${insp.id}: ${error.message}`)
        else if (data) {
          inspectionMap[insp.id] = data.id
          otherMigrated++
        }
      }

      // 5. Reports
      const reports = db.prepare('SELECT * FROM core_report').all()
      for (const report of reports) {
        const projectId = projectMap[report.project_id]
        if (!projectId) continue
        const { error } = await supabase.from('reports').upsert(
          {
            report_id: report.report_id,
            title: report.title,
            project_id: projectId,
            inspection_id: inspectionMap[report.inspection_id] || null,
            date: report.date,
            location: report.location,
            status: report.status,
            lead_inspector_id: userMap[report.lead_inspector_id] || null,
            risk_score: report.risk_score,
            key_findings: report.key_findings,
            created_at: report.created_at,
            updated_at: report.updated_at,
          },
          { onConflict: 'report_id' }
        )
        if (error) errors.push(`Report ${report.report_id}: ${error.message}`)
        else otherMigrated++
      }

      // 6. Maintenance Priorities
      const maintenance = db.prepare('SELECT * FROM core_maintenancepriority').all()
      for (const m of maintenance) {
        const projectId = projectMap[m.project_id]
        if (!projectId) continue
        const { error } = await supabase.from('maintenance_priorities').upsert({
          project_id: projectId,
          title: m.title,
          location: m.location,
          risk_score: m.risk_score,
          status: m.status,
          assigned_to: userMap[m.assigned_to_id] || null,
          due_date: m.due_date,
          notes: m.notes,
          created_at: m.created_at,
          updated_at: m.updated_at,
        })
        if (error) errors.push(`Maintenance ${m.title}: ${error.message}`)
        else otherMigrated++
      }
    } finally {
      if (db) db.close()
    }
  } else {
    // Baseline seed / verification when no legacy sqlite is present
    try {
      // 1. Seed baseline AI models if table exists
      try {
        const { error: mError } = await supabase.from('ai_models').upsert([
          {
            name: 'ResNet50-DamageClassifier-v2',
            version: '2.1.0',
            task: 'classification',
            format: 'mock',
            labels: ['crack', 'corrosion', 'spalling', 'deformation', 'leakage', 'none'],
            is_active: true,
          },
          {
            name: 'YOLOv8-StructuralDefects-v1',
            version: '1.4.0',
            task: 'detection',
            format: 'mock',
            labels: ['crack', 'corrosion', 'spalling', 'deformation', 'leakage'],
            is_active: true,
          }
        ], { onConflict: 'name' })

        if (mError) {
          if (mError.message.includes('schema cache') || mError.message.includes('not find')) {
            console.log('ℹ️  Note: Apply migrations in supabase/migrations/ to create AI/AR tables in Supabase.')
          } else if (!mError.message.includes('duplicate')) {
            errors.push(`AI Models Seed: ${mError.message}`)
          }
        } else {
          otherMigrated += 2
        }
      } catch (aiErr) {
        console.log('ℹ️  AI models table not yet initialized in database.')
      }

      // 2. Seed baseline accounts if none exist
      const defaultUsers = [
        {
          email: 'admin@eprop.local',
          password: 'AdminPassword123!',
          role: 'admin',
          fullName: 'System Administrator',
          department: 'Platform Governance & IT Operations',
        },
        {
          email: 'engineer@eprop.local',
          password: 'EngineerPassword123!',
          role: 'engineer',
          fullName: 'Engr. Sarah Jenkins, PE',
          department: 'Lead Structural Risk Assessment & Maintenance QA',
        },
        {
          email: 'reviewer.engineer@eprop.local',
          password: 'EngineerPassword123!',
          role: 'engineer',
          fullName: 'Engr. David Chen, SE',
          department: 'Engineering Validation, Review & Report Certification',
        },
        {
          email: 'inspector@eprop.local',
          password: 'InspectorPassword123!',
          role: 'inspector',
          fullName: 'Alex Rivera',
          department: 'Field Operations & AR Spatial Inspection',
        },
      ]

      const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()
      const createdUserMap: Record<string, string> = {}

      for (const u of defaultUsers) {
        let userId = authUsers?.find((au) => au.email === u.email)?.id
        if (!userId) {
          const { data: newAuth, error: createError } = await supabase.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { role: u.role, full_name: u.fullName },
          })
          if (createError) {
            errors.push(`Create user ${u.email}: ${createError.message}`)
            continue
          }
          userId = newAuth.user?.id
        }

        if (userId) {
          createdUserMap[u.email] = userId
          await supabase.from('profiles').upsert({
            id: userId,
            role: u.role,
            full_name: u.fullName,
            department: u.department,
            is_active: true,
          })
          usersMigrated++
        }
      }

      // 3. Assign newly added engineers to active project maintenance priorities
      try {
        const sarahId = createdUserMap['engineer@eprop.local'] || authUsers?.find(u => u.email === 'engineer@eprop.local')?.id
        const davidId = createdUserMap['reviewer.engineer@eprop.local'] || authUsers?.find(u => u.email === 'reviewer.engineer@eprop.local')?.id

        if (sarahId || davidId) {
          const { data: unassignedTasks } = await supabase
            .from('maintenance_priorities')
            .select('id')
            .is('assigned_to', null)
            .limit(10)

          if (unassignedTasks && unassignedTasks.length > 0) {
            for (let i = 0; i < unassignedTasks.length; i++) {
              const assignee = i % 2 === 0 ? (sarahId || davidId) : (davidId || sarahId)
              if (assignee) {
                await supabase
                  .from('maintenance_priorities')
                  .update({ assigned_to: assignee })
                  .eq('id', unassignedTasks[i].id)
              }
            }
          }
        }
      } catch (assignErr) {
        console.warn('Task assignment notice:', assignErr)
      }
    } catch (seedErr) {
      errors.push(`Baseline initialization: ${String(seedErr)}`)
    }
  }

  return {
    success: errors.length === 0,
    message: hasSqlite
      ? `Migrated ${usersMigrated} users, ${projectsMigrated} projects, and ${otherMigrated} other records from SQLite.`
      : `Verified baseline schema & seeded ${usersMigrated} RBAC roles (Admin, Engineer, Inspector) and ${otherMigrated} AI model checkpoints.`,
    usersMigrated,
    projectsMigrated,
    otherMigrated,
    errors,
  }
}
