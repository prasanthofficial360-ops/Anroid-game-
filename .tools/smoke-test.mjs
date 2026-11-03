import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const PORT = 9333
const profile = path.join(os.tmpdir(), `tr3d-cdp-${Date.now()}`)
const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--window-size=1280,900',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore' },
)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function getJson(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

let version
for (let i = 0; i < 60; i++) {
  try {
    version = await getJson(`http://127.0.0.1:${PORT}/json/version`)
    break
  } catch {
    await sleep(250)
  }
}
if (!version) throw new Error('Chrome did not start')

const target = await getJson(`http://127.0.0.1:${PORT}/json/new?http://localhost:5173/`, { method: 'PUT' })
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id) {
    const p = pending.get(msg.id)
    if (p) {
      pending.delete(msg.id)
      if (msg.error) p.reject(new Error(JSON.stringify(msg.error)))
      else p.resolve(msg.result)
    }
  } else {
    events.push(msg)
    if (msg.method === 'Page.screencastFrame') {
      send('Page.screencastFrameAck', { sessionId: msg.params.sessionId }).catch(() => {})
    }
  }
}
ws.onclose = (event) => {
  for (const p of pending.values()) {
    p.reject(new Error(`CDP socket closed (${event.code})`))
  }
  pending.clear()
}

function send(method, params = {}) {
  const id = ++seq
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    ws.send(JSON.stringify({ id, method, params }))
  })
}

async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
  }
  return result.result.value
}

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.bringToFront')
await sleep(3200)

const report = {}
report.boot = await evaluate(`(() => ({
  view: document.getElementById('app').dataset.view,
  loginActive: document.getElementById('screen-login').classList.contains('is-active'),
  bootDisplay: getComputedStyle(document.getElementById('boot')).display,
  bootClass: document.getElementById('boot').className,
  bootVisibility: getComputedStyle(document.getElementById('boot')).visibility,
  visibility: document.visibilityState,
  title: document.title,
  accounts: document.querySelectorAll('#login-accounts .login-account').length,
  avatarOptions: document.querySelectorAll('#avatar-picker .avatar-option').length,
  note: document.getElementById('login-note').textContent.trim(),
}))()`)

// Create an account with a PIN.
report.create = await evaluate(`(() => {
  document.getElementById('signup-name').value = 'Test Runner';
  document.getElementById('signup-pin').value = '1234';
  document.getElementById('btn-create-account').click();
  return {
    accounts: JSON.parse(localStorage.getItem('temple-run-3d.accounts.v1') || '[]'),
    session: localStorage.getItem('temple-run-3d.session.v1'),
  };
})()`)
await sleep(1400)
report.afterCreate = await evaluate(`(() => ({
  view: document.getElementById('app').dataset.view,
  menuActive: document.getElementById('screen-menu').classList.contains('is-active'),
  tutorialOpen: document.getElementById('overlay-tutorial').classList.contains('is-open'),
  tutorialTitle: document.getElementById('tutorial-title').textContent,
  accountName: document.getElementById('account-name').textContent,
  tutorialSeen: JSON.parse(localStorage.getItem('temple-run-3d.profile.v1.' + localStorage.getItem('temple-run-3d.session.v1')) || '{}').tutorialSeen,
}))()`)

// Walk the tutorial to the end.
report.tutorial = await evaluate(`(() => {
  const steps = [];
  for (let i = 0; i < 3; i++) {
    steps.push(document.getElementById('tutorial-title').textContent);
    document.getElementById('btn-tutorial-next').click();
  }
  return { steps, open: document.getElementById('overlay-tutorial').classList.contains('is-open') };
})()`)
await sleep(300)
report.afterTutorial = await evaluate(`(() => ({
  open: document.getElementById('overlay-tutorial').classList.contains('is-open'),
  tutorialSeen: JSON.parse(localStorage.getItem('temple-run-3d.profile.v1.' + localStorage.getItem('temple-run-3d.session.v1')) || '{}').tutorialSeen,
}))()`)

// Toggle guide off/on and check persistence.
report.guideToggle = await evaluate(`(() => {
  document.getElementById('btn-settings').click();
  const before = document.getElementById('switch-guide').classList.contains('is-on');
  document.getElementById('switch-guide').click();
  const after = document.getElementById('switch-guide').classList.contains('is-on');
  document.getElementById('switch-guide').click();
  const restored = document.getElementById('switch-guide').classList.contains('is-on');
  document.getElementById('btn-settings-close').click();
  return { before, after, restored };
})()`)

// Start the first stage and let it run.
report.start = await evaluate(`(() => {
  document.getElementById('btn-play').click();
  return { view: document.getElementById('app').dataset.view };
})()`)
await sleep(300)
report.duringRun = await evaluate(`(() => {
  const g = window.__templeGame;
  g.invuln = 1e9;
  const seen = [];
  let urgent = null;
  for (let i = 0; i < 2400; i++) {
    g.update(1 / 60);
    if (g.guide) {
      seen.push({ action: g.guide.action, distance: g.guide.distance, urgent: !!g.guide.urgent, lane: g.laneIndex });
      if (!urgent && g.guide.urgent) urgent = { ...g.guide, lane: g.laneIndex };
      if (urgent) break;
    }
  }
  g.emitHud(true);
  const guide = document.getElementById('hud-guide');
  const snap = {
    state: g.state,
    distance: Math.round(g.distance),
    laneIndex: g.laneIndex,
    seen: seen.slice(0, 12),
    urgentGuide: urgent,
    guideOn: guide.classList.contains('is-on'),
    guideUrgent: guide.classList.contains('is-urgent'),
    guideAction: document.getElementById('guide-action').textContent,
    guideDistance: document.getElementById('guide-distance').textContent,
    guideVisible: getComputedStyle(guide).visibility,
    guideArrow: document.getElementById('guide-arrow-ico').querySelector('use').getAttribute('href'),
    hintBtn: document.querySelector('.touch-btn.is-hint')?.dataset.action || null,
    lanes: [...document.querySelectorAll('#lane-hud i')].map((el) => el.classList.contains('is-on')),
    progress: document.getElementById('hud-progress').style.width,
    hudDistance: document.getElementById('hud-distance').textContent,
    speed: document.getElementById('hud-speed').textContent,
  };
  return snap;
})()`)

// Keyboard lane change should move the player and update the lane HUD.
report.laneChange = await evaluate(`(() => {
  const g = window.__templeGame;
  const before = g.laneIndex;
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
  g.update(1 / 60);
  g.emitHud(true);
  return {
    before,
    after: g.laneIndex,
    lanes: [...document.querySelectorAll('#lane-hud i')].map((el) => el.classList.contains('is-on')),
  };
})()`)

// Pause and resume.
report.pause = await evaluate(`(() => {
  document.getElementById('btn-pause').click();
  return { open: document.getElementById('overlay-pause').classList.contains('is-open') };
})()`)
await sleep(300)
report.resume = await evaluate(`(() => {
  document.getElementById('btn-resume').click();
  return { open: document.getElementById('overlay-pause').classList.contains('is-open') };
})()`)

await sleep(600)
report.accountModal = await evaluate(`(() => {
  document.getElementById('btn-account').click();
  return {
    open: document.getElementById('overlay-account').classList.contains('is-open'),
    heading: document.querySelector('#account-body h3')?.textContent,
    stats: [...document.querySelectorAll('.account-stat-grid b')].map((el) => el.textContent.trim()),
  };
})()`)

report.errors = events
  .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
  .map((e) =>
    e.method === 'Runtime.exceptionThrown'
      ? e.params.exceptionDetails.exception?.description || e.params.exceptionDetails.text
      : `${e.params.entry.source}: ${e.params.entry.text}`,
  )

// Console errors emitted through console.error.
report.consoleErrors = events
  .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' '))

report.failedResources = await evaluate(`performance.getEntriesByType('resource')
  .filter((r) => r.responseStatus >= 400)
  .map((r) => ({ name: r.name, status: r.responseStatus }))`)

console.log(JSON.stringify(report, null, 2))

ws.close()
chrome.kill()
await sleep(500)
try {
  fs.rmSync(profile, { recursive: true, force: true })
} catch {}
