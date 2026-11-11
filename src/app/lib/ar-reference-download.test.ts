import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { setPngPrintResolution } from './ar/reference-download'

test('PNG export has readable pixel dimensions and the requested physical print size', async () => {
  const original = await sharp({ create: { width: 1272, height: 1272, channels: 3, background: 'white' } })
    .withMetadata({ density: 96 }).png().toBuffer()
  const pixelsPerMetre = 1080 / .15 // 150 mm QR square inside a 1272px image, excluding quiet zone
  const exported = setPngPrintResolution(original, pixelsPerMetre)
  const metadata = await sharp(exported).metadata()
  assert.equal(metadata.format, 'png')
  assert.equal(metadata.width, 1272)
  assert.equal(metadata.height, 1272)
  assert.ok(Math.abs((metadata.density ?? 0) - pixelsPerMetre * .0254) < 1)
  const originalPixels = await sharp(original).raw().toBuffer()
  assert.deepEqual(await sharp(exported).raw().toBuffer(), originalPixels)
})

test('export rejects invalid PNG data and invalid print resolution', () => {
  assert.throws(() => setPngPrintResolution(new Uint8Array([1, 2, 3]), 7200))
  for (const density of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => setPngPrintResolution(new Uint8Array(40), density))
  }
})
