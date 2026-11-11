// Uses the actual UI/runtime and projection math with isolated XR and database boundaries.
import { createRequire } from 'node:module'
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import http from 'node:http'
import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const root = process.cwd(), require = createRequire(path.join(root, 'package.json'))
const { build } = require('esbuild'), sharp = require('sharp')
const artifacts = process.env.AR_TEST_ARTIFACTS || path.join(tmpdir(), 'epropview-markerless-browser')
await mkdir(artifacts, { recursive: true })
const inspectionId = '11111111-1111-4111-8111-111111111111', userId = '44444444-4444-4444-8444-444444444444'
const fixture = `export const inspectionId='${inspectionId}';export async function rpc(method,input){window.__xrEvents?.push('db-'+method);const r=await fetch('/fixture/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input??null)});const b=await r.json();if(!r.ok)throw new Error(b.error);return b}`
const plugin = { name: 'markerless-test-boundaries', setup(b) {
  b.onResolve({ filter: /^markerless-fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }))
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js' }))
  b.onLoad({ filter: /\/src\/app\/lib\/queries\.ts$/ }, () => ({ contents: `import {useQuery} from '@tanstack/react-query';import {rpc,inspectionId} from 'markerless-fixture';export const useProfile=()=>({data:{id:'${userId}',role:'inspector'}});export const useInspections=()=>({data:[{id:'99999999-9999-4999-8999-999999999999',location:'Other inspection',status:'draft'},{id:inspectionId,location:'Markerless browser fixture',status:'draft'}]});export const useARAnchors=(id)=>useQuery({queryKey:['ar-anchors',id],queryFn:()=>rpc('anchors')});`, loader: 'js', resolveDir: root }))
  b.onLoad({ filter: /\/src\/app\/lib\/supabase\/client\.ts$/ }, () => ({ contents: `export const createClient=()=>{throw new Error('Unexpected browser database call')}`, loader: 'js' }))
  b.onLoad({ filter: /\/src\/app\/actions\/.*\.ts$/ }, async ({ path: filename }) => {
    const source = await readFile(filename, 'utf8'), names = [...source.matchAll(/export async function (\w+)/g)].map(m => m[1])
    const methods = { startARSession: 'start', endARSession: 'end', createARAnchor: 'create', deleteARAnchor: 'remove' }
    return { contents: `import {rpc} from 'markerless-fixture';` + names.map(name => `export const ${name}=${name === 'startARSession' ? `(inspectionId,deviceInfo)=>rpc('start',{inspectionId,deviceInfo})` : methods[name] ? `(input)=>rpc('${methods[name]}',input)` : 'async()=>null'};`).join('\n'), loader: 'js', resolveDir: root }
  })
} }
const compiled = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import {MarkerlessInspection} from './src/components/ar/markerless-inspection';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><MarkerlessInspection/></QueryClientProvider>);`, loader: 'tsx', resolveDir: root }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [plugin] })
const cssDir = path.join(root, '.next/static/chunks')
const css = (await Promise.all((await readdir(cssDir)).filter(f => f.endsWith('.css')).map(f => readFile(path.join(cssDir, f), 'utf8')))).join('\n')
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${compiled.outputFiles[0].text}</script>`
let markers = [], sessions = [], counter = 0, failNextSave = false, failNextStart = false
const server = http.createServer(async (req, res) => {
  if (!req.url.startsWith('/fixture/')) { res.setHeader('Content-Type', 'text/html'); return res.end(html) }
  let body = ''; for await (const chunk of req) body += chunk
  const input = JSON.parse(body || 'null'), method = req.url.slice('/fixture/'.length)
  res.setHeader('Content-Type', 'application/json')
  let output = null
  if (method === 'anchors') output = markers
  else if (method === 'start') {
    if (failNextStart) { failNextStart = false; res.statusCode = 409; return res.end(JSON.stringify({ error: 'Fixture session start failed' })) }
    output = { id: `66666666-6666-4666-8666-${String(++counter).padStart(12, '0')}`, inspection_id: input.inspectionId, device_info: input.deviceInfo, status: 'active' }; sessions.push(output)
  } else if (method === 'end') { output = sessions.find(s => s.id === input); if (output) output.status = 'completed' }
  else if (method === 'create') {
    if (failNextSave) { failNextSave = false; res.statusCode = 409; return res.end(JSON.stringify({ error: 'Fixture marker save failed' })) }
    const session = sessions.find(s => s.id === input.sessionId)
    if (!session || session.status !== 'active' || session.device_info.trackingSessionKey !== input.pose.sessionTracking.sessionKey) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'Invalid fixture tracking session' })) }
    output = { ...input, id: `77777777-7777-4777-8777-${String(++counter).padStart(12, '0')}`, inspection_id: input.inspectionId, session_id: input.sessionId, image_url: input.snapshotDataUrl }; markers.push(output)
  } else if (method === 'remove') { output = markers.find(m => m.id === input); markers = markers.filter(m => m.id !== input) }
  res.end(JSON.stringify(output))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
let browser
const results = []
function installXRMock({ supported }) {
  const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
  const projection = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -100.1 / 99.9, -1, 0, 0, -20 / 99.9, 0]
  const pose = (position = { x: 0, y: 0, z: -2 }) => ({ transform: { position, orientation: { x: 0, y: 0, z: 0, w: 1 }, matrix: identity() } })
  const state = window.__xr = { tracking: true, hit: true, cameraX: 0, anchorX: 0, nativeAnchors: true, rejectStart: false, created: 0, deleted: 0, poseReads: 0, cancelled: 0, lostContexts: 0, clearColor: null, requests: [] }
  window.__xrEvents = []
  const originalContext = HTMLCanvasElement.prototype.getContext
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    if (type === 'webgl') return { FRAMEBUFFER: 1, COLOR_BUFFER_BIT: 2, DEPTH_BUFFER_BIT: 4, bindFramebuffer() {}, clearColor(...rgba) { state.clearColor = rgba }, clear() {}, makeXRCompatible: async () => {}, getExtension: () => ({ loseContext() { state.lostContexts++ } }) }
    return originalContext.call(this, type, ...args)
  }
  window.XRWebGLLayer = class { constructor() { this.framebuffer = {}; this.framebufferWidth = 1280; this.framebufferHeight = 720 } }
  const camera = document.createElement('canvas'); camera.width = 640; camera.height = 480
  const ctx = camera.getContext('2d'); let phase = 0
  setInterval(() => { ctx.fillStyle = phase++ % 2 ? '#67b9d0' : '#6abdd2'; ctx.fillRect(0, 0, 640, 480) }, 33)
  navigator.mediaDevices.getUserMedia = async () => camera.captureStream(30)
  if (supported === 'missing') { Object.defineProperty(navigator, 'xr', { value: undefined, configurable: true }); return }
  Object.defineProperty(navigator, 'xr', { configurable: true, value: {
    isSessionSupported: async () => supported,
    requestSession: async (mode, options) => {
      window.__xrEvents.push('xr-request'); state.requests.push({ mode, options: { requiredFeatures: options.requiredFeatures, optionalFeatures: options.optionalFeatures }, gesture: navigator.userActivation.isActive })
      if (state.rejectStart) throw new Error('Fixture XR session rejected')
      const session = new EventTarget(), local = new EventTarget(), timers = new Map(); let nextId = 0, ended = false
      state.session = session; state.local = local
      session.visibilityState = 'visible'; session.renderState = {}
      session.updateRenderState = next => Object.assign(session.renderState, next)
      session.requestReferenceSpace = async type => type === 'local' ? local : new EventTarget()
      session.requestHitTestSource = async () => ({ cancel() { state.cancelled++ } })
      session.cancelAnimationFrame = id => { clearTimeout(timers.get(id)); timers.delete(id) }
      session.requestAnimationFrame = callback => {
        const id = ++nextId
        timers.set(id, setTimeout(() => {
          timers.delete(id); if (ended) return
          const frame = { session,
            getViewerPose: () => { if (!state.tracking) return null; const view = identity(); view[12] = -state.cameraX; return { views: [{ projectionMatrix: projection, transform: { inverse: { matrix: view } } }] } },
            getHitTestResults: () => state.hit ? [{ getPose: () => pose(), ...(state.nativeAnchors ? { createAnchor: async () => { state.created++; return { anchorSpace: {}, delete() { state.deleted++ } } } } : {}) }] : [],
            getPose: () => { state.poseReads++; return pose({ x: state.anchorX, y: 0, z: -2 }) },
          }
          callback(performance.now(), frame)
        }, 33)); return id
      }
      session.end = async () => { if (ended) return; ended = true; for (const timer of timers.values()) clearTimeout(timer); timers.clear(); session.dispatchEvent(new Event('end')) }
      return session
    },
  } })
}
try {
  browser = await chromium.launch({ executablePath: process.env.AR_TEST_BROWSER, headless: true })
  for (const width of [390, 1280]) {
    markers = []; sessions = []; counter = 0
    const context = await browser.newContext({ viewport: { width, height: 1000 } })
    await context.addInitScript(installXRMock, { supported: true })
    const page = await context.newPage(), errors = []; page.setDefaultTimeout(10000); page.on('pageerror', e => errors.push(e.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/?inspectionId=${inspectionId}`)
    await page.waitForFunction(id => document.querySelector('select')?.value === id, inspectionId)
    const start = page.getByRole('button', { name: 'Start markerless AR', exact: true })
    await start.click()
    const save = page.getByRole('button', { name: 'Save surface point', exact: true })
    await save.waitFor(); await page.waitForFunction(() => document.querySelector('button') && [...document.querySelectorAll('button')].some(b => b.textContent === 'Save surface point' && !b.disabled))
    const requests = await page.evaluate(() => window.__xr.requests)
    assert.deepEqual(requests[0].options.requiredFeatures, ['hit-test', 'dom-overlay']); assert(requests[0].gesture)
    assert.deepEqual(await page.evaluate(() => window.__xr.clearColor), [0, 0, 0, 0], 'WebXR layer must remain transparent for camera passthrough')
    assert(await page.getByRole('region', { name: 'Saved inspection records', includeHidden: true }).isHidden())
    assert(await start.isHidden(), 'the introductory card must not obscure the active AR viewport')
    assert((await page.evaluate(() => window.__xrEvents)).indexOf('xr-request') < (await page.evaluate(() => window.__xrEvents)).indexOf('db-start'))
    failNextSave = true; await save.click(); await page.getByRole('alert').filter({ hasText: 'Fixture marker save failed' }).waitFor(); assert.equal(markers.length, 0)
    await save.click(); await page.locator('[data-xr-marker]').waitFor()
    assert.equal(markers.length, 1); const saved = markers[0], firstKey = saved.pose.sessionTracking.sessionKey
    assert.equal(saved.inspection_id, inspectionId, 'linked inspection must be preserved instead of silently selecting the first record'); assert.equal(saved.pose.sessionTracking.kind, 'webxr-session-v1'); assert.equal(saved.snapshotDataUrl, undefined)
    const pin = page.locator(`[data-xr-marker="${saved.id}"]`)
    assert(Math.abs(await pin.evaluate(el => parseFloat(el.style.left)) - 50) < .1)
    await page.evaluate(() => { window.__xr.cameraX = .5 })
    await page.waitForFunction(id => Math.abs(parseFloat(document.querySelector(`[data-xr-marker="${id}"]`)?.style.left) - 37.5) < .1, saved.id)
    await page.evaluate(() => { window.__xr.anchorX = .2 })
    await page.waitForFunction(id => Math.abs(parseFloat(document.querySelector(`[data-xr-marker="${id}"]`)?.style.left) - 42.5) < .1, saved.id)
    assert(await page.evaluate(() => window.__xr.poseReads > 0))
    await page.screenshot({ path: path.join(artifacts, `tracked-${width}.png`), fullPage: true })
    await page.evaluate(() => { window.__xr.tracking = false })
    await pin.waitFor({ state: 'detached' }); assert(await save.isDisabled())
    await page.evaluate(() => { window.__xr.tracking = true; window.__xr.hit = false })
    await pin.waitFor(); assert(await save.isDisabled())
    await page.evaluate(() => { window.__xr.hit = true })
    await page.getByRole('button', { name: 'End inspection', exact: true }).click(); await start.waitFor()
    await page.waitForTimeout(100); assert.equal(sessions[0].status, 'completed'); assert.equal(await page.locator('[data-xr-marker]').count(), 0)
    assert(await page.evaluate(() => window.__xr.deleted >= 2 && window.__xr.cancelled >= 1 && window.__xr.lostContexts >= 1))
    await page.evaluate(() => { window.__xr.nativeAnchors = false; window.__xr.cameraX = 0; window.__xr.anchorX = 0 })
    await start.click(); await save.waitFor(); await page.waitForTimeout(100)
    assert.equal(await page.locator('[data-xr-marker]').count(), 0, 'a new XR session cannot restore old saved coordinates')
    await page.getByRole('button', { name: 'Details', exact: true }).click(); await page.getByLabel('Point label', { exact: true }).fill('Static fallback point')
    await save.click(); await page.getByText('Static fallback point', { exact: true }).first().waitFor({ state: 'attached' })
    assert.equal(markers.length, 2); assert.notEqual(markers[1].pose.sessionTracking.sessionKey, firstKey)
    await page.waitForFunction(() => document.querySelectorAll('[data-xr-marker]').length === 1)
    await page.evaluate(() => { window.__xr.cameraX = .5 })
    await page.waitForFunction(() => Math.abs(parseFloat(document.querySelector('[data-xr-marker]')?.style.left) - 37.5) < .1)
    await page.evaluate(() => window.__xr.session.end()); await start.waitFor(); await page.waitForTimeout(100)
    assert(sessions.every(s => s.status === 'completed')); assert.equal(markers.length, 2)
    failNextStart = true; await start.click()
    await page.getByRole('alert').filter({ hasText: 'Fixture session start failed' }).waitFor()
    assert.equal(await page.locator('[data-xr-marker]').count(), 0)
    await start.click(); await save.waitFor(); await page.waitForTimeout(100)
    await page.evaluate(() => window.__xr.local.dispatchEvent(new Event('reset')))
    await start.waitFor(); await page.waitForTimeout(100)
    assert.equal(await page.locator('[data-xr-marker]').count(), 0)
    assert(sessions.every(s => s.status === 'completed'), 'reference-space reset must end its session rather than reuse old coordinates')
    await page.evaluate(() => { window.__xr.rejectStart = true }); await start.click()
    const rejectedToast = page.getByRole('alert').filter({ hasText: 'Fixture XR session rejected' })
    await rejectedToast.waitFor()
    assert.equal(await rejectedToast.evaluate(el => getComputedStyle(el).position), 'fixed')
    await page.getByRole('button', { name: 'Use camera/photo inspection', exact: true }).click()
    const photo = page.getByRole('button', { name: 'Capture photo + centre point', exact: true }); await photo.waitFor()
    await page.waitForFunction(() => document.querySelector('video').readyState >= 2); await photo.click()
    await page.waitForFunction(() => document.querySelectorAll('img[alt^="Evidence for"]').length === 1)
    const photographed = markers.at(-1); assert.equal(photographed.pose.sessionTracking.kind, 'camera-frame-v1'); assert.deepEqual(photographed.pose.sessionTracking.point, { x: .5, y: .5 })
    const metadata = await sharp(Buffer.from(photographed.snapshotDataUrl.split(',')[1], 'base64')).metadata(); assert.equal(metadata.width, 640); assert.equal(metadata.height, 480)
    assert.equal(await page.locator('[data-xr-marker]').count(), 0)
    await page.getByRole('button', { name: 'End inspection', exact: true }).click(); await page.getByRole('button', { name: 'Use camera/photo inspection', exact: true }).waitFor()
    await page.screenshot({ path: path.join(artifacts, `records-${width}.png`), fullPage: true })
    assert.deepEqual(errors, []); results.push({ width, xrSaved: 2, cameraSaved: 1, errors })
    await context.close()
    const unsupported = await browser.newContext({ viewport: { width, height: 1000 } }); await unsupported.addInitScript(installXRMock, { supported: width === 390 ? 'missing' : false })
    const unsupportedPage = await unsupported.newPage(); unsupportedPage.on('pageerror', e => errors.push(e.message)); await unsupportedPage.goto(`http://127.0.0.1:${server.address().port}/`)
    const unsupportedStart = unsupportedPage.getByRole('button', { name: 'Start markerless AR', exact: true })
    await unsupportedStart.waitFor()
    assert.equal(await unsupportedPage.getByRole('alert').count(), 0, 'unsupported notice appears only after attempting AR')
    assert.equal(await unsupportedStart.isDisabled(), false, 'unsupported AR attempts must explain the fallback in a toast')
    const sessionsBefore = sessions.length
    await unsupportedStart.click()
    const toast = unsupportedPage.getByRole('alert').filter({ hasText: 'This device or browser does not support markerless AR.' })
    await toast.waitFor()
    assert.equal(await toast.evaluate(el => getComputedStyle(el).position), 'fixed', 'unsupported error must float as a toast')
    assert.equal(sessions.length, sessionsBefore, 'unsupported AR must not create a session')
    assert.equal(await unsupportedPage.evaluate(() => window.__xrEvents.includes('xr-request')), false)
    await unsupportedPage.screenshot({ path: path.join(artifacts, `unsupported-toast-${width}.png`), fullPage: true })
    await toast.getByRole('button', { name: 'Dismiss AR error', exact: true }).click()
    await toast.waitFor({ state: 'detached' })
    await unsupportedPage.clock.install()
    await unsupportedStart.click(); await toast.waitFor()
    await unsupportedPage.clock.fastForward(8000)
    await toast.waitFor({ state: 'detached' })
    await unsupportedStart.click(); await toast.waitFor()
    await unsupportedPage.getByRole('button', { name: 'Use camera/photo inspection', exact: true }).click()
    await toast.waitFor({ state: 'detached' })
    await unsupportedPage.getByRole('button', { name: 'Capture photo + centre point', exact: true }).waitFor(); await unsupportedPage.waitForFunction(() => document.querySelector('video').readyState >= 2)
    await unsupportedPage.getByRole('button', { name: 'Capture photo + centre point', exact: true }).click()
    await unsupportedPage.waitForFunction(() => document.querySelectorAll('img[alt^="Evidence for"]').length === 2)
    assert.equal(markers.at(-1).pose.sessionTracking.kind, 'camera-frame-v1'); assert.equal(await unsupportedPage.locator('[data-xr-marker]').count(), 0)
    await unsupportedPage.getByRole('button', { name: 'End inspection', exact: true }).click()
    await unsupportedPage.getByRole('button', { name: 'Use camera/photo inspection', exact: true }).waitFor()
    await unsupportedPage.getByRole('button', { name: 'Delete saved point Inspection point', exact: true }).first().click()
    await unsupportedPage.waitForFunction(() => document.querySelectorAll('button[aria-label="Delete saved point Inspection point"]').length === 1)
    assert.equal(markers.length, 3, 'saved session records remain deletable after tracking ends')
    assert(!markers.some(marker => marker.id === saved.id))
    assert.deepEqual(errors, [])
    await unsupported.close()
    console.log(`PASS ${width}px: XR hit/save/projection/native anchors/static fallback/loss/end/restart/OS end/start failure, camera-only evidence and saved-record deletion`)
  }
  await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2))
} finally { await browser?.close(); await new Promise(resolve => server.close(resolve)) }
