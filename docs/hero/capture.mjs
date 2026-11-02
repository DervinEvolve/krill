// Renders the hero from the Stageshow playground (see build.md).
//
//   node capture.mjs <playground-url> png <out.png>        poster still, 2x, transparent
//   node capture.mjs <playground-url> frames <dir> [fps]   one loop as numbered PNG frames
//
// Run it from the Stageshow skill folder so playwright-core resolves.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium } = require('playwright-core')

const [base, mode, out, fpsArg] = process.argv.slice(2)
if (!base || !['png', 'frames'].includes(mode) || !out) {
  console.error('usage: node capture.mjs <playground-url> png|frames <out> [fps]')
  process.exit(2)
}
const NAME = 'krill-hero'
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' })
const page = await browser.newPage({ viewport: { width: 1000, height: 560 }, deviceScaleFactor: 2, reducedMotion: mode === 'png' ? 'reduce' : 'no-preference' })
const stage = page.locator('.ss-stage').first()

if (mode === 'png') {
  // The poster: what reduced motion shows, on a transparent ground
  await page.goto(`${base}/?capture=${NAME}`)
  await stage.waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(800)
  await stage.screenshot({ path: out, omitBackground: true })
  console.log(`poster -> ${out}`)
} else {
  // The loop on the playground's virtual clock: paused, then stepped one
  // video frame at a time, so every frame is exact and none drop.
  const fps = Number(fpsArg ?? 12)
  const per = 60 / fps
  await page.goto(`${base}/?embed=${NAME}`)
  await stage.waitFor()
  await page.evaluate(() => document.fonts.ready)
  await page.evaluate(() => window.postMessage({ type: 'stageshow:control', playing: false }, location.origin))
  await page.waitForFunction(() => window.__stageshow?.clock)
  const step = () => page.evaluate((n) => window.__stageshow.clock.step(n), per)
  const mark = () => stage.getAttribute('data-mark')
  // One loop runs from one 'payoff' mark to the next. Find its length, then
  // film one whole loop from just after a payoff, so the GIF's first frame is
  // the result.
  let t = 0, first = -1, period = 0, last = null
  while (t < 60 * fps) {
    await step(); t++
    const m = await mark()
    if (m === 'payoff' && last !== 'payoff') {
      if (first < 0) first = t
      else { period = t - first; break }
    }
    last = m
  }
  if (!period) throw new Error('no loop found')
  // Half a second on, so the note has finished fading in on frame one
  for (let i = 0; i < fps / 2; i++) await step()
  mkdirSync(out, { recursive: true })
  for (let i = 0; i < period; i++) {
    await stage.screenshot({ path: join(out, `f${String(i).padStart(4, '0')}.png`) })
    await step()
  }
  console.log(`${period} frames at ${fps} fps (${(period / fps).toFixed(2)} s) -> ${out}`)
}
await browser.close()
