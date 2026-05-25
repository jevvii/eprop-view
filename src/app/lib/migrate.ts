import { createClient } from '@supabase/supabase-js'

export interface MigrationResult {
  success: boolean
  message: string
  usersMigrated: number
  projectsMigrated: number
  otherMigrated: number
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
  let otherMigrated = 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Database: any
  try {
    const better = await import('better-sqlite3')
    Database = better.default
  } catch (e) {
    return { success: false, message: 'SQLite library not available', usersMigrated: 0, projectsMigrated: 0, otherMigrated: 0, errors: [String(e)] }
  }

  let db: any = null
  try {
    db = new Database('./backend/db.sqlite3')

    // 1. Map Users (SQLite ID -> Supabase UUID)
    const userMap: Record<number, string> = {}
    const sqliteUsers = db.prepare('SELECT * FROM auth_user').all()
    const { data: { users: authUsers } } = await supabase.auth.admin.listUsers()

    for (const user of sqliteUsers) {
      const email = user.username + '@eprop.local'
      const adminPassword = process.env.MIGRATION_ADMIN_PASSWORD
      const defaultPassword = process.env.MIGRATION_DEFAULT_PASSWORD
      const password = user.username === 'admin' ? adminPassword : defaultPassword

      let userId = authUsers.find(u => u.email === email)?.id

      if (!userId) {
        const { data: newAuth, error } = await supabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { role: user.is_staff ? 'admin' : 'inspector' },
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
          role: user.is_staff ? 'admin' : 'inspector',
          full_name: user.first_name || user.username,
          is_active: user.is_active !== 0 // SQLite boolean handling if column exists
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
      const geom = !isNaN(lat) && !isNaN(lng) && project.latitude && project.longitude
        ? `SRID=4326;POINT(${lng} ${lat})`
        : null

      // Manual lookup to avoid upsert constraint requirement
      let { data: existing } = await supabase.from('projects').select('id').eq('name', project.name).maybeSingle()
      
      if (existing) {
        const { error } = await supabase.from('projects').update({
          location: project.location,
          description: project.description,
          status: project.status,
          geom,
          updated_at: project.updated_at,
        }).eq('id', existing.id)
        if (error) errors.push(`Update Project ${project.name}: ${error.message}`)
      } else {
        const { data: newData, error } = await supabase.from('projects').insert({
          name: project.name,
          location: project.location,
          description: project.description,
          status: project.status,
          geom,
          created_at: project.created_at,
          updated_at: project.updated_at,
        }).select('id').single()
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
      const { error } = await supabase.from('environmental_risks').upsert({
        project_id: projectId,
        fault_line_proximity: risk.fault_line_proximity,
        soil_liquefaction_risk: risk.soil_liquefaction_risk,
        erosion_potential: risk.erosion_potential,
        overall_risk_score: risk.overall_risk_score,
        additional_analysis: risk.additional_analysis,
        assessed_date: risk.assessed_date,
        updated_at: risk.updated_at,
      }, { onConflict: 'project_id' })
      if (error) errors.push(`Env Risk Project ${risk.project_id}: ${error.message}`)
      else otherMigrated++
    }

    // 4. Geospatial Zones
    const zones = db.prepare('SELECT * FROM core_geospatialzone').all()
    for (const zone of zones) {
      const projectId = projectMap[zone.project_id]
      if (!projectId) continue
      
      let geom = null
      try {
        const coords = JSON.parse(zone.coordinates)
        if (coords && coords.length > 0) {
          const ring = coords.map((p: any) => `${p[0]} ${p[1]}`).join(',')
          geom = `SRID=4326;POLYGON((${ring}))`
        }
      } catch (e) {}

      const { data: existing } = await supabase.from('geospatial_zones').select('id').eq('project_id', projectId).eq('name', zone.name).maybeSingle()

      if (existing) {
        const { error } = await supabase.from('geospatial_zones').update({
          zone_type: zone.zone_type,
          risk_level: zone.risk_level,
          geom,
          description: zone.description,
        }).eq('id', existing.id)
        if (error) errors.push(`Update Zone ${zone.name}: ${error.message}`)
      } else {
        const { error } = await supabase.from('geospatial_zones').insert({
          project_id: projectId,
          name: zone.name,
          zone_type: zone.zone_type,
          risk_level: zone.risk_level,
          geom,
          description: zone.description,
          created_at: zone.created_at,
        })
        if (error) errors.push(`Insert Zone ${zone.name}: ${error.message}`)
      }
      
      if (!errors.some(e => e.includes(zone.name))) {
        otherMigrated++
      }
    }

    // 5. Inspections
    const inspectionMap: Record<number, string> = {}
    const inspections = db.prepare('SELECT * FROM core_inspection').all()
    for (const insp of inspections) {
      const projectId = projectMap[insp.project_id]
      if (!projectId) continue
      const { data, error } = await supabase.from('inspections').upsert({
        project_id: projectId,
        lead_inspector_id: userMap[insp.lead_inspector_id] || null,
        inspection_date: insp.inspection_date,
        status: insp.status,
        risk_score: insp.risk_score,
        location: insp.location,
        notes: insp.notes,
        created_at: insp.created_at,
        updated_at: insp.updated_at,
      }).select('id').single()
      if (error) errors.push(`Inspection ${insp.id}: ${error.message}`)
      else if (data) {
        inspectionMap[insp.id] = data.id
        otherMigrated++
      }
    }

    // 6. Reports
    const reports = db.prepare('SELECT * FROM core_report').all()
    for (const report of reports) {
      const projectId = projectMap[report.project_id]
      if (!projectId) continue
      const { error } = await supabase.from('reports').upsert({
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
      }, { onConflict: 'report_id' })
      if (error) errors.push(`Report ${report.report_id}: ${error.message}`)
      else otherMigrated++
    }

    // 7. Maintenance Priorities
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

    // 8. Damage Trends
    const trends = db.prepare('SELECT * FROM core_damagetrend').all()
    for (const t of trends) {
      const projectId = projectMap[t.project_id]
      if (!projectId) continue
      const { error } = await supabase.from('damage_trends').upsert({
        project_id: projectId,
        date: t.date,
        severity: t.severity,
        value: t.value,
        notes: t.notes,
      }, { onConflict: 'project_id, date, severity' })
      if (error) errors.push(`Trend ${t.id}: ${error.message}`)
      else otherMigrated++
    }

    // 9. Risk Hotspots
    const hotspots = db.prepare('SELECT * FROM core_riskhotspot').all()
    for (const h of hotspots) {
      const projectId = projectMap[h.project_id]
      if (!projectId) continue
      
      const lat = Number(h.latitude)
      const lng = Number(h.longitude)
      const geom = !isNaN(lat) && !isNaN(lng) && h.latitude && h.longitude
        ? `SRID=4326;POINT(${lng} ${lat})`
        : null

      const { error } = await supabase.from('risk_hotspots').upsert({
        project_id: projectId,
        title: h.title,
        severity: h.severity,
        description: h.description,
        position_x: h.position_x,
        position_y: h.position_y,
        geom,
        created_at: h.created_at,
      })
      if (error) errors.push(`Hotspot ${h.title}: ${error.message}`)
      else otherMigrated++
    }

    return {
      success: errors.length === 0,
      message: `Migrated ${usersMigrated} users, ${projectsMigrated} projects, and ${otherMigrated} other records`,
      usersMigrated,
      projectsMigrated,
      otherMigrated,
      errors,
    }
  } catch (error) {
    return {
      success: false,
      message: String(error),
      usersMigrated,
      projectsMigrated,
      otherMigrated,
      errors: [...errors, String(error)],
    }
  } finally {
    if (db) db.close()
  }
}
