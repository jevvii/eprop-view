import assert from 'node:assert/strict'

// Real getUserMedia with Chrome's fake camera; permissions are controlled by the
// browser, rather than stubbing the permission request or returning a canvas stream.
export async function checkCameraPermissions(browser, url, mode) {
  for (const setting of ['denied', 'prompt']) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
    try {
      await context.addInitScript(() => {
        window.__permissionRequests = []
        window.__permissionTracks = []
        const request = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
        navigator.mediaDevices.getUserMedia = async options => {
          window.__permissionRequests.push({ gesture: navigator.userActivation.isActive, audio: options.audio })
          const stream = await request(options)
          window.__permissionTracks = stream.getTracks()
          return stream
        }
      })
      const page = await context.newPage()
      const errors = []
      let starts = 0
      page.on('pageerror', error => errors.push(error.message))
      page.on('request', request => { if (new URL(request.url()).pathname === '/fixture/start') starts++ })
      const cdp = await context.newCDPSession(page)
      const { targetInfo } = await cdp.send('Target.getTargetInfo')
      const permission = { permission: { name: 'camera' }, origin: new URL(url).origin, browserContextId: targetInfo.browserContextId }
      await cdp.send('Browser.setPermission', { ...permission, setting })
      await page.goto(url)
      assert.equal(await page.evaluate(async () => (await navigator.permissions.query({ name: 'camera' })).state), setting)
      if (mode === 'reference') await page.getByRole('button', { name: 'Printed reference (optional)', exact: true }).click()
      const start = page.getByRole('button', { name: mode === 'reference' ? 'Start AR Session' : 'Use camera/photo inspection', exact: true })
      await start.click()
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert.match(await alert.innerText(), /camera permission was not granted/i)
      assert.match(await alert.innerText(), /Allow or Ask/i)
      assert.equal(starts, 0, 'denial must not create a database session')
      assert.deepEqual(await page.evaluate(() => window.__permissionRequests), [{ gesture: true, audio: false }])
      assert(await page.evaluate(() => document.querySelector('video').srcObject === null), 'denial must not leave a live session')
      // Restoring the browser permission must allow the same page to start on
      // the next click, without a stale denial or an automatic retry loop.
      await cdp.send('Browser.setPermission', { ...permission, setting: 'granted' })
      const started = page.waitForResponse(response => new URL(response.url()).pathname === '/fixture/start' && response.ok())
      await start.click()
      await started
      await page.waitForFunction(() => {
        const video = document.querySelector('video')
        return video?.srcObject && video.videoWidth > 0 && !video.paused
      })
      assert.equal(await alert.count(), 0)
      assert.equal(starts, 1)
      assert.equal(await page.evaluate(() => window.__permissionRequests.length), 2)
      await page.getByRole('button', { name: mode === 'reference' ? 'End AR Session' : 'End inspection', exact: true }).click()
      await page.waitForFunction(() => window.__permissionTracks.every(track => track.readyState === 'ended'))
      assert.deepEqual(errors, [])
      console.log(`PASS ${mode}: real camera ${setting}, permission guidance, restored access and stream cleanup`)
    } finally { await context.close() }
  }
}
