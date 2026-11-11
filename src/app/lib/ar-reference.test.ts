import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import jsQR from 'jsqr'
import {
  encodeReferenceTarget,
  decodeReferenceTarget,
  createReferenceSvg,
  getReferenceHomography,
  invertHomography,
  transformPoint,
  videoToViewport,
  viewportToVideo,
  getReferencePose,
  projectReferenceMarker,
} from './ar/printed-reference'

const inspectionId = '11111111-1111-4111-8111-111111111111'
const target = {
  id: '22222222-2222-4222-8222-222222222222',
  inspectionId,
  label: 'Column A – Level 2',
  sizeMm: 150,
}
const viewport = { width: 390, height: 380 }
const image = { width: 1280, height: 720 }
const square = {
  topLeft: { x: 500, y: 220 },
  topRight: { x: 780, y: 220 },
  bottomRight: { x: 780, y: 500 },
  bottomLeft: { x: 500, y: 500 },
}

function near(actual: number, expected: number, tolerance = 1e-7) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be within ${tolerance} of ${expected}`)
}

function nearPoint(actual: { x: number; y: number } | null, expected: { x: number; y: number }) {
  assert.ok(actual)
  near(actual.x, expected.x)
  near(actual.y, expected.y)
}

function frame(corners = square, reference = target) {
  const homography = getReferenceHomography(corners)
  assert.ok(homography)
  return {
    target: reference,
    corners,
    homography,
    imageWidth: image.width,
    imageHeight: image.height,
    observedAt: Date.now(),
  }
}

describe('printed inspection reference protocol', () => {
  test('reference identity, inspection, label and declared size round-trip', () => {
    const payload = encodeReferenceTarget(target)
    assert.deepEqual(decodeReferenceTarget(payload, inspectionId), target)
  })

  test('a reference from another inspection is rejected', () => {
    const otherInspection = '33333333-3333-4333-8333-333333333333'
    assert.equal(decodeReferenceTarget(encodeReferenceTarget(target), otherInspection), null)
  })

  test('malformed, unrelated and oversized QR payloads are rejected', () => {
    for (const payload of ['', '{', 'https://example.com', 'x'.repeat(10_000), JSON.stringify(target)]) {
      assert.equal(decodeReferenceTarget(payload, inspectionId), null)
    }
  })

  test('invalid target IDs, labels and physical sizes cannot be encoded', () => {
    for (const invalid of [
      { ...target, id: 'not-a-uuid' },
      { ...target, inspectionId: 'not-a-uuid' },
      { ...target, label: '' },
      { ...target, label: 'x'.repeat(1000) },
      { ...target, sizeMm: 0 },
      { ...target, sizeMm: -150 },
      { ...target, sizeMm: Number.NaN },
      { ...target, sizeMm: 100_000 },
    ]) {
      assert.throws(() => encodeReferenceTarget(invalid))
    }
  })

  test('unsupported versions and invalid untrusted reference metadata are rejected', () => {
    const valid: unknown[] = JSON.parse(encodeReferenceTarget(target))
    for (const [index, value] of [[1, 2], [2, 'invalid-id'], [4, ''], [5, 0], [5, '150']] as const) {
      const changed = [...valid]
      changed[index] = value
      assert.equal(decodeReferenceTarget(JSON.stringify(changed), inspectionId), null)
    }
  })

  test('the physical QR code size excludes its required white quiet zone', () => {
    const svg = createReferenceSvg(target)
    const width = /width="([\d.]+)mm"/.exec(svg)
    const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
    assert.ok(width)
    assert.ok(viewBox)
    const outerModules = Number(viewBox[1])
    near(Number(width[1]) * (outerModules - 8) / outerModules, target.sizeMm)
    near(Number(viewBox[2]), outerModules)
  })

  test('the printable SVG decodes from real pixels, including a Unicode label', async () => {
    const svg = createReferenceSvg(target)
    assert.match(svg, /<svg\b/)
    const { data, info } = await sharp(Buffer.from(svg))
      .resize(720, 720)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'dontInvert' })
    assert.ok(decoded, 'printed reference must contain a real decodable QR code with quiet space')
    assert.deepEqual(decodeReferenceTarget(decoded.data, inspectionId), target)
  })

  test('a rotated and resized printed target still decodes to the same identity', async () => {
    const { data, info } = await sharp(Buffer.from(createReferenceSvg(target)))
      .rotate(90)
      .resize(540, 540)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'dontInvert' })
    assert.ok(decoded)
    assert.deepEqual(decodeReferenceTarget(decoded.data, inspectionId), target)
    assert.ok(getReferenceHomography({
      topLeft: decoded.location.topLeftCorner,
      topRight: decoded.location.topRightCorner,
      bottomRight: decoded.location.bottomRightCorner,
      bottomLeft: decoded.location.bottomLeftCorner,
    }))
  })
})

describe('physical reference projective geometry', () => {
  test('unit-square points map to the four observed corners', () => {
    const h = getReferenceHomography(square)
    assert.ok(h)
    nearPoint(transformPoint(h, { x: 0, y: 0 }), square.topLeft)
    nearPoint(transformPoint(h, { x: 1, y: 0 }), square.topRight)
    nearPoint(transformPoint(h, { x: 1, y: 1 }), square.bottomRight)
    nearPoint(transformPoint(h, { x: 0, y: 1 }), square.bottomLeft)
  })

  test('a perspective-skewed target reprojects interior and nearby surface points correctly', () => {
    // Independent projective camera fixture; this is not produced by the implementation.
    const expected = (p: { x: number; y: number }) => ({
      x: (160 * p.x + 20 * p.y + 200) / (0.2 * p.x + 0.15 * p.y + 1),
      y: (10 * p.x + 120 * p.y + 100) / (0.2 * p.x + 0.15 * p.y + 1),
    })
    const corners = {
      topLeft: expected({ x: 0, y: 0 }),
      topRight: expected({ x: 1, y: 0 }),
      bottomRight: expected({ x: 1, y: 1 }),
      bottomLeft: expected({ x: 0, y: 1 }),
    }
    const h = getReferenceHomography(corners)
    assert.ok(h)
    for (const point of [{ x: 0.5, y: 0.5 }, { x: 0.1, y: 0.8 }, { x: 1.5, y: 0.4 }]) {
      nearPoint(transformPoint(h, point), expected(point))
    }
  })

  test('rotating the physical target preserves the reference origin and axes', () => {
    const rotated = {
      topLeft: { x: 500, y: 200 },
      topRight: { x: 500, y: 400 },
      bottomRight: { x: 300, y: 400 },
      bottomLeft: { x: 300, y: 200 },
    }
    const h = getReferenceHomography(rotated)
    assert.ok(h)
    nearPoint(transformPoint(h, { x: 0.75, y: 0.25 }), { x: 450, y: 350 })
  })

  test('inverse mapping returns a point to its target-relative coordinates', () => {
    const h = getReferenceHomography(square)
    assert.ok(h)
    const inverse = invertHomography(h)
    assert.ok(inverse)
    const projected = transformPoint(h, { x: -0.25, y: 1.25 })
    assert.ok(projected)
    nearPoint(transformPoint(inverse, projected), { x: -0.25, y: 1.25 })
  })

  test('collinear, self-crossing and non-finite corner observations are rejected', () => {
    assert.equal(getReferenceHomography({
      topLeft: { x: 0, y: 0 }, topRight: { x: 1, y: 1 },
      bottomRight: { x: 2, y: 2 }, bottomLeft: { x: 3, y: 3 },
    }), null)
    assert.equal(getReferenceHomography({ ...square, topRight: square.bottomRight, bottomRight: square.topRight }), null)
    assert.equal(getReferenceHomography({ ...square, topLeft: { x: Number.NaN, y: 220 } }), null)
  })

  test('a singular transform and a point at the projective horizon are rejected', () => {
    assert.equal(invertHomography([0, 0, 0, 0, 0, 0, 0, 0, 1]), null)
    assert.equal(transformPoint([1, 0, 0, 0, 1, 0, 1, 0, -1], { x: 1, y: 0 }), null)
  })

  test('portrait object-cover cropping keeps camera and display coordinates aligned', () => {
    nearPoint(videoToViewport({ x: 640, y: 360 }, image, viewport), { x: 195, y: 190 })
    nearPoint(videoToViewport({ x: 0, y: 0 }, image, viewport), { x: -142.77777777777777, y: 0 })
    nearPoint(viewportToVideo({ x: 195, y: 190 }, image, viewport), { x: 640, y: 360 })
  })

  test('viewport resizing and inverse cropping round-trip the same video point', () => {
    const point = { x: 690, y: 400 }
    for (const size of [viewport, { width: 780, height: 380 }, { width: 844, height: 390 }]) {
      const displayed = videoToViewport(point, image, size)
      nearPoint(viewportToVideo(displayed, image, size), point)
    }
  })
})

describe('target-relative inspection markers', () => {
  test('aiming at the target centre produces a reference-local pose without invented depth', () => {
    const pose = getReferencePose({ x: 0.5, y: 0.5 }, frame(), viewport)
    assert.ok(pose)
    assert.ok(pose.reference)
    assert.equal(pose.reference.kind, 'printed-reference-v1')
    assert.deepEqual(pose.reference.target, target)
    nearPoint(pose.reference.point, { x: 0.5, y: 0.5 })
    near(pose.position.x, 0.075)
    near(pose.position.y, -0.075)
    assert.equal(pose.position.z, 0)
    nearPoint(projectReferenceMarker(pose, frame(), viewport), { x: 195, y: 190 })
  })

  test('a saved point follows camera-relative target movement and survives serialization', () => {
    const pose = getReferencePose({ x: 0.5, y: 0.5 }, frame(), viewport)
    assert.ok(pose)
    const savedPose = JSON.parse(JSON.stringify(pose))
    const moved = Object.fromEntries(Object.entries(square).map(([name, point]) => [name, { x: point.x + 80, y: point.y - 30 }])) as typeof square
    const expected = videoToViewport({ x: 720, y: 330 }, image, viewport)
    nearPoint(projectReferenceMarker(savedPose, frame(moved), viewport), expected)
    nearPoint(projectReferenceMarker(savedPose, frame(), { width: 780, height: 380 }), { x: 390, y: 190 })
  })

  test('markers from another target or inspection are never rendered as tracked here', () => {
    const pose = getReferencePose({ x: 0.5, y: 0.5 }, frame(), viewport)
    assert.ok(pose)
    assert.equal(projectReferenceMarker(pose, frame(square, { ...target, id: '44444444-4444-4444-8444-444444444444' }), viewport), null)
    assert.equal(projectReferenceMarker(pose, frame(square, { ...target, inspectionId: '55555555-5555-4555-8555-555555555555' }), viewport), null)
    assert.equal(projectReferenceMarker(pose, frame(square, { ...target, sizeMm: 300 }), viewport), null)
  })

  test('an offscreen saved point is hidden instead of clamped to a false physical location', () => {
    const pose = getReferencePose({ x: 0.5, y: 0.5 }, frame(), viewport)
    assert.ok(pose)
    const moved = {
      topLeft: { x: 100, y: 220 }, topRight: { x: 200, y: 220 },
      bottomRight: { x: 200, y: 320 }, bottomLeft: { x: 100, y: 320 },
    }
    assert.equal(projectReferenceMarker(pose, frame(moved), viewport), null)
  })

  test('placement is rejected when the camera or display has no usable dimensions', () => {
    assert.equal(getReferencePose({ x: 0.5, y: 0.5 }, frame(), { width: 0, height: 380 }), null)
    assert.equal(getReferencePose({ x: 0.5, y: 0.5 }, { ...frame(), imageWidth: 0 }, viewport), null)
    assert.equal(getReferencePose({ x: Number.NaN, y: 0.5 }, frame(), viewport), null)
  })

  test('legacy synthetic coordinates cannot become a physically tracked marker', () => {
    const legacy = { position: { x: 0, y: -0.15, z: -1.45 }, quaternion: { x: 0, y: 0, z: 0, w: 1 } }
    assert.equal(projectReferenceMarker(legacy, frame(), viewport), null)
  })
})
