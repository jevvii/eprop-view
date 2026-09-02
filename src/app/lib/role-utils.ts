import type { Role } from '@/app/types'

export type Capability =
  | 'inspection:create'
  | 'inspection:read'
  | 'inspection:read_all'
  | 'inspection:review'
  | 'inspection:manage'
  | 'image:upload'
  | 'image:delete'
  | 'image:delete_own'
  | 'image:delete_any'
  | 'comment:create'
  | 'comment:add'
  | 'ai:trigger'
  | 'ai:review'
  | 'ai:admin'
  | 'ai:manage_models'
  | 'ar:use'
  | 'anchor:create'
  | 'report:create'
  | 'report:read'
  | 'report:view'
  | 'report:edit'
  | 'report:export'
  | 'report:share'
  | 'maintenance:view'
  | 'maintenance:manage'
  | 'task:assign'
  | 'task:prioritize'
  | 'envrisk:assess'
  | 'dashboard:view'
  | 'settings:manage'
  | 'users:manage'
  | 'user:admin'
  | 'building:admin'
  | 'geohazard:admin'
  | 'storage:admin'
  | 'audit:read'
  | 'audit:view'

export const ROLE_CAPABILITIES: Record<Role, Capability[]> = {
  viewer: [
    'inspection:read',
    'report:read',
    'report:view',
  ],
  inspector: [
    'inspection:create',
    'inspection:read',
    'image:upload',
    'image:delete',
    'image:delete_own',
    'comment:create',
    'comment:add',
    'ai:trigger',
    'ar:use',
    'anchor:create',
  ],
  engineer: [
    'inspection:read',
    'inspection:read_all',
    'inspection:review',
    'comment:create',
    'comment:add',
    'ai:review',
    'envrisk:assess',
    'dashboard:view',
    'maintenance:view',
    'maintenance:manage',
    'task:assign',
    'task:prioritize',
    'report:view',
    'report:create',
    'report:read',
    'report:edit',
    'report:export',
    'report:share',
  ],
  admin: [
    'inspection:create',
    'inspection:read',
    'inspection:read_all',
    'inspection:review',
    'inspection:manage',
    'image:upload',
    'image:delete',
    'image:delete_own',
    'image:delete_any',
    'comment:create',
    'comment:add',
    'ai:trigger',
    'ai:review',
    'ai:admin',
    'ai:manage_models',
    'ar:use',
    'anchor:create',
    'envrisk:assess',
    'dashboard:view',
    'maintenance:view',
    'maintenance:manage',
    'task:assign',
    'task:prioritize',
    'report:view',
    'report:create',
    'report:read',
    'report:edit',
    'report:export',
    'report:share',
    'audit:read',
    'audit:view',
    'users:manage',
    'user:admin',
    'settings:manage',
    'building:admin',
    'geohazard:admin',
    'storage:admin',
  ],
}

/**
 * Checks if a given role possesses a specific functional capability.
 */
export function hasCapability(role: Role | undefined | null, capability: Capability): boolean {
  if (!role) return false
  return ROLE_CAPABILITIES[role]?.includes(capability) ?? false
}

/**
 * Asserts that a given role possesses a specific functional capability; throws Error otherwise.
 */
export function requireCapability(role: Role | undefined | null, capability: Capability): void {
  if (!hasCapability(role, capability)) {
    throw new Error(`Forbidden: Role '${role || 'unknown'}' lacks required capability '${capability}'`)
  }
}
