'use client'

import { useWorkspaceFilters } from '@/components/shared/report-filters'
import { getFilteredRecordIds } from '@/app/actions/filters'
import { getSettlementOverview } from '@/app/actions/structural'
import { useQuery } from '@tanstack/react-query'
import { createClient } from './supabase/client'
import { resolveEvidenceLocation } from './storage-location'
import { getAllProfilesWithEmails } from '@/app/actions/admin'
import {
  getActiveAIModels,
  getDetectionsForImage,
  getAnalysisJobsForImage,
  getDetectionsForInspection,
  getAllAIDetections,
} from '@/app/actions/ai'
import {
  getActiveARSession,
  getARAnchorsForInspection,
  getAllARAnchors,
} from '@/app/actions/ar'
import type {
  Project,
  Report,
  Inspection,
  DashboardStats,
  EnvironmentalRisk,
  RiskHotspot,
  MaintenancePriority,
  DamageTrend,
  GeospatialZone,
  InspectionImage,
  ImageComment,
  Profile,
  Role,
  AIModel,
  AIDamageDetection,
  AIAnalysisJob,
  ARSession,
  ARAnchor,
} from '@/app/types'

let client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!client) client = createClient()
  return client
}

export function useProjects() {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<Project[]> => {
      const { data, error } = await getClient().from('projects').select('*').order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((p: any) => ({
        ...p,
        latitude: p.geom?.coordinates?.[1] ?? null,
        longitude: p.geom?.coordinates?.[0] ?? null,
      }))
    },
  })
}

export function useReports(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['reports', projectId, filters],
    queryFn: async (): Promise<Report[]> => {
      const matched=await getFilteredRecordIds('reports',filters)
      if(!matched.length)return []

      const baseMapper = (report: any) => ({
        ...report,
        project_name: typeof report.project_name === 'string'
          ? report.project_name
          : report.project_name?.name ?? '',
        lead_inspector_name: typeof report.lead_inspector_name === 'string'
          ? report.lead_inspector_name
          : report.lead_inspector_name?.full_name ?? '',
        created_by_name: typeof report.created_by_name === 'string'
          ? report.created_by_name
          : report.created_by_name?.full_name ?? '',
        reviewed_by_name: typeof report.reviewed_by_name === 'string'
          ? report.reviewed_by_name
          : report.reviewed_by_name?.full_name ?? '',
        last_edited_by_name: typeof report.last_edited_by_name === 'string'
          ? report.last_edited_by_name
          : report.last_edited_by_name?.full_name ?? '',
      })

      let query = getClient()
        .from('reports')
        .select(`
          *,
          project_name:projects(name),
          lead_inspector_name:profiles!reports_lead_inspector_id_fkey(full_name),
          created_by_name:profiles!reports_created_by_fkey(full_name),
          reviewed_by_name:profiles!reports_reviewed_by_fkey(full_name),
          last_edited_by_name:profiles!reports_last_edited_by_fkey(full_name)
        `)
        .order('date', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query.in('id', matched)

      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Reports audit trail query failed, attempting resilient fallback:', error)
        }
        let fallbackQuery = getClient()
          .from('reports')
          .select('*, project_name:projects(name)')
          .order('date', { ascending: false })
        if (projectId) fallbackQuery = fallbackQuery.eq('project_id', projectId)
        const { data: fallbackData, error: fallbackError } = await fallbackQuery.in('id',matched)
        if (fallbackError) throw error
        return (fallbackData || []).map((report: any) => ({
          ...baseMapper(report),
          lead_inspector_name: '',
          created_by_name: '',
          reviewed_by_name: '',
          last_edited_by_name: '',
        }))
      }

      return (data || []).map(baseMapper)
    },
  })
}

export function useMyInspections(projectId?: string) {
  return useQuery({
    queryKey: ['my-inspections', projectId],
    queryFn: async (): Promise<Inspection[]> => {
      const { data: authData } = await getClient().auth.getUser()
      if (!authData?.user) return []

      let query = getClient()
        .from('inspections')
        .select('*')
        .eq('lead_inspector_id', authData.user.id)
        .order('inspection_date', { ascending: false })

      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useInspections(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  const { data: profile } = useProfile()
  const isInspector = profile?.role === 'inspector'
  const userId = profile?.id

  return useQuery({
    queryKey: ['inspections', projectId, isInspector ? userId : 'all', filters],
    queryFn: async (): Promise<Inspection[]> => {
      const matched=await getFilteredRecordIds('inspections',filters)
      if(!matched.length)return []

      let query = getClient().from('inspections').select('*').order('inspection_date', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      if (isInspector && userId) {
        query = query.eq('lead_inspector_id', userId)
      }
      const { data, error } = await query.in('id', matched)
      if (error) throw error
      return data || []
    },
  })
}

export function useDashboardStats() {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['stats',filters],
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await getClient().rpc('filtered_dashboard_stats',{p_filters:filters})
      if (error) throw error
      return data as DashboardStats
    },
  })
}

export function useEnvironmentalRisk(projectId: string) {
  return useQuery({
    queryKey: ['environmental-risk', projectId],
    queryFn: async (): Promise<EnvironmentalRisk | null> => {
      const { data, error } = await getClient().from('environmental_risks').select('*').eq('project_id', projectId).single()
      if (error && error.code !== 'PGRST116') throw error
      return data
    },
    enabled: !!projectId,
  })
}

export function useRiskHotspots(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['risk-hotspots', projectId, filters],
    queryFn: async (): Promise<RiskHotspot[]> => {
      const matched=await getFilteredRecordIds('hotspots',filters)
      if(!matched.length)return []

      let query = getClient().from('risk_hotspots').select('*').order('severity', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query.in('id', matched)
      if (error) throw error
      return (data || []).map((h: any) => {
        const lat = h.geom?.coordinates?.[1] ?? h.latitude ?? null
        const lng = h.geom?.coordinates?.[0] ?? h.longitude ?? null



        return {
          ...h,
          latitude: lat,
          longitude: lng,
        }
      })
    },
  })
}

export function useMaintenancePriorities(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['maintenance', projectId, filters],
    queryFn: async (): Promise<MaintenancePriority[]> => {
      const matched=await getFilteredRecordIds('maintenance',filters)
      if(!matched.length)return []

      let query = getClient()
        .from('maintenance_priorities')
        .select('*, assigned_to_name:profiles(full_name)')
        .order('risk_score', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query.in('id', matched)
      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Maintenance priorities query failed, falling back to unjoined fetch:', error)
        }
        let fallbackQuery = getClient()
          .from('maintenance_priorities')
          .select('*')
          .order('risk_score', { ascending: false })
        if (projectId) fallbackQuery = fallbackQuery.eq('project_id', projectId)
        const { data: fallbackData, error: fallbackError } = await fallbackQuery.in('id',matched)
        if (fallbackError) throw error
        return (fallbackData || []).map((m: any) => ({
          ...m,
          assigned_to_name: 'Unassigned',
        }))
      }
      return (data || []).map((m: any) => ({
        ...m,
        assigned_to_name:
          typeof m.assigned_to_name === 'string'
            ? m.assigned_to_name
            : m.assigned_to_name?.full_name ?? '',
      }))
    },
  })
}

export function useDamageTrends(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['damage-trends', projectId,filters],
    queryFn: async (): Promise<DamageTrend[]> => {
      const { data, error } = await getClient().rpc('filtered_damage_trends', { p_filters: filters })
      if (error) throw error
      return projectId ? (data || []).filter((row: DamageTrend) => row.project_id === projectId) : data || []
    },
  })
}

export function useGeospatialZones(projectId?: string) {
  return useQuery({
    queryKey: ['geospatial-zones', projectId],
    queryFn: async (): Promise<GeospatialZone[]> => {
      let query = getClient().from('geospatial_zones').select('*').order('name', { ascending: true })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map((z: any) => ({
        ...z,
        coordinates:
          z.geom?.type === 'LineString'
            ? (z.geom.coordinates ?? [])
            : z.geom?.type === 'MultiLineString'
            ? (z.geom.coordinates?.[0] ?? [])
            : z.geom?.coordinates?.[0] ?? [],
      }))
    },
  })
}

export function useInspectionImages(inspectionId?: string) {
  return useQuery({
    queryKey: ['inspection-images', inspectionId],
    enabled: !!inspectionId,
    queryFn: async (): Promise<InspectionImage[]> => {
      if (!inspectionId) return []
      
      const mapResults = async (rows: any[]) => {
        return Promise.all(
          rows.map(async (image) => {
            const location = resolveEvidenceLocation(image)
            const { data: signedData, error: signedError } = await getClient()
              .storage
              .from(location.bucket)
              .createSignedUrl(location.path, 60 * 60)
            
            return {
              ...image,
              uploader_name: typeof image.uploader_name === 'string' 
                ? image.uploader_name 
                : image.uploader_name?.full_name ?? 'System',
              comment_count: Array.isArray(image.comment_count) ? 0 : (image.comment_count as any)?.count ?? 0,
              signed_url: signedError ? null : signedData?.signedUrl ?? null,
            }
          })
        )
      }

      // Try fetching with all audit/comment metadata
      const { data, error } = await getClient()
        .from('inspection_images')
        .select('*, uploader_name:profiles!uploader_id(full_name), comment_count:image_comments(count)')
        .eq('inspection_id', inspectionId)
        .order('uploaded_at', { ascending: false })

      if (error) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn('Vault audit or commenting query failed, falling back to basic fetching:', error)
        }
        // Fallback to basic image fetching
        const { data: fallbackData, error: fallbackError } = await getClient()
          .from('inspection_images')
          .select('*')
          .eq('inspection_id', inspectionId)
          .order('uploaded_at', { ascending: false })
        
        if (fallbackError) throw error
        return mapResults(fallbackData || [])
      }

      return mapResults(data || [])
    },
    staleTime: 1000 * 60 * 5, // Cache signed URLs for 5 mins
  })
}

export function useImageComments(imageId: string) {
  return useQuery({
    queryKey: ['image-comments', imageId],
    enabled: !!imageId,
    queryFn: async (): Promise<ImageComment[]> => {
      const { data, error } = await getClient()
        .from('image_comments')
        .select('*, author_name:profiles!author_id(full_name, role)')
        .eq('image_id', imageId)
        .order('created_at', { ascending: true })
      
      if (error) throw error
      
      return (data || []).map((c: any) => ({
        ...c,
        author_name: c.author_name?.full_name ?? 'Node',
        author_role: c.author_name?.role ?? 'viewer',
      }))
    },
  })
}

export function useUnreadAssetNotifications() {
  return useQuery({
    queryKey: ['unread-asset-notifications'],
    queryFn: async (): Promise<number> => {
      const { data, error } = await getClient().rpc('get_unread_image_comment_count')
      if (error) {
        if (error.code === 'PGRST202') return 0 // Function missing
        throw error
      }
      return Number(data || 0)
    },
    refetchInterval: 15000, // Poll every 15s for "real-time" notifications
  })
}

export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<Profile> => {
      const { data: authData, error: authError } = await getClient().auth.getUser()
      if (authError || !authData.user) {
        throw authError ?? new Error('Not authenticated')
      }

      const { data, error } = await getClient()
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .maybeSingle()

      if (error || !data) {
        throw error ?? new Error('Profile not found')
      }

      // Authorization is driven by the profile row only. user_metadata is
      // writable by the user and must not decide a role.
      return {
        id: authData.user.id,
        role: data.role as Role,
        full_name: data.full_name || authData.user.email?.split('@')[0] || 'User',
        phone: data.phone || '',
        department: data.department || 'Engineering & Inspection',
        created_at: data.created_at || authData.user.created_at || new Date().toISOString(),
        email: authData.user.email ?? '',
        is_active: data.is_active !== false,
      }
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  })
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ['all-profiles'],
    queryFn: async (): Promise<Profile[]> => {
      return getAllProfilesWithEmails()
    },
  })
}

// AI Module hooks
export function useAIModels() {
  return useQuery({
    queryKey: ['ai-models'],
    queryFn: async (): Promise<AIModel[]> => {
      return getActiveAIModels()
    },
  })
}

export function useAdminAIModels() {
  return useQuery({
    queryKey: ['admin-ai-models'],
    queryFn: async (): Promise<AIModel[]> => {
      const { getAdminAIModels } = await import('@/app/actions/admin')
      return getAdminAIModels()
    },
  })
}

export function useStaffProfiles() {
  return useQuery({
    queryKey: ['staff-profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await getClient()
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'engineer', 'inspector'])
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (error) {
        console.warn('Error fetching staff profiles:', error)
        return []
      }

      return (data || []).map((p: any) => {
        const isEng = p.role === 'engineer' || (p.department && p.department.toLowerCase().includes('engineer'))
        return {
          id: p.id,
          role: (isEng ? 'engineer' : p.role) as Role,
          full_name: p.full_name || 'Staff Member',
          phone: p.phone || '',
          department: p.department || 'Engineering & Inspection',
          created_at: p.created_at,
          email: '',
          is_active: p.is_active !== false,
        }
      })
    },
  })
}

export function useAIDetections(imageId?: string) {
  return useQuery({
    queryKey: ['ai-detections', imageId],
    enabled: !!imageId,
    queryFn: async (): Promise<AIDamageDetection[]> => {
      if (!imageId) return []
      return getDetectionsForImage(imageId)
    },
  })
}

export function useAIDetectionsForInspection(inspectionId?: string) {
  return useQuery({
    queryKey: ['ai-detections-inspection', inspectionId],
    enabled: !!inspectionId,
    queryFn: async (): Promise<AIDamageDetection[]> => {
      if (!inspectionId) return []
      return getDetectionsForInspection(inspectionId)
    },
  })
}

export function useAllAIDetections(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['all-ai-detections', projectId, filters],
    queryFn: async (): Promise<AIDamageDetection[]> => {
      return getAllAIDetections(projectId,filters)
    },
  })
}

export function useAIAnalysisJobs(imageId?: string) {
  return useQuery({
    queryKey: ['ai-jobs', imageId],
    enabled: !!imageId,
    queryFn: async (): Promise<AIAnalysisJob[]> => {
      if (!imageId) return []
      return getAnalysisJobsForImage(imageId)
    },
  })
}

// AR Module hooks
export function useARSession(inspectionId?: string) {
  return useQuery({
    queryKey: ['ar-session', inspectionId],
    enabled: !!inspectionId,
    queryFn: async (): Promise<ARSession | null> => {
      if (!inspectionId) return null
      return getActiveARSession(inspectionId)
    },
  })
}

export function useARAnchors(inspectionId?: string) {
  return useQuery({
    queryKey: ['ar-anchors', inspectionId],
    enabled: !!inspectionId,
    queryFn: async (): Promise<ARAnchor[]> => {
      if (!inspectionId) return []
      return getARAnchorsForInspection(inspectionId)
    },
  })
}

export function useAllARAnchors(projectId?: string) {
  const {filters}=useWorkspaceFilters()
  return useQuery({
    queryKey: ['all-ar-anchors', projectId, filters],
    queryFn: async (): Promise<ARAnchor[]> => {
      return getAllARAnchors(projectId,filters)
    },
  })
}

// Building Master Data queries (Phase C)
export function useBuildings(projectId?: string) {
  return useQuery({
    queryKey: ['buildings', projectId],
    queryFn: async () => {
      const { getBuildings } = await import('@/app/actions/buildings')
      return getBuildings(projectId)
    },
  })
}

export function useFloors(buildingId?: string) {
  return useQuery({
    queryKey: ['floors', buildingId],
    enabled: buildingId !== undefined,
    queryFn: async () => {
      const { getFloors } = await import('@/app/actions/buildings')
      return getFloors(buildingId)
    },
  })
}

export function useStructuralElements(floorId?: string) {
  return useQuery({
    queryKey: ['structural-elements', floorId],
    enabled: floorId !== undefined,
    queryFn: async () => {
      const { getStructuralElements } = await import('@/app/actions/buildings')
      return getStructuralElements(floorId)
    },
  })
}

/**
 * A single report by primary key, for the review workbench.
 *
 * The list query selects a page of reports; the workbench needs one row with its
 * joined names, so it fetches directly rather than filtering the list.
 */
export function useReport(reportId?: string) {
  return useQuery({
    queryKey: ['report', reportId],
    enabled: Boolean(reportId),
    queryFn: async (): Promise<Report | null> => {
      if (!reportId) return null
      const { data, error } = await getClient()
        .from('reports')
        .select('*, project_name:projects(name), lead_inspector_name:profiles!reports_lead_inspector_id_fkey(full_name)')
        .eq('id', reportId)
        .maybeSingle()

      if (error) throw error
      if (!data) return null

      return {
        ...data,
        project_name:
          typeof data.project_name === 'string' ? data.project_name : data.project_name?.name ?? '',
        lead_inspector_name:
          typeof data.lead_inspector_name === 'string'
            ? data.lead_inspector_name
            : data.lead_inspector_name?.full_name ?? '',
      } as Report
    },
  })
}



export function useSettlementOverview() {
  const { filters } = useWorkspaceFilters()
  return useQuery({
    queryKey: ['settlement-overview', filters],
    queryFn: async () => {
      // Building-only observations need no inspection link. Apply their own
      // measured date; use inspection matching for defect/status/risk filters.
      const needsInspection = Object.entries(filters).some(([key, value]) =>
        !['building', 'from', 'to'].includes(key) && value !== '' && value !== 'all')
      const [rows, matching] = await Promise.all([
        getSettlementOverview(),
        needsInspection ? getFilteredRecordIds('inspections', filters) : Promise.resolve<string[]>([]),
      ])
      const ids = new Set(matching)
      return rows.filter(row =>
        (!filters.building || row.building_id === filters.building) &&
        (!filters.from || row.observed_at.slice(0, 10) >= filters.from) &&
        (!filters.to || row.observed_at.slice(0, 10) <= filters.to) &&
        (!needsInspection || (row.inspection_id !== null && ids.has(row.inspection_id))))
    },
  })
}
