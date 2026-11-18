// Component-level browser check for the annotation canvas.
// Bundles the real component with esbuild and drives it in Chromium, so drawing
// maths and pointer handling are exercised without a database or a deployment.
import { createRequire } from 'node:module'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'

const root = process.cwd()
const require = createRequire(path.join(root, 'package.json'))
const { build } = require('esbuild')
const { chromium } = await import('playwright')

const harness = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AnnotationCanvas } from './src/components/annotation/annotation-canvas'

function Harness() {
  const [tool, setTool] = React.useState('box')
  window.__setTool = setTool
  window.__tool = tool
  window.__events = window.__events || []
  const emit = (kind) => (...args) => window.__events.push([kind, ...args])
  return React.createElement(AnnotationCanvas, {
    imageUrl: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#888"/></svg>'),
    width: 400,
    height: 300,
    annotations: [{
      id: 'sample', image_id: 'image', damage_type: 'crack', severity: 'high', severity_score: 70,
      geometry_kind: 'box', polygon: null, bbox: { x: 0.1, y: 0.1, width: 0.3, height: 0.2 },
      crack_width_mm: null, measured_width_px: null, mask_path: null, source: 'manual',
      source_confidence: null, original_geometry: null, status: 'draft', notes: '',
      created_by: null, reviewed_by: null, reviewed_at: null, created_at: '', updated_at: '',
    }],
    selectedId: null,
    tool,
    onBox: emit('box'),
    onPolygon: emit('polygon'),
    onMeasure: emit('measure'),
    onSelect: emit('select'),
  })
}
createRoot(document.getElementById('root')).render(React.createElement(Harness))
`

const result = await build({
  stdin: { contents: harness, loader: 'tsx', resolveDir: root },
  bundle: true,
  write: false,
  format: 'iife',
  platform: 'browser',
  define: { 'process.env.NODE_ENV': '"development"' },
  alias: { '@': path.join(root, 'src') },
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
})

const bundle = result.outputFiles[0].text
const html = `<!doctype html><html><body style="margin:0"><div id="root"></div><script>${bundle}</script></body></html>`

const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html' })
  response.end(html)
})
await new Promise((resolve) => server.listen(0, resolve))
const port = server.address().port

const browser = await chromium.launch()

async function runFlow(contextOptions, pointerType) {
  const context = await browser.newContext(contextOptions)
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.waitForSelector('img')

  // A non-scaling stroke with a sub-pixel width renders invisibly; assert the
  // overlay actually paints (regression for the invisible-outline bug).
  const strokeWidth = await page.evaluate(() => {
    const rect = document.querySelector('svg rect')
    return rect ? Number.parseFloat(getComputedStyle(rect).strokeWidth) : 0
  })
  assert.ok(strokeWidth >= 1, `overlay stroke is visible (got ${strokeWidth}px)`)

  const surface = page.locator('div.touch-none').first()
  const box = await surface.boundingBox()
  assert.ok(box && box.width > 0, 'canvas surface has a measurable box')

  // Box: drag from 25% to 65% of the surface. Each step is a separate task so
  // React commits the drag state between pointer events, as it does for a user.
  await page.evaluate(() => window.__setTool('box'))
  const dispatch = (type, x, y, pointerType, pointerId) =>
    page.evaluate(
      ({ type, x, y, pointerType, pointerId }) => {
        const surface = document.querySelector('div.touch-none')
        const rect = surface.getBoundingClientRect()
        surface.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerId,
            pointerType,
            clientX: rect.left + rect.width * x,
            clientY: rect.top + rect.height * y,
          })
        )
      },
      { type, x, y, pointerType, pointerId }
    )

  await dispatch('pointerdown', 0.25, 0.25, pointerType, 1)
  await page.waitForTimeout(30)
  await dispatch('pointermove', 0.65, 0.6, pointerType, 1)
  await page.waitForTimeout(30)
  await dispatch('pointerup', 0.65, 0.6, pointerType, 1)
  await page.waitForTimeout(30)

  const boxEvent = await page.evaluate(() => window.__events.find((entry) => entry[0] === 'box'))
  assert.ok(boxEvent, `box event emitted for ${pointerType}`)
  const bbox = boxEvent[1]
  assert.ok(Math.abs(bbox.x - 0.25) < 0.02, `bbox.x ~ 0.25, got ${bbox.x}`)
  assert.ok(Math.abs(bbox.width - 0.4) < 0.02, `bbox.width ~ 0.4, got ${bbox.width}`)

  // Polygon: three taps then close.
  await page.evaluate(() => window.__setTool('polygon'))
  for (const [x, y] of [[0.2, 0.2], [0.6, 0.2], [0.6, 0.6], [0.2, 0.2]]) {
    await dispatch('pointerdown', x, y, pointerType, 2)
    await dispatch('pointerup', x, y, pointerType, 2)
    await page.waitForTimeout(30)
  }

  const polygonEvent = await page.evaluate(() => window.__events.find((entry) => entry[0] === 'polygon'))
  assert.ok(polygonEvent, `polygon event emitted for ${pointerType}`)
  assert.equal(polygonEvent[1].length, 3, 'polygon closes with three vertices')

  // Ruler: two clicks, distance in stored pixels.
  await page.evaluate(() => window.__setTool('ruler'))
  for (const [x, y] of [[0.1, 0.5], [0.6, 0.5]]) {
    await dispatch('pointerdown', x, y, pointerType, 3)
    await dispatch('pointerup', x, y, pointerType, 3)
    await page.waitForTimeout(30)
  }

  const measureEvent = await page.evaluate(() => window.__events.find((entry) => entry[0] === 'measure'))
  assert.ok(measureEvent, `measure event emitted for ${pointerType}`)
  // 0.5 of a 400px-wide image = 200px
  assert.ok(Math.abs(measureEvent[3] - 200) <= 2, `ruler ~200px, got ${measureEvent[3]}`)

  assert.deepEqual(errors, [], 'no page errors')
  await context.close()
  return { pointerType, boxWidth: bbox.width, measured: measureEvent[3], strokeWidth }
}

try {
  const desktop = await runFlow({ viewport: { width: 1280, height: 900 } }, 'mouse')
  const tablet = await runFlow({ viewport: { width: 1024, height: 768 }, hasTouch: true }, 'touch')
  console.log('annotation canvas: PASS')
  console.log(JSON.stringify({ desktop, tablet }, null, 2))
} finally {
  await browser.close()
  server.close()
}
