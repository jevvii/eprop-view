import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { buildCaptureRow } from './capture/geometry'

describe('buildCaptureRow', () => {
  test('derives stored dimensions and rescaled GSD', () => {
    const row = buildCaptureRow({
      metadata: { width: 8064, height: 6048, orientation: 6 },
      storedWidth: 4096,
      storedHeight: 3072,
      capture: {
        lighting: 'diffuse',
        surfaceState: 'dry',
        elementType: 'wall',
        gsdMmPerPx: 0.05,
        scaleSource: 'printed_reference',
      },
    })
    assert.equal(row.source_width_px, 6048)
    assert.equal(row.source_height_px, 8064)
    assert.equal(row.width_px, 4096)
    assert.equal(row.height_px, 3072)
    // source is 6048 wide, stored 4096 -> factor 6048/4096
    assert.equal(Number(row.gsd_mm_per_px?.toFixed(6)), Number((0.05 * 6048 / 4096).toFixed(6)))
    assert.equal(row.scale_source, 'printed_reference')
    assert.equal(row.training_eligible, true)
  })

  test('distance without GSD leaves scale unknown and still stores distance', () => {
    const row = buildCaptureRow({
      metadata: { width: 4032, height: 3024, orientation: 1 },
      storedWidth: 4032,
      storedHeight: 3024,
      capture: { lighting: 'direct_sun', surfaceState: 'dry', elementType: 'deck', distanceMm: 1500 },
    })
    assert.equal(row.gsd_mm_per_px, null)
    assert.equal(row.scale_source, 'unknown')
    assert.equal(row.distance_mm, 1500)
  })

  test('defaults to unknown lighting and no distance when capture is missing', () => {
    const row = buildCaptureRow({
      metadata: { width: 4032, height: 3024, orientation: 1 },
      storedWidth: 4032,
      storedHeight: 3024,
    })
    assert.equal(row.lighting, null)
    assert.equal(row.scale_source, 'unknown')
    assert.equal(row.distance_mm, null)
  })
})
