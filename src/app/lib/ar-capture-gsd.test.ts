import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gsdFromReference } from './capture/geometry'

test('reference-derived GSD matches target geometry', () => {
  // 150 mm printed target observed at 1200 px across
  assert.equal(gsdFromReference(150, 1200), 0.125)
})
