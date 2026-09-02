import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { hasCapability, requireCapability, ROLE_CAPABILITIES, type Capability } from './role-utils'

describe('Role-Based Access Control (RBAC) Matrix Tests', () => {
  describe('Inspector Role Privileges', () => {
    test('Inspector possesses permitted field-capture capabilities', () => {
      assert.equal(hasCapability('inspector', 'inspection:create'), true)
      assert.equal(hasCapability('inspector', 'image:upload'), true)
      assert.equal(hasCapability('inspector', 'image:delete_own'), true)
      assert.equal(hasCapability('inspector', 'ai:trigger'), true)
      assert.equal(hasCapability('inspector', 'ar:use'), true)
      assert.equal(hasCapability('inspector', 'comment:add'), true)
    })

    test('Inspector is forbidden from engineering and governance actions', () => {
      assert.equal(hasCapability('inspector', 'ai:review'), false)
      assert.equal(hasCapability('inspector', 'ai:manage_models'), false)
      assert.equal(hasCapability('inspector', 'envrisk:assess'), false)
      assert.equal(hasCapability('inspector', 'task:assign'), false)
      assert.equal(hasCapability('inspector', 'task:prioritize'), false)
      assert.equal(hasCapability('inspector', 'report:create'), false)
      assert.equal(hasCapability('inspector', 'report:edit'), false)
      assert.equal(hasCapability('inspector', 'report:export'), false)
      assert.equal(hasCapability('inspector', 'dashboard:view'), false)
      assert.equal(hasCapability('inspector', 'settings:manage'), false)
      assert.equal(hasCapability('inspector', 'audit:view'), false)
      assert.equal(hasCapability('inspector', 'users:manage'), false)
      assert.equal(hasCapability('inspector', 'image:delete_any'), false)
    })
  })

  describe('Engineer Role Privileges', () => {
    test('Engineer possesses structural validation and reporting capabilities', () => {
      assert.equal(hasCapability('engineer', 'inspection:review'), true)
      assert.equal(hasCapability('engineer', 'ai:review'), true)
      assert.equal(hasCapability('engineer', 'envrisk:assess'), true)
      assert.equal(hasCapability('engineer', 'task:assign'), true)
      assert.equal(hasCapability('engineer', 'task:prioritize'), true)
      assert.equal(hasCapability('engineer', 'report:view'), true)
      assert.equal(hasCapability('engineer', 'report:create'), true)
      assert.equal(hasCapability('engineer', 'report:edit'), true)
      assert.equal(hasCapability('engineer', 'report:export'), true)
      assert.equal(hasCapability('engineer', 'dashboard:view'), true)
      assert.equal(hasCapability('engineer', 'comment:add'), true)
    })

    test('Engineer is forbidden from raw field capture and administrative modules', () => {
      assert.equal(hasCapability('engineer', 'inspection:create'), false)
      assert.equal(hasCapability('engineer', 'image:upload'), false)
      assert.equal(hasCapability('engineer', 'ar:use'), false)
      assert.equal(hasCapability('engineer', 'settings:manage'), false)
      assert.equal(hasCapability('engineer', 'audit:view'), false)
      assert.equal(hasCapability('engineer', 'users:manage'), false)
      assert.equal(hasCapability('engineer', 'ai:manage_models'), false)
    })
  })

  describe('Administrator Role Privileges', () => {
    test('Admin possesses complete operational and governance matrix', () => {
      const allCapabilities: Capability[] = [
        'inspection:create',
        'inspection:review',
        'image:upload',
        'image:delete_own',
        'image:delete_any',
        'ai:trigger',
        'ai:review',
        'ai:manage_models',
        'ar:use',
        'envrisk:assess',
        'task:assign',
        'task:prioritize',
        'report:view',
        'report:create',
        'report:edit',
        'report:export',
        'audit:view',
        'users:manage',
        'dashboard:view',
        'settings:manage',
        'comment:add',
      ]

      for (const cap of allCapabilities) {
        assert.equal(hasCapability('admin', cap), true, `Admin should have capability ${cap}`)
      }
    })
  })

  describe('Viewer Role Privileges', () => {
    test('Viewer possesses read-only access to published reports and inspections', () => {
      assert.equal(hasCapability('viewer', 'report:view'), true)
      assert.equal(hasCapability('viewer', 'report:read'), true)
      assert.equal(hasCapability('viewer', 'inspection:read'), true)
    })

    test('Viewer is strictly read-only and denied mutating actions', () => {
      assert.equal(hasCapability('viewer', 'inspection:create'), false)
      assert.equal(hasCapability('viewer', 'image:upload'), false)
      assert.equal(hasCapability('viewer', 'ai:trigger'), false)
      assert.equal(hasCapability('viewer', 'ai:review'), false)
      assert.equal(hasCapability('viewer', 'ar:use'), false)
      assert.equal(hasCapability('viewer', 'comment:add'), false)
      assert.equal(hasCapability('viewer', 'task:assign'), false)
      assert.equal(hasCapability('viewer', 'report:create'), false)
      assert.equal(hasCapability('viewer', 'report:edit'), false)
      assert.equal(hasCapability('viewer', 'audit:view'), false)
      assert.equal(hasCapability('viewer', 'settings:manage'), false)
    })
  })

  describe('requireCapability Assertion', () => {
    test('requireCapability passes when role has capability', () => {
      assert.doesNotThrow(() => requireCapability('engineer', 'ai:review'))
      assert.doesNotThrow(() => requireCapability('inspector', 'ai:trigger'))
      assert.doesNotThrow(() => requireCapability('admin', 'settings:manage'))
    })

    test('requireCapability throws error when role lacks capability', () => {
      assert.throws(() => requireCapability('inspector', 'ai:review'), {
        message: /Forbidden: Role 'inspector' lacks required capability 'ai:review'/,
      })
      assert.throws(() => requireCapability('engineer', 'ar:use'), {
        message: /Forbidden: Role 'engineer' lacks required capability 'ar:use'/,
      })
      assert.throws(() => requireCapability('viewer', 'inspection:create'), {
        message: /Forbidden: Role 'viewer' lacks required capability 'inspection:create'/,
      })
    })
  })
})
