import { test } from 'node:test'
import assert from 'node:assert/strict'
import { preparePrintEvidence } from './print-evidence'

test('printing waits until every photograph finishes decoding', async () => {
  let finishDecode!: () => void
  const pending = new Promise<void>(resolve => { finishDecode = resolve })
  let ready = false
  const image = { complete: false, naturalWidth: 0, decode: async () => { await pending; image.complete = true; image.naturalWidth = 900 } }
  const prepared = preparePrintEvidence([image]).then(() => { ready = true })
  await Promise.resolve()
  assert.equal(ready, false)
  finishDecode()
  await prepared
  assert.equal(ready, true)
})

test('an unreadable evidence image prevents an apparently complete publication', async () => {
  await assert.rejects(preparePrintEvidence([{ complete: true, naturalWidth: 0, decode: async () => {} }]), /photograph|image|evidence/i)
  await assert.rejects(preparePrintEvidence([{ complete: false, naturalWidth: 0, decode: async () => { throw new Error('image download failed') } }]), /image download failed/)
})

test('reports without photographs do not wait for a nonexistent asset', async () => {
  await preparePrintEvidence([])
})
