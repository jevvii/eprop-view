/**
 * Signed-in Preview walkthrough driver.
 *
 * Credentials are read from docs/user_credentials.md (or EPROP_EMAIL /
 * EPROP_PASSWORD) and are never printed or written to the results file.
 *
 * Usage:
 *   node ml/walkthrough.mjs --base <url> --out <dir> --scenario analyze --file <jpg> --expect model
 *   node ml/walkthrough.mjs --base <url> --out <dir> --scenario gemini  --file <jpg>
 *   node ml/walkthrough.mjs --base <url> --out <dir> --scenario review-rerun --file <jpg> --expect model
 */
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright'

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) {
    if (fallback === undefined) throw new Error(`missing --${name}`)
    return fallback
  }
  return process.argv[i + 1]
}
const hasFlag = (name) => process.argv.includes(`--${name}`)

function credentials() {
  if (process.env.EPROP_EMAIL && process.env.EPROP_PASSWORD) {
    return { email: process.env.EPROP_EMAIL, password: process.env.EPROP_PASSWORD }
  }
  const file = 'docs/user_credentials.md'
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.trim().startsWith('|') || !line.includes('`')) continue
    const cells = line.split('|').map((c) => c.trim())
    const role = (cells[4] || '').replace(/`/g, '').toUpperCase()
    if (role !== 'ADMIN') continue
    const values = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1])
    const email = values.find((v) => v.includes('@'))
    const password = values.find((v) => !v.includes('@') && v.length >= 6)
    if (email && password) return { email, password }
  }
  throw new Error('No admin credentials found (set EPROP_EMAIL/EPROP_PASSWORD).')
}

const COMPLETED = /(Trained detector: \d+ crack box|Heuristic: \d+ box|The trained crack detector found no visible crack|The heuristic reported no visible defect|Gemini image analysis|Gemini reported no visible)/

async function signIn(page, base) {
  await page.goto(`${base}/login`, { waitUntil: 'networkidle' })
  // The form uses a client server-action; clicking before hydration submits
  // nothing and leaves the page on /login with no error.
  await page.waitForTimeout(1500)
  const creds = credentials()
  await page.fill('#email', creds.email)
  await page.fill('#password', creds.password)
  await page.locator('form button[type="submit"]').click()
  // Wait for the authenticated shell, not merely a URL change: navigating away
  // before the server action's Set-Cookie lands aborts the session.
  await page.waitForFunction(
    () => document.body.innerText.includes('Logout') || Boolean(document.querySelector('#login-error')),
    null,
    { timeout: 60_000 },
  )
  if (page.url().includes('/login') || (await page.locator('#login-error').count()) > 0) {
    const message = await page.locator('#login-error').innerText().catch(() => 'unknown login error')
    throw new Error(`Sign-in refused: ${message}`)
  }
  for (let i = 0; i < 20; i++) {
    const cookies = await page.context().cookies()
    if (cookies.some((c) => c.name.startsWith('sb-') && c.name.includes('auth-token'))) break
    await page.waitForTimeout(250)
  }
  await page.waitForLoadState('networkidle')
}

async function openDocument(page, base) {
  await page.goto(`${base}/document`, { waitUntil: 'domcontentloaded' })
  const select = page.locator('select').first()
  await select.waitFor({ timeout: 30_000 })
  // Select explicitly: the auto-selection effect can still be pending while
  // the first render is interactive.
  if (!(await select.inputValue())) {
    const values = await select.locator('option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean))
    if (!values.length) throw new Error('No inspection is available to attach an upload to.')
    await select.selectOption(values[0])
  }
  await page.waitForSelector('input[type="file"][accept="image/*"]', { timeout: 30_000, state: 'attached' })
}

async function upload(page, file) {
  const input = page.locator('input[type="file"][accept="image/*"]').first()
  const name = path.basename(file)
  const selector = `img[alt="${name}"]`
  // The feed can render newest-first, so a count index is not reliable. Track
  // the signed URLs instead and pick the one that did not exist before.
  // Signed URLs carry a fresh token after every refetch, so compare the stable
  // storage path instead of the full URL.
  const beforePaths = await page.locator(selector).evaluateAll((els) =>
    els.map((e) => (e.getAttribute('src') || '').split('?')[0]),
  )
  await input.setInputFiles(file)
  await page.getByRole('button', { name: 'Confirm Upload' }).click()
  await page.waitForFunction(
    ({ sel, before }) => [...document.querySelectorAll(sel)].some(
      (e) => !before.includes((e.getAttribute('src') || '').split('?')[0]),
    ),
    { sel: selector, before: beforePaths },
    { timeout: 90_000 },
  )
  const newPath = await page.evaluate(
    ({ sel, before }) =>
      [...document.querySelectorAll(sel)]
        .map((e) => (e.getAttribute('src') || '').split('?')[0])
        .find((src) => !before.includes(src)) || null,
    { sel: selector, before: beforePaths },
  )
  if (!newPath) throw new Error('The uploaded asset did not appear in the feed.')
  return newPath
}

function cardFor(page, pathname) {
  // Match the one card whose image URL starts with the uploaded object's stable
  // path. Signed tokens differ on every refetch, so the prefix is the reliable
  // identity.
  const escaped = pathname.replace(/"/g, '\\"')
  return page.locator(`div.bg-white.rounded-lg:has(img[src^="${escaped}"])`).last()
}

async function runAnalysis(page, card) {
  const button = card.getByRole('button', { name: /Run AI Analysis|Re-Run Analysis|Analyzing Image/i })
  await button.waitFor({ timeout: 30_000 })
  await button.click()
  // Wait for the run to start, then for it to finish. A previous run's summary
  // can already be on screen, so completion alone is not a completion signal.
  const running = card.getByText(/Analyzing Image…|Inference Active/).first()
  const started = await running.waitFor({ timeout: 15_000 }).then(() => true).catch(() => false)
  if (started) await running.waitFor({ state: 'detached', timeout: 180_000 })
  await card.getByText(COMPLETED).first().waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  const text = await card.innerText()
  const findings = Number((text.match(/Findings for review \((\d+)\)/) || [])[1] ?? 0)
  const method = /Trained detector: \d+ crack box/.test(text) || /artifact [0-9a-f]{12}/.test(text)
    ? 'model'
    : /Heuristic: \d+ box/.test(text)
      ? 'heuristic'
      : /Gemini image analysis/.test(text)
        ? 'gemini'
        : 'unknown'
  return { text, findings, method }
}

async function main() {
  const base = arg('base')
  const out = arg('out')
  const scenario = arg('scenario')
  const file = arg('file', '')
  const expect = arg('expect', '')
  fs.mkdirSync(out, { recursive: true })

  const statePath = arg('state', path.join(out, '.state.json'))
  const hasState = fs.existsSync(statePath)
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
    ...(hasState ? { storageState: statePath } : {}),
  })
  const page = await context.newPage()
  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300)) })
  const result = { base, scenario, expect, ok: false, started_at: new Date().toISOString() }
  try {
    if (!hasState) {
      await signIn(page, base)
      await context.storageState({ path: statePath })
    }
    await openDocument(page, base)

    if (scenario === 'analyze' || scenario === 'review-rerun') {
      const t0 = Date.now()
      const imagePath = await upload(page, file)
      const card = cardFor(page, imagePath)
      const first = await runAnalysis(page, card)
      result.cold_ms = Date.now() - t0
      result.first_run = { method: first.method, findings: first.findings }
      await card.screenshot({ path: path.join(out, `analyze-${path.basename(file)}.png`) })

      if (scenario === 'review-rerun' && first.findings > 0) {
        // Verify the first finding as an engineer/admin, then rerun.
        const verify = card.getByRole('button', { name: /^Verify$/ }).first()
        await verify.click()
        await card.getByText('Verified').first().waitFor({ timeout: 30_000 })
        const verifiedCountBefore = await card.getByText('Verified').count()
        const second = await runAnalysis(page, card)
        const verifiedCountAfter = await card.getByText('Verified').count()
        result.rerun = { method: second.method, findings: second.findings, verified_before: verifiedCountBefore, verified_after: verifiedCountAfter }
        await card.screenshot({ path: path.join(out, `rerun-${path.basename(file)}.png`) })
      }

      if (hasFlag('delete-after')) {
        await card.getByRole('button', { name: 'Delete asset' }).click()
        await page.waitForTimeout(2000)
      }
    } else if (scenario === 'gemini') {
      const imagePath = await upload(page, file)
      const card = cardFor(page, imagePath)
      const t0 = Date.now()
      await card.getByRole('button', { name: /Deep AI analysis/i }).click()
      await page.waitForFunction(
        () => document.body.innerText.includes('Gemini (') || document.body.innerText.includes('Heuristic fallback (non-ML)'),
        null,
        { timeout: 180_000 },
      )
      result.latency_ms = Date.now() - t0
      const text = await card.innerText()
      result.gemini_text = text.split('\n').filter((l) => /Gemini|Heuristic fallback/.test(l)).slice(0, 3)
      await card.screenshot({ path: path.join(out, `gemini-${path.basename(file)}.png`) })
    } else {
      throw new Error(`unknown scenario ${scenario}`)
    }

    result.page_text_tail = (await page.locator('body').innerText()).slice(-2500)
    result.console_errors = consoleErrors
    result.ok = expect ? result.first_run?.method === expect : true
    result.finished_at = new Date().toISOString()
    fs.writeFileSync(path.join(out, `result-${scenario}-${path.basename(file)}.json`), JSON.stringify(result, null, 2))
    console.log(JSON.stringify({ ok: result.ok, scenario, first_run: result.first_run, rerun: result.rerun, cold_ms: result.cold_ms, latency_ms: result.latency_ms, console_errors: consoleErrors.length }, null, 2))
    if (!result.ok) process.exitCode = 2
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    result.page_text_tail = await page.locator('body').innerText().catch(() => '')
    result.console_errors = consoleErrors
    await page.screenshot({ path: path.join(out, `failure-${scenario}.png`), fullPage: true }).catch(() => {})
    fs.writeFileSync(path.join(out, `result-${scenario}-${path.basename(file || 'none')}.json`), JSON.stringify(result, null, 2))
    console.error(JSON.stringify({ ok: false, scenario, error: result.error, console_errors: consoleErrors.slice(0, 5) }, null, 2))
    process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main()
