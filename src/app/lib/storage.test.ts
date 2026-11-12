import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveEvidenceLocation } from './storage-location'

describe('Evidence storage locations used by readers', () => {
  test('legacy image records keep the primary bucket', () => {
    assert.deepEqual(resolveEvidenceLocation({ storage_path: 'inspection/evidence.jpg' }), { bucket: 'inspection-images', path: 'inspection/evidence.jpg' })
  })
  test('archived photos and AR evidence retain their actual bucket', () => {
    assert.deepEqual(resolveEvidenceLocation({ storage_bucket: 'reports-archive', storage_path: 'archive/evidence.jpg' }), { bucket: 'reports-archive', path: 'archive/evidence.jpg' })
    assert.deepEqual(resolveEvidenceLocation({ snapshot_bucket: 'reports-archive', snapshot_path: 'archive/ar.jpg' }), { bucket: 'reports-archive', path: 'archive/ar.jpg' })
  })
  test('rejects unrecognized storage locations instead of signing arbitrary buckets', () => {
    assert.throws(() => resolveEvidenceLocation({ storage_bucket: 'private-secrets', storage_path: 'key' }), /Unsupported/)
    assert.throws(() => resolveEvidenceLocation({ storage_path: '../key' }), /Invalid/)
  })
})
