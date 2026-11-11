import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inspectionStartError } from './ar/permission-errors'

test('camera denials explain how to restore permission before retrying', () => {
  const message = inspectionStartError(new DOMException('Permission denied', 'NotAllowedError'), 'camera')
  assert.match(message, /camera permission was not granted/i)
  assert.match(message, /Allow or Ask/)
  assert.match(message, /device settings/)
  assert.match(message, /try again/)
})

test('dismissed camera prompts are not reported as a permanent denial', () => {
  const message = inspectionStartError(new DOMException('Permission dismissed', 'NotAllowedError'), 'camera')
  assert.match(message, /not granted/i)
  assert.doesNotMatch(message, /you denied|permanently/i)
})

test('AR permission failures explain AR access and the camera alternative', () => {
  const message = inspectionStartError(new DOMException('The request is not allowed', 'NotAllowedError'), 'webxr')
  assert.match(message, /AR permission was not granted/)
  assert.match(message, /camera\/photo inspection/)
})

test('unrelated startup errors retain their useful details', () => {
  assert.equal(inspectionStartError(new Error('Session record could not be saved'), 'camera'), 'Session record could not be saved')
  assert.equal(inspectionStartError(null, 'webxr'), 'Could not start inspection')
})
