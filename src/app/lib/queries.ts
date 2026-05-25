'use client'

import { useQuery } from '@tanstack/react-query'
import { createClient } from './supabase/client'
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
  Profile,
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
      return (data || []).map((p) => ({
        ...p,
        latitude: p.geom?.coordinates?.[1] ?? null,
        longitude: p.geom?.coordinates?.[0] ?? null,
      }))
    },
  })
}

export function useReports(projectId?: string) {
  return useQuery({
    queryKey: ['reports', projectId],
    queryFn: async (): Promise<Report[]> => {
      let query = getClient().from('reports').select('*, project_name:projects(name), lead_inspector_name:profiles(full_name)').order('date', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useInspections(projectId?: string) {
  return useQuery({
    queryKey: ['inspections', projectId],
    queryFn: async (): Promise<Inspection[]> => {
      let query = getClient().from('inspections').select('*').order('inspection_date', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useDashboardStats() {
  return useQuery({
    queryKey: ['stats'],
    queryFn: async (): Promise<DashboardStats> => {
      const { data, error } = await getClient().rpc('get_dashboard_stats')
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
  return useQuery({
    queryKey: ['risk-hotspots', projectId],
    queryFn: async (): Promise<RiskHotspot[]> => {
      let query = getClient().from('risk_hotspots').select('*').order('severity', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return (data || []).map((h) => ({
        ...h,
        latitude: h.geom?.coordinates?.[1] ?? null,
        longitude: h.geom?.coordinates?.[0] ?? null,
      }))
    },
  })
}

export function useMaintenancePriorities(projectId?: string) {
  return useQuery({
    queryKey: ['maintenance', projectId],
    queryFn: async (): Promise<MaintenancePriority[]> => {
      let query = getClient().from('maintenance_priorities').select('*, assigned_to_name:profiles(full_name)').order('risk_score', { ascending: false })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return data || []
    },
  })
}

export function useDamageTrends(projectId?: string) {
  return useQuery({
    queryKey: ['damage-trends', projectId],
    queryFn: async (): Promise<DamageTrend[]> => {
      let query = getClient().from('damage_trends').select('*').order('date', { ascending: true })
      if (projectId) query = query.eq('project_id', projectId)
      const { data, error } = await query
      if (error) throw error
      return data || []
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
      return (data || []).map((z) => ({
        ...z,
        coordinates: z.geom?.coordinates?.[0] ?? [],
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
      const { data, error } = await getClient()
        .from('inspection_images')
        .select('*')
        .eq('inspection_id', inspectionId)
        .order('uploaded_at', { ascending: false })
      if (error) throw error

      const results = await Promise.all(
        (data || []).map(async (image) => {
          const { data: signedData, error: signedError } = await getClient()
            .storage
            .from('inspection-images')
            .createSignedUrl(image.storage_path, 60 * 60)
          return {
            ...image,
            signed_url: signedError ? null : signedData?.signedUrl ?? null,
          }
        })
      )
      return results
    },
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
        .single()
      if (error) throw error

      return {
        ...data,
        email: authData.user.email ?? '',
      }
    },
  })
}

export function useAllProfiles() {
  return useQuery({
    queryKey: ['all-profiles'],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await getClient()
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) throw error
      return data || []
    },
  })
}
