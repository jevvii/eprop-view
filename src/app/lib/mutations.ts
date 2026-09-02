'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from './supabase/client'
import { runAIAnalysis, verifyDetection, updateAIDetection } from '@/app/actions/ai'
import { startARSession, endARSession, createARAnchor } from '@/app/actions/ar'
import { toggleAIModelStatus, registerAIModel, updateUserRole } from '@/app/actions/admin'
import { createInspection } from '@/app/actions/inspections'
import { createReportAction, updateReportAction } from '@/app/actions/reports'
import { addImageCommentAction, markCommentsReadAction } from '@/app/actions/comments'
import { upsertEnvironmentalRiskAction, updateEnvironmentalRiskAction } from '@/app/actions/environmental'
import { createMaintenanceTaskAction, updateMaintenanceTaskAction } from '@/app/actions/maintenance'
import type {
  Report,
  Inspection,
  EnvironmentalRisk,
  Profile,
  Role,
  MaintenancePriority,
  MaintenanceStatus,
  AIModelTask,
  AIModelFormat,
  ARPose,
  Vector3,
  DamageType,
  SeverityLevel,
} from '@/app/types'

let client: ReturnType<typeof createClient> | null = null
function getClient() {
  if (!client) client = createClient()
  return client
}

export function useCreateInspection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (inspection: unknown) => {
      return createInspection(inspection)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useCreateReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (report: unknown) => {
      return createReportAction(report)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useUpdateReport() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
      previousStatus,
    }: {
      id: string
      updates: Partial<Pick<Report, 'status' | 'risk_score' | 'key_findings'>>
      previousStatus?: Report['status']
    }) => {
      return updateReportAction(id, updates, previousStatus)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reports'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useAddComment() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      imageId,
      content,
    }: {
      imageId: string
      content: string
    }) => {
      return addImageCommentAction(imageId, content)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['image-comments', variables.imageId] })
      queryClient.invalidateQueries({ queryKey: ['inspection-images'] })
    },
  })
}

export function useMarkCommentsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (imageId: string) => {
      return markCommentsReadAction(imageId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['unread-asset-notifications'] })
    },
  })
}

export function useUpdateEnvironmentalRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, project_id, ...updates }: Partial<EnvironmentalRisk> & { id: string; project_id: string }) => {
      void project_id
      return updateEnvironmentalRiskAction(id, updates)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environmental-risk', variables.project_id] })
    },
  })
}

export function useUpsertEnvironmentalRisk() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (payload: Partial<EnvironmentalRisk> & { project_id: string }) => {
      return upsertEnvironmentalRiskAction(payload)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['environmental-risk', variables.project_id] })
    },
  })
}

export function useUpdateProfile() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (updates: Partial<Profile>) => {
      const { data: authData, error: authError } = await getClient().auth.getUser()
      if (authError || !authData.user) {
        throw authError ?? new Error('Not authenticated')
      }

      const { data, error } = await getClient()
        .from('profiles')
        .update(updates)
        .eq('id', authData.user.id)
        .select()
        .single()
      if (error) throw error
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

// AI Module mutations
export function useRunAIAnalysis() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ imageId, modelId }: { imageId: string; modelId?: string }) => {
      return runAIAnalysis(imageId, modelId)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ai-detections', variables.imageId] })
      queryClient.invalidateQueries({ queryKey: ['ai-detections-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['all-ai-detections'] })
      queryClient.invalidateQueries({ queryKey: ['ai-jobs', variables.imageId] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
      queryClient.invalidateQueries({ queryKey: ['inspection'] })
    },
  })
}

export function useVerifyDetection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      detectionId,
      approved,
      notes,
    }: {
      detectionId: string
      approved: boolean
      notes?: string
    }) => {
      return verifyDetection(detectionId, approved, notes)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-detections', data.image_id] })
      queryClient.invalidateQueries({ queryKey: ['ai-detections-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['all-ai-detections'] })
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
  })
}

// AR Module mutations
export function useStartARSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      inspectionId,
      deviceInfo,
    }: {
      inspectionId: string
      deviceInfo?: Record<string, unknown>
    }) => {
      return startARSession(inspectionId, deviceInfo)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ar-session', variables.inspectionId] })
    },
  })
}

export function useEndARSession() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ sessionId, inspectionId }: { sessionId: string; inspectionId: string }) => {
      return endARSession(sessionId)
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ar-session', variables.inspectionId] })
    },
  })
}

export function useCreateARAnchor() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      sessionId,
      inspectionId,
      label,
      pose,
      worldPosition,
      damageType,
      severity,
      detectionId,
      notes,
      snapshotPath,
    }: {
      sessionId: string
      inspectionId: string
      label: string
      pose: ARPose
      worldPosition?: Vector3
      damageType?: DamageType
      severity?: SeverityLevel
      detectionId?: string
      notes?: string
      snapshotPath?: string
    }) => {
      return createARAnchor({
        sessionId,
        inspectionId,
        label,
        pose,
        worldPosition,
        damageType,
        severity,
        detectionId,
        notes,
        snapshotPath,
      })
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ar-anchors', variables.inspectionId] })
      queryClient.invalidateQueries({ queryKey: ['all-ar-anchors'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
  })
}

export function useUpdateAIDetection() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      detectionId,
      params,
    }: {
      detectionId: string
      params: {
        damage_type?: DamageType
        severity?: SeverityLevel
        severity_score?: number
        confidence?: number
        notes?: string
        approved?: boolean
      }
    }) => {
      return updateAIDetection(detectionId, params)
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['ai-detections', data.image_id] })
      queryClient.invalidateQueries({ queryKey: ['ai-detections-inspection'] })
      queryClient.invalidateQueries({ queryKey: ['all-ai-detections'] })
      queryClient.invalidateQueries({ queryKey: ['inspections'] })
    },
  })
}

// Maintenance Task mutations (Engineer Prioritization & Task Assignment)
export function useCreateMaintenanceTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (task: {
      project_id: string
      title: string
      location: string
      risk_score: number
      status: MaintenanceStatus
      assigned_to?: string | null
      due_date?: string | null
      notes?: string
    }) => {
      return createMaintenanceTaskAction(task)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

export function useUpdateMaintenanceTask() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string
      updates: Partial<{
        title: string
        location: string
        risk_score: number
        status: MaintenanceStatus
        assigned_to: string | null
        due_date: string | null
        notes: string
      }>
    }) => {
      return updateMaintenanceTaskAction(id, updates)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
  })
}

// Admin Governance mutations
export function useUpdateUserRole() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: Role }) => {
      const res = await updateUserRole(userId, newRole)
      if (res.error) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['all-profiles'] })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    },
  })
}

export function useToggleAIModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ modelId, currentStatus }: { modelId: string; currentStatus: boolean }) => {
      const res = await toggleAIModelStatus(modelId, currentStatus)
      if (res.error) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-models'] })
      queryClient.invalidateQueries({ queryKey: ['ai-models'] })
    },
  })
}

export function useRegisterAIModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (modelData: {
      name: string
      version: string
      task: AIModelTask
      format: AIModelFormat
      labels: string[]
      is_active?: boolean
    }) => {
      const res = await registerAIModel(modelData)
      if (res.error) throw new Error(res.error)
      return res
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-ai-models'] })
      queryClient.invalidateQueries({ queryKey: ['ai-models'] })
    },
  })
}


