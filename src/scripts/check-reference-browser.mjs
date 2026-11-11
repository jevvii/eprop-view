// Run after npm run build. All auth/database calls are isolated fixtures; camera tracking uses real QR pixels.
import { createRequire } from 'node:module';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import assert from 'node:assert/strict';
const root = process.cwd();
const artifacts = process.env.AR_TEST_ARTIFACTS || path.join(tmpdir(), 'epropview-reference-browser');
await mkdir(artifacts, { recursive: true });
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const sharp = require('sharp');
const jsQR = require('jsqr');
const { chromium } = await import('playwright');
const inspectionId = '11111111-1111-4111-8111-111111111111';
const userId = '44444444-4444-4444-8444-444444444444';
const fixture = `
export const inspectionId='${inspectionId}';
async function rpc(method,input){const r=await fetch('/fixture/'+method,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input??null)});const b=await r.json();if(!r.ok)throw new Error(b.error);return b}
export const getMarkers=()=>rpc('anchors');
export const getActive=()=>rpc('getActive');
export const start=(id)=>rpc('start',id);
export const end=(id)=>rpc('end',id);
export const create=(input)=>rpc('create',input);
export const remove=(id)=>rpc('remove',id);
`;
const plugin = { name: 'test-boundaries', setup(b) {
        b.onResolve({ filter: /^reference-fixture$/ }, () => ({ path: 'fixture', namespace: 'fixture' }));
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: fixture, loader: 'js' }));
        b.onResolve({ filter: /^next\/(navigation|link)$/ }, a => ({ path: a.path, namespace: 'next-stub' }));
        b.onLoad({ filter: /.*/, namespace: 'next-stub' }, a => ({ contents: a.path.endsWith('navigation') ? `export const useSearchParams=()=>new URLSearchParams('inspectionId=${inspectionId}');` : `import React from 'react';export default function Link(p){return React.createElement('a',p,p.children)}`, loader: 'js', resolveDir: root }));
        b.onLoad({ filter: /\/src\/app\/lib\/queries\.ts$/ }, () => ({ contents: `import {useQuery} from '@tanstack/react-query';import {getMarkers,inspectionId} from 'reference-fixture';export const useProfile=()=>({data:{id:'${userId}',role:'inspector'},isLoading:false});export const useInspections=()=>({data:[{id:inspectionId,location:'Reference browser fixture',status:'draft'}],isLoading:false});export const useARAnchors=(id)=>useQuery({queryKey:['ar-anchors',id],queryFn:getMarkers});`, loader: 'js', resolveDir: root }));
        b.onLoad({ filter: /\/src\/app\/lib\/supabase\/client\.ts$/ }, () => ({ contents: `export const createClient=()=>{throw new Error('Unexpected direct browser database call')};`, loader: 'js' }));
        b.onLoad({ filter: /\/src\/app\/actions\/.*\.ts$/ }, async (a) => {
            const source = await readFile(a.path, 'utf8');
            const names = [...source.matchAll(/export async function (\w+)/g)].map(m => m[1]);
            const overrides = { getActiveARSession: 'getActive', startARSession: 'start', endARSession: 'end', createARAnchor: 'create', deleteARAnchor: 'remove' };
            return { contents: `import {getActive,start,end,create,remove} from 'reference-fixture';\n` + names.map(n => `export const ${n}=${overrides[n] ?? 'async()=>null'};`).join('\n'), loader: 'js', resolveDir: root };
        });
    } };
const result = await build({ stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import {QueryClient,QueryClientProvider} from '@tanstack/react-query';import ARPage from './src/app/(dashboard)/ar/page';createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false},mutations:{retry:false}}})}><ARPage/></QueryClientProvider>);`, loader: 'tsx', resolveDir: root }, bundle: true, write: false, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [plugin] });
const cssDir = path.join(root, '.next/static/chunks');
const css = (await Promise.all((await readdir(cssDir)).filter(f => f.endsWith('.css')).map(f => readFile(path.join(cssDir, f), 'utf8')))).join('\n');
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>${result.outputFiles[0].text}</script>`;
let markers = [], sessions = [], failNext = false, counter = 0;
const server = http.createServer(async (req, res) => {
    if (!req.url.startsWith('/fixture/')) {
        res.setHeader('Content-Type', 'text/html');
        return res.end(html);
    }
    let body = '';
    for await (const c of req)
        body += c;
    const input = JSON.parse(body || 'null');
    const method = req.url.slice('/fixture/'.length);
    res.setHeader('Content-Type', 'application/json');
    let output = null;
    if (method === 'anchors')
        output = markers;
    else if (method === 'getActive')
        output = sessions.find(s => s.status === 'active') ?? null;
    else if (method === 'start') {
        output = { id: `66666666-6666-4666-8666-${String(++counter).padStart(12, '0')}`, inspection_id: input, started_by: userId, status: 'active' };
        sessions.push(output);
    }
    else if (method === 'end') {
        output = sessions.find(s => s.id === input);
        if (output)
            output.status = 'completed';
    }
    else if (method === 'create') {
        if (failNext) {
            failNext = false;
            res.statusCode = 409;
            return res.end(JSON.stringify({ error: 'Fixture save failed. Try again.' }));
        }
        output = { ...input, id: `77777777-7777-4777-8777-${String(++counter).padStart(12, '0')}`, inspection_id: input.inspectionId, session_id: input.sessionId, image_url: input.snapshotDataUrl, snapshot_path: 'fixture/evidence.jpg' };
        markers.push(output);
    }
    else if (method === 'remove') {
        output = markers.find(m => m.id === input);
        markers = markers.filter(m => m.id !== input);
    }
    res.end(JSON.stringify(output));
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
let browser;
const results = [];
try {
    browser = await chromium.launch({ executablePath: process.env.AR_TEST_BROWSER, headless: true });
    for (const width of [390, 1280]) {
        markers = [];
        sessions = [];
        counter = 0;
        const context = await browser.newContext({ viewport: { width, height: 1000 }, acceptDownloads: true });
        await context.addInitScript(() => {
            const schedule = window.setTimeout.bind(window);
            window.__holdTracking = false;
            window.setTimeout = (callback, delay, ...args) => {
                if (delay !== 140) return schedule(callback, delay, ...args);
                const run = () => window.__holdTracking ? schedule(run, 16) : callback(...args);
                return schedule(run, delay);
            };
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            let image = null, perspective = null, scene = 'initial';
            const matrices = { initial: [300, 0, 0, 300, 460, 200], moved: [309.1, 82.8, -38.5, 279.5, 450, 150], rotated: [0, 300, -300, 0, 790, 190] };
            const warp = () => {
                const input = document.createElement('canvas');
                input.width = input.height = 600;
                const ic = input.getContext('2d');
                ic.drawImage(image, 0, 0, 600, 600);
                const source = ic.getImageData(0, 0, 600, 600).data;
                const out = document.createElement('canvas');
                out.width = 1280;
                out.height = 720;
                const oc = out.getContext('2d'), pixels = oc.createImageData(1280, 720);
                const [a, b, c, d, e, f, g, h, i] = [440, 40, 450, 20, 420, 150, .12, .08, 1];
                const inv = [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
                for (let y = 0; y < 720; y++)
                    for (let x = 0; x < 1280; x++) {
                        const denominator = inv[6] * x + inv[7] * y + inv[8], u = (inv[0] * x + inv[1] * y + inv[2]) / denominator, v = (inv[3] * x + inv[4] * y + inv[5]) / denominator, index = (y * 1280 + x) * 4;
                        if (u >= 0 && u < 1 && v >= 0 && v < 1) {
                            const k = (Math.floor(v * 600) * 600 + Math.floor(u * 600)) * 4;
                            pixels.data[index] = source[k];
                            pixels.data[index + 1] = source[k + 1];
                            pixels.data[index + 2] = source[k + 2];
                        }
                        else {
                            pixels.data[index] = pixels.data[index + 1] = pixels.data[index + 2] = 213;
                        }
                        pixels.data[index + 3] = 255;
                    }
                oc.putImageData(pixels, 0, 0);
                perspective = out;
            };
            const draw = () => { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d5d5d5'; ctx.fillRect(0, 0, 1280, 720); if (scene === 'perspective' && perspective) {
                ctx.drawImage(perspective, 0, 0);
            }
            else if (image && scene !== 'lost') {
                ctx.save();
                ctx.transform(...matrices[scene]);
                ctx.drawImage(image, 0, 0, 1, 1);
                ctx.restore();
            } };
            window.__setScene = (next) => { scene = next; draw(); };
            window.__setTargetSvg = async (svg) => { const loaded = new Image(); loaded.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg))); await loaded.decode(); image = loaded; warp(); draw(); };
            draw();
            setInterval(draw, 33);
            navigator.mediaDevices.getUserMedia = async () => canvas.captureStream(30);
        });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.getByLabel('Surface or element name').fill('Column A test');
        const downloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Create and download target', exact: true }).click();
        const download = await downloadPromise;
        const targetPath = `${artifacts}/reference-${width}.svg`;
        await download.saveAs(targetPath);
        const svg = await readFile(targetPath, 'utf8');
        const { data, info } = await sharp(Buffer.from(svg)).resize(720, 720).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'dontInvert' });
        assert(qr, 'UI download must decode');
        const payload = JSON.parse(qr.data);
        assert.equal(payload[3], inspectionId);
        await page.evaluate(svg => window.__setTargetSvg(svg), svg);
        await page.getByRole('button', { name: 'Start AR Session', exact: true }).click();
        const quick = page.getByRole('button', { name: 'Drop Quick Marker' });
        await quick.waitFor();
        await page.waitForFunction(() => document.querySelector('button[aria-label="Drop Quick Marker"]')?.disabled === false, null, { timeout: 10000 });
        assert.equal(sessions.length, 1);
        assert.equal(sessions[0].status, 'active');
        failNext = true;
        await quick.click();
        await page.getByRole('alert').filter({ hasText: 'Fixture save failed' }).waitFor();
        assert.equal(markers.length, 0, 'failed save must not create a marker');
        await quick.click();
        await page.locator('[data-marker-id]').waitFor();
        assert.equal(markers.length, 1);
        const saved = markers[0];
        assert.equal(saved.pose.reference.kind, 'printed-reference-v1');
        assert.equal(saved.pose.reference.target.id, payload[2]);
        assert.equal(saved.pose.position.z, 0);
        assert.match(saved.snapshotDataUrl, /^data:image\/jpeg;base64,/);
        const jpg = await sharp(Buffer.from(saved.snapshotDataUrl.split(',')[1], 'base64')).metadata();
        assert.equal(jpg.width, 1280);
        assert.equal(jpg.height, 720);
        const coordinates = () => page.locator(`[data-marker-id="${saved.id}"]`).evaluate(el => ({ left: parseFloat(el.style.left), top: parseFloat(el.style.top) }));
        const dimensions = await page.locator('#ar-viewport').evaluate(el => ({ width: el.clientWidth, height: el.clientHeight }));
        const expected = (matrix) => {
            const u = .6, v = 160 / 300;
            const x = matrix[0] * u + matrix[2] * v + matrix[4], y = matrix[1] * u + matrix[3] * v + matrix[5];
            const scale = Math.max(dimensions.width / 1280, dimensions.height / 720);
            return { left: x * scale + (dimensions.width - 1280 * scale) / 2, top: y * scale + (dimensions.height - 720 * scale) / 2 };
        };
        const initial = await coordinates();
        const initialExpected = expected([300, 0, 0, 300, 460, 200]);
        assert(Math.abs(initial.left - initialExpected.left) < 8 && Math.abs(initial.top - initialExpected.top) < 8, JSON.stringify({ initial, initialExpected }));
        await page.evaluate(() => window.__setScene('moved'));
        const movedExpected = expected([309.1, 82.8, -38.5, 279.5, 450, 150]);
        await page.waitForFunction(({ id, expected }) => { const el = document.querySelector(`[data-marker-id="${id}"]`); return el && Math.abs(parseFloat(el.style.left) - expected.left) < 8 && Math.abs(parseFloat(el.style.top) - expected.top) < 8; }, { id: saved.id, expected: movedExpected }, { timeout: 10000 });
        const moved = await coordinates();
        await page.screenshot({ path: `${artifacts}/tracked-${width}.png`, fullPage: true });
        await page.evaluate(() => window.__setScene('perspective'));
        const pu = .6, pv = 160 / 300, pw = .12 * pu + .08 * pv + 1, px = (440 * pu + 40 * pv + 450) / pw, py = (20 * pu + 420 * pv + 150) / pw;
        const ps = Math.max(dimensions.width / 1280, dimensions.height / 720);
        const perspectiveExpected = { left: px * ps + (dimensions.width - 1280 * ps) / 2, top: py * ps + (dimensions.height - 720 * ps) / 2 };
        await page.waitForFunction(({ id, expected }) => { const el = document.querySelector(`[data-marker-id="${id}"]`); return el && Math.abs(parseFloat(el.style.left) - expected.left) < 8 && Math.abs(parseFloat(el.style.top) - expected.top) < 8; }, { id: saved.id, expected: perspectiveExpected }, { timeout: 10000 });
        const perspectivePoint = await coordinates();
        await page.screenshot({ path: `${artifacts}/perspective-${width}.png`, fullPage: true });
        await page.evaluate(() => window.__setScene('rotated'));
        const rotatedExpected = expected([0, 300, -300, 0, 790, 190]);
        await page.waitForFunction(({ id, expected }) => { const el = document.querySelector(`[data-marker-id="${id}"]`); return el && Math.abs(parseFloat(el.style.left) - expected.left) < 8 && Math.abs(parseFloat(el.style.top) - expected.top) < 8; }, { id: saved.id, expected: rotatedExpected }, { timeout: 10000 });
        await page.evaluate(() => window.__setScene('lost'));
        await page.locator('[data-marker-id]').waitFor({ state: 'detached', timeout: 3000 });
        assert(await quick.isDisabled());
        await page.screenshot({ path: `${artifacts}/lost-${width}.png`, fullPage: true });
        const foreignPayload = [...payload];
        foreignPayload[3] = '99999999-9999-4999-8999-999999999999';
        const makeQR = require('qrcode-generator');
        const foreignQR = makeQR(0, 'M');
        foreignQR.addData(JSON.stringify(foreignPayload));
        foreignQR.make();
        const foreignSvg = foreignQR.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
        await page.evaluate(async (svg) => { await window.__setTargetSvg(svg); window.__setScene('initial'); }, foreignSvg);
        await page.getByText('Use an EPROPVIEW reference printed for the selected inspection.', { exact: true }).waitFor({ timeout: 5000 });
        assert(await quick.isDisabled());
        assert.equal(await page.locator('[data-marker-id]').count(), 0);
        await page.evaluate(svg => window.__setTargetSvg(svg), svg);
        await page.locator(`[data-marker-id="${saved.id}"]`).waitFor();
        assert.equal(markers.length, 1);
        await page.getByRole('button', { name: 'End AR Session', exact: true }).click();
        await page.getByRole('button', { name: 'Start AR Session', exact: true }).waitFor();
        await page.waitForTimeout(300);
        assert(sessions.every(s => s.status === 'completed'));
        await page.getByRole('button', { name: 'Start AR Session', exact: true }).click();
        await page.locator(`[data-marker-id="${saved.id}"]`).waitFor({ timeout: 10000 });
        await page.getByRole('button', { name: 'End AR Session', exact: true }).click();
        await page.getByRole('button', { name: 'Start AR Session', exact: true }).waitFor();
        await page.waitForTimeout(300);
        assert(sessions.every(s => s.status === 'completed'));
        await page.reload();
        await page.evaluate(svg => window.__setTargetSvg(svg), svg);
        await page.getByRole('button', { name: 'Start AR Session', exact: true }).click();
        await page.locator(`[data-marker-id="${saved.id}"]`).waitFor({ timeout: 10000 });
        assert.equal(markers.length, 1, 'rescan after reload restores the existing marker without duplicating it');
        const repeatedDownloadPromise = page.waitForEvent('download');
        await page.getByRole('button', { name: 'Download reference Column A test', exact: true }).click();
        const repeated = await repeatedDownloadPromise;
        const repeatedPath = `${artifacts}/repeated-${width}.svg`;
        await repeated.saveAs(repeatedPath);
        assert.equal(await readFile(repeatedPath, 'utf8'), svg, 'download after reload must keep the physical reference identity');
        await page.getByRole('button', { name: 'Capture frame', exact: true }).click();
        const stagedSnapshot = await page.getByAltText('Captured visual evidence').getAttribute('src');
        await page.evaluate(() => window.__setScene('lost'));
        await page.locator('[data-marker-id]').waitFor({ state: 'detached', timeout: 3000 });
        assert(await page.getByRole('button', { name: 'Save marker + evidence', exact: true }).isDisabled());
        const otherPayload = [...payload];
        otherPayload[2] = '88888888-8888-4888-8888-888888888888';
        otherPayload[4] = 'Column B fixture';
        const otherQR = makeQR(0, 'M');
        otherQR.addData(JSON.stringify(otherPayload));
        otherQR.make();
        await page.evaluate(async (svg) => { await window.__setTargetSvg(svg); window.__setScene('initial'); }, otherQR.createSvgTag({ cellSize: 4, margin: 16, scalable: true }));
        await page.waitForFunction(() => document.querySelector('button[aria-label="Drop Quick Marker"]')?.disabled === false);
        await page.getByRole('button', { name: 'Save marker + evidence', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'The captured photo uses another target' }).waitFor();
        assert.equal(markers.length, 1);
        await page.evaluate(svg => window.__setTargetSvg(svg), svg);
        await page.locator(`[data-marker-id="${saved.id}"]`).waitFor();
        await page.locator('#ar-viewport').scrollIntoViewIfNeeded();
        const box = await page.locator('#ar-viewport').boundingBox();
        await page.mouse.click(box.x + box.width * .72, box.y + box.height * .58);
        await page.waitForFunction(() => parseFloat(document.querySelector('#ar-viewport .h-12.w-12')?.style.left) > 65);
        await page.getByLabel('Damage Type', { exact: true }).selectOption('corrosion');
        await page.getByLabel('Severity', { exact: true }).selectOption('high');
        await page.getByRole('button', { name: 'Save marker + evidence', exact: true }).click();
        await page.getByRole('button', { name: 'Delete marker Structural Marker', exact: true }).waitFor();
        assert.equal(markers.length, 2);
        const detailed = markers.find(m => m.id !== saved.id);
        assert.equal(detailed.snapshotDataUrl, stagedSnapshot, 'evidence image must remain the staged frame');
        assert(Math.abs(detailed.pose.reference.point.x - saved.pose.reference.point.x) < .015 && Math.abs(detailed.pose.reference.point.y - saved.pose.reference.point.y) < .015, 'moving the reticle after capture must preserve the captured reference point');
        assert.equal(detailed.damageType, 'corrosion');
        assert.equal(detailed.severity, 'high');
        await page.getByRole('button', { name: 'Delete marker Structural Marker', exact: true }).click();
        await page.locator(`[data-marker-id="${detailed.id}"]`).waitFor({ state: 'detached' });
        assert.equal(markers.length, 1);
        // Move the physical target and click in the same task, before the next
        // tracking timer. Evidence must use the photographed QR, not the old H.
        await page.evaluate(() => { window.__holdTracking = true; window.__setScene('moved'); });
        await page.waitForTimeout(100); // deliver the new camera pixels while holding the old observation
        await page.getByRole('button', { name: 'Drop Quick Marker', exact: true }).click();
        await page.evaluate(() => { window.__holdTracking = false; });
        await page.waitForFunction(() => document.querySelectorAll('[data-marker-id]').length === 2);
        const immediate = markers.find(m => m.id !== saved.id);
        const modules = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
        const u = (immediate.pose.reference.point.x * (modules - 8) + 4) / modules;
        const v = (immediate.pose.reference.point.y * (modules - 8) + 4) / modules;
        const scale = Math.max(dimensions.width / 1280, dimensions.height / 720);
        const projected = {
            x: (309.1 * u - 38.5 * v + 450) * scale + (dimensions.width - 1280 * scale) / 2,
            y: (82.8 * u + 279.5 * v + 150) * scale + (dimensions.height - 720 * scale) / 2,
        };
        assert(Math.abs(projected.x - dimensions.width * .72) < 3 && Math.abs(projected.y - dimensions.height * .58) < 3,
            'immediate capture must derive the marked point from the photographed target, not a previous tracking observation');
        await page.getByRole('button', { name: `Delete marker ${immediate.label}`, exact: true }).click();
        await page.locator(`[data-marker-id="${immediate.id}"]`).waitFor({ state: 'detached' });
        await page.evaluate(() => { window.__holdTracking = true; window.__setScene('lost'); });
        await page.waitForTimeout(100);
        await page.getByRole('button', { name: 'Drop Quick Marker', exact: true }).click();
        await page.getByRole('alert').filter({ hasText: 'Keep the printed reference visible in the camera frame' }).waitFor();
        assert.equal(markers.length, 1, 'a missing QR in the actual evidence frame must reject capture despite an older tracking observation');
        await page.evaluate(async (svg) => { await window.__setTargetSvg(svg); window.__setScene('initial'); }, foreignSvg);
        await page.waitForTimeout(100);
        await page.getByRole('button', { name: 'Drop Quick Marker', exact: true }).click();
        assert.equal(markers.length, 1, 'a foreign QR in the actual evidence frame must never create a marker');
        await page.evaluate(async (svg) => { await window.__setTargetSvg(svg); window.__setScene('initial'); window.__holdTracking = false; }, svg);
        await page.locator(`[data-marker-id="${saved.id}"]`).waitFor();
        assert.deepEqual(errors, []);
        results.push({ width, initial, initialExpected, moved, movedExpected, perspectivePoint, perspectiveExpected, snapshot: `${jpg.width}x${jpg.height}`, markerCount: markers.length, pageErrors: errors });
        console.log(`PASS ${width}px: QR download/decode, save failure/retry, movement/rotation/perspective, loss, foreign target, restart/reload, frozen detailed evidence, deletion, exact-frame capture and rejection`);
        await context.close();
    }
    await writeFile(path.join(artifacts, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results, null, 2));
}
finally {
    await browser?.close();
    await new Promise(r => server.close(r));
}
