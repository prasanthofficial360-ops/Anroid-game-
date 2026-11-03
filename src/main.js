import { TempleGame } from './game.js'
import {
  WORLDS,
  STAGES_PER_WORLD,
  ROMAN,
  STAGE_TITLES,
  getStageConfig,
  stageKey,
  worldProgress,
  totalStars,
} from './levels.js'
import {
  loadProfile,
  saveProfile,
  resetProfile,
  useProfileSlot,
  readProfileSlot,
  deleteProfileSlot,
  hasLegacyProfile,
  isStageUnlocked,
  isWorldUnlocked,
  stageBest,
  recordRun,
  buyUpgrade,
  upgradeCost,
  loadout,
  nextStageInfo,
  UPGRADES,
} from './save.js'
import {
  AVATARS,
  listAccounts,
  getAccount,
  getSession,
  setSession,
  clearSession,
  createAccount,
  signIn,
  deleteAccount,
  validatePin,
} from './accounts.js'
import { SoundEngine } from './audio.js'

// ── helpers ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id)
const pad2 = (n) => String(n).padStart(2, '0')
const fmt = (n) => Math.round(n).toLocaleString('en-US')
const icon = (name, cls = '') => `<svg class="ico ${cls}"><use href="#i-${name}"></use></svg>`
const esc = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function formatTime(sec) {
  const s = Math.max(0, Math.round(sec))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const starRow = (stars, max = 3) =>
  Array.from({ length: max }, (_, i) => icon('star', i < stars ? 'lit' : '')).join('')

const templeSVG = `<svg class="wc-temple" viewBox="0 0 200 110" aria-hidden="true">
  <path d="M6 108V94h18V80h22V64h20V48h22V32h20V16h20v16h20v16h20v16h20v16h18v18z" fill="currentColor" opacity=".5"/>
  <path d="M94 108V84a10 10 0 0 1 20 0v24z" fill="currentColor" opacity=".9"/>
  <circle cx="104" cy="46" r="20" fill="currentColor" opacity=".22"/>
</svg>`

// ── state ────────────────────────────────────────────────────
let profile = loadProfile()
const sound = new SoundEngine(profile.settings)
let currentAccount = null
let signedIn = false
let pinAccount = null
let signupAvatar = AVATARS[0]
let tutorialStep = 0
let tutorialOnboarding = false
let accountOpen = false

const app = $('app')
const canvas = $('scene')
const boot = $('boot')
const topbar = $('topbar')
const hud = $('hud')
const toastEl = $('toast')
const hudToastEl = $('hud-toast')
const countdown = $('countdown')
const flash = $('flash')
const worldGrid = $('world-grid')
const shopGrid = $('shop-grid')
const stageSheet = $('stage-sheet')
const pauseOverlay = $('overlay-pause')
const resultOverlay = $('overlay-result')
const stagesOverlay = $('overlay-stages')
const settingsOverlay = $('overlay-settings')
const loginAccounts = $('login-accounts')
const loginContinue = $('login-continue')
const loginPin = $('login-pin')
const tutorialOverlay = $('overlay-tutorial')
const accountOverlay = $('overlay-account')

let currentWorld = 1
let currentStage = 1
let lastHud = null
let menuTarget = { world: 1, stage: 1 }
let nextTarget = null
let resultsOpen = false
let pauseOpen = false
let stagesOpen = false
let settingsOpen = false
let lastResult = null
let goTimer = 0
let countdownTimer = 0
let toastTimer = 0
let hudToastTimer = 0
let lastHearts = -1
let hintState = ''
let lastCoinSound = 0
let selectedWorld = 1

// ── game ─────────────────────────────────────────────────────
const game = new TempleGame(canvas, {
  onHud: updateHud,
  onGo: handleGo,
  onCoin: ({ count, value }) => {
    const now = performance.now()
    if (now - lastCoinSound > 42) {
      sound.coin(count)
      lastCoinSound = now
    }
    // small live update for responsiveness
    const el = $('hud-coins')
    if (el) el.textContent = fmt(value)
  },
  onJump: () => sound.jump(),
  onSlide: () => sound.slide(),
  onLand: () => sound.land(),
  onLane: () => sound.whoosh(),
  onHit: ({ shield, hearts }) => {
    if (!shield) {
      sound.hit()
      triggerFlash('hit')
      renderHearts(Math.max(0, hearts), game.maxHearts || 2, true)
      hudToast('OUCH — KEEP MOVING', '')
    }
  },
  onShieldBreak: () => {
    sound.shieldBreak()
    triggerFlash('gold')
    hudToast('JADE SHIELD SHATTERED', 'cyan')
  },
  onPowerup: (type) => {
    sound.power()
    triggerFlash('gold')
    if (type === 'magnet') {
      hudToast(`MAGNET RELIC · ${game.magnetMax}s`, 'purple')
    } else {
      hudToast('JADE SHIELD CLAIMED', 'cyan')
    }
  },
  onFinishCue: () => {
    triggerFlash('gold')
    hudToast('GATE CLEARED', '')
  },
  onFinish: (result) => showResults(result, true),
  onFail: (result) => showResults(result, false),
  onPauseRequest: () => {
    if (resultsOpen) return
    if (pauseOpen) return
    if (game.state === 'running' || game.state === 'ready') openPause()
  },
})

// Exposed only while running `vite` so automated smoke tests can step the
// engine without depending on requestAnimationFrame throttling in headless
// browsers. Stripped from production builds.
if (import.meta.env.DEV) window.__templeGame = game

// ── hud ──────────────────────────────────────────────────────
const hudRefs = {
  progress: $('hud-progress'),
  marker: $('hud-marker'),
  distance: $('hud-distance'),
  goal: $('hud-goal'),
  coins: $('hud-coins'),
  speed: $('hud-speed'),
  hearts: $('hearts'),
  magnet: $('pu-magnet'),
  magnetBar: $('pu-magnet-bar'),
  magnetTime: $('pu-magnet-time'),
  shield: $('pu-shield'),
  hints: $('star-hints'),
  world: $('hud-world'),
  stage: $('hud-stage'),
}

const guideEl = $('hud-guide')
const guideAction = $('guide-action')
const guideDistance = $('guide-distance')
const guideArrow = $('guide-arrow-ico')
const laneHud = $('lane-hud')

function renderHearts(n, max, animateLoss = false) {
  const el = hudRefs.hearts
  const maxN = Math.max(1, Math.min(6, max))
  if (el.children.length !== maxN) {
    el.innerHTML = Array.from(
      { length: maxN },
      () => `<span class="heart"><svg viewBox="0 0 24 24"><use href="#i-heart"></use></svg></span>`,
    ).join('')
    lastHearts = maxN
  }
  const prev = lastHearts
  ;[...el.children].forEach((child, i) => {
    child.classList.toggle('is-empty', i >= n)
    if (animateLoss && prev > n && i === n) {
      child.classList.add('is-lost')
      setTimeout(() => child.classList.remove('is-lost'), 520)
    }
  })
  lastHearts = n
}

function renderLane(lane) {
  if (!laneHud) return
  laneHud.querySelectorAll('i').forEach((cell, i) => cell.classList.toggle('is-on', i === lane))
}

function renderGuide(guide) {
  if (!guideEl || !guideAction || !guideDistance) return
  const show = !!(guide && profile.settings.guide && app.dataset.view === 'game')
  guideEl.classList.toggle('is-on', show)
  document.querySelectorAll('.touch-btn.is-hint').forEach((btn) => btn.classList.remove('is-hint'))
  if (!show) {
    guideEl.classList.remove('is-urgent')
    return
  }

  guideEl.dataset.dir = guide.dir
  guideEl.classList.toggle('is-urgent', !!guide.urgent)
  guideArrow?.querySelector('use')?.setAttribute('href', `#i-arrow-${guide.dir}`)
  guideAction.textContent = guide.label
  guideDistance.textContent = guide.distance <= 3 ? 'NOW' : `${guide.distance} m away`
  document.querySelector(`.touch-btn[data-action="${guide.action}"]`)?.classList.add('is-hint')
}

function clearGuide() {
  guideEl?.classList.remove('is-on', 'is-urgent')
  document.querySelectorAll('.touch-btn.is-hint').forEach((btn) => btn.classList.remove('is-hint'))
}

function updateHud(d) {
  lastHud = d
  const pct = Math.min(100, (d.distance / Math.max(1, d.target)) * 100)
  hudRefs.progress.style.width = `${pct}%`
  hudRefs.marker.style.left = `${pct}%`
  hudRefs.distance.textContent = `${fmt(d.distance)} / ${fmt(d.target)} m`
  hudRefs.coins.textContent = fmt(d.coins)
  hudRefs.speed.textContent = Math.round(d.speed)

  const goalB = hudRefs.goal.querySelector('b')
  if (goalB) goalB.textContent = fmt(d.coins)
  hudRefs.goal.classList.toggle('is-done', d.coins >= d.coinGoal)

  if (d.hearts !== lastHearts || hudRefs.hearts.children.length !== Math.min(6, d.maxHearts)) {
    renderHearts(d.hearts, d.maxHearts)
  }

  if (d.magnet > 0) {
    hudRefs.magnet.classList.add('is-on')
    hudRefs.magnetBar.style.width = `${Math.min(100, (d.magnet / Math.max(0.01, d.magnetMax)) * 100)}%`
    hudRefs.magnetTime.textContent = `${Math.ceil(d.magnet)}s`
  } else {
    hudRefs.magnet.classList.remove('is-on')
  }
  hudRefs.shield.classList.toggle('is-on', !!d.shield)

  const stateKey = d.starHints ? `${d.starHints.cleared}${d.starHints.coins}${d.starHints.clean}` : ''
  if (stateKey !== hintState && d.starHints) {
    hintState = stateKey
    hudRefs.hints.querySelectorAll('[data-hint]').forEach((el) => {
      el.classList.toggle('is-on', !!d.starHints[el.dataset.hint])
    })
  }

  renderLane(d.lane ?? 1)
  renderGuide(d.guide)
}

function setHudStage(world, stage, cfg) {
  hudRefs.world.textContent = WORLDS[world - 1].name
  hudRefs.stage.textContent = `Stage ${stage} / ${STAGES_PER_WORLD}`
  hudRefs.goal.innerHTML = `${icon('coin')}<b>0</b> / ${cfg.coinGoal}`
  hudRefs.progress.style.width = '0%'
  hudRefs.marker.style.left = '0%'
  hudRefs.distance.textContent = `0 / ${fmt(cfg.distance)} m`
  hudRefs.coins.textContent = '0'
  hudRefs.speed.textContent = '0'
  hudRefs.magnet.classList.remove('is-on')
  hudRefs.shield.classList.remove('is-on')
  hudRefs.hints.querySelectorAll('[data-hint]').forEach((el) => el.classList.remove('is-on'))
  hintState = ''
  lastHearts = -1
  clearGuide()
  renderLane(1)
}

function hudToast(text, kind = '') {
  clearTimeout(hudToastTimer)
  hudToastEl.textContent = text
  hudToastEl.className = `hud-toast ${kind}`.trim()
  void hudToastEl.offsetWidth
  hudToastEl.classList.add('show')
  hudToastTimer = setTimeout(() => hudToastEl.classList.remove('show'), 1500)
}

function triggerFlash(kind) {
  flash.className = 'flash'
  void flash.offsetWidth
  flash.classList.add(kind)
}

// ── screens ──────────────────────────────────────────────────
const screens = ['login', 'menu', 'worlds', 'shop', 'help']

function showScreen(name, preview = true) {
  screens.forEach((s) => {
    $(`screen-${s}`)?.classList.toggle('is-active', s === name)
  })
  app.dataset.view = name
  hud.classList.remove('is-active')
  hud.setAttribute('aria-hidden', 'true')
  clearGuide()
  if (preview) {
    const theme = WORLDS[Math.min(20, Math.max(1, menuTarget.world)) - 1]
    applyThemeVars(theme)
    game.enterAttract(theme)
  }
  if (name === 'login') renderLogin()
  if (name === 'worlds') renderWorlds()
  if (name === 'shop') renderShop()
}

function hideScreens() {
  screens.forEach((s) => $(`screen-${s}`)?.classList.remove('is-active'))
}

function applyThemeVars(theme) {
  app.style.setProperty('--w1', theme.sky[0])
  app.style.setProperty('--w2', theme.sky[1])
  app.style.setProperty('--wa', theme.accent)
  app.style.setProperty('--wb', theme.accent2)
}

function closeOverlay(el) {
  el.classList.remove('is-open')
}

function closeAllOverlays() {
  closeOverlay(stagesOverlay)
  closeOverlay(pauseOverlay)
  closeOverlay(resultOverlay)
  closeOverlay(settingsOverlay)
  closeOverlay(tutorialOverlay)
  closeOverlay(accountOverlay)
  stagesOpen = false
  pauseOpen = false
  settingsOpen = false
  resultsOpen = false
  accountOpen = false
  tutorialOnboarding = false
}

// ── runner profiles / login ──────────────────────────────────
function summarizeProfile(p) {
  const stars = totalStars(p)
  const values = Object.values(p.stars || {})
  const cleared = values.filter((s) => s > 0).length
  const next = p.complete ? { world: 20, stage: 5 } : p.next || { world: 1, stage: 1 }
  return { stars, cleared, next, complete: !!p.complete }
}

function renderLogin() {
  const accounts = listAccounts()
  let sessionId = getSession()
  let sessionAccount = getAccount(sessionId)
  if (sessionId && !sessionAccount) {
    clearSession()
    sessionId = null
    sessionAccount = null
  }

  loginContinue.innerHTML = sessionAccount
    ? `<button id="btn-continue-session" class="login-continue-btn" type="button">
        <span class="lc-avatar">${sessionAccount.avatar}</span>
        <span class="lc-copy"><small>LAST RUNNER ON THIS DEVICE</small><b>Continue as ${esc(sessionAccount.name)}</b></span>
        ${icon('arrow-right')}
      </button>`
    : ''
  $('btn-continue-session')?.addEventListener('click', () => enterProfile(sessionAccount))

  if (!accounts.length) {
    loginAccounts.innerHTML = `
      <div class="login-empty">
        <span class="login-empty-icon">${icon('user')}</span>
        <b>No runners yet</b>
        <p>Create your first runner on the right. Every star, coin and upgrade will be waiting next time.</p>
        <button class="link-btn" id="btn-login-create" type="button">${icon('arrow-right')} Create a runner</button>
      </div>`
  } else {
    loginAccounts.innerHTML = accounts
      .map((account) => {
        const p = readProfileSlot(account.id)
        const s = summarizeProfile(p)
        const current = account.id === sessionId
        return `<button class="login-account ${current ? 'is-current' : ''}" data-account-id="${esc(account.id)}" type="button">
          <span class="la-avatar">${account.avatar || '🦊'}</span>
          <span class="la-main">
            <span class="la-top">
              <b>${esc(account.name)}</b>
              ${current ? '<span class="la-tag la-tag-live">LAST PLAYED</span>' : ''}
              ${account.pinHash ? `<span class="la-tag">${icon('lock')} PIN</span>` : ''}
            </span>
            <span class="la-stats">${s.stars} ${icon('star')} · ${s.cleared}/100 stages</span>
            <small>${s.complete ? 'All 100 stages cleared' : `Next: World ${s.next.world} · Stage ${s.next.stage}`}</small>
          </span>
          <span class="la-go">${icon('arrow-right')}</span>
        </button>`
      })
      .join('')
  }

  const legacy = hasLegacyProfile()
  const note = $('login-note')
  if (!accounts.length && legacy) {
    note.innerHTML = `${icon('spark')} Progress from an earlier version was found on this device. Create a runner to claim it.`
  } else if (!accounts.length) {
    note.innerHTML = `${icon('spark')} New here? Create a runner and the temple will remember your progress.`
  } else {
    note.innerHTML = `${icon('check')} Each runner keeps separate stars, coins and upgrades. Choose any profile to resume.`
  }
  $('signup-error').textContent = ''
}

function buildAvatarPicker() {
  const picker = $('avatar-picker')
  if (!picker) return
  picker.innerHTML = AVATARS.map(
    (avatar, i) =>
      `<button class="avatar-option ${avatar === signupAvatar ? 'is-on' : ''}" data-avatar="${avatar}" type="button" aria-pressed="${avatar === signupAvatar}" aria-label="Emblem ${i + 1}: ${avatar}">${avatar}</button>`,
  ).join('')
}

function selectAvatar(avatar) {
  if (!AVATARS.includes(avatar)) return
  signupAvatar = avatar
  $('avatar-picker')
    ?.querySelectorAll('[data-avatar]')
    .forEach((btn) => {
      const on = btn.dataset.avatar === avatar
      btn.classList.toggle('is-on', on)
      btn.setAttribute('aria-pressed', String(on))
    })
}

function chooseAccount(id) {
  const account = getAccount(id)
  if (!account) {
    renderLogin()
    return
  }
  if (account.pinHash && getSession() !== account.id) openPin(account)
  else enterProfile(account)
}

function openPin(account) {
  pinAccount = account
  $('pin-avatar').textContent = account.avatar || '🦊'
  $('pin-name').textContent = account.name
  $('pin-input').value = ''
  $('pin-error').textContent = ''
  loginPin.hidden = false
  setTimeout(() => $('pin-input')?.focus(), 80)
}

function closePin() {
  loginPin.hidden = true
  pinAccount = null
  $('pin-input').value = ''
  $('pin-error').textContent = ''
}

function submitPin() {
  if (!pinAccount) return
  const res = signIn(pinAccount.id, $('pin-input').value)
  if (!res.ok) {
    $('pin-error').textContent = res.error
    $('pin-input').select()
    return
  }
  const account = res.account
  closePin()
  enterProfile(account)
}

function handleCreateAccount() {
  const name = $('signup-name').value
  const pin = $('signup-pin').value.trim()
  const pinCheck = validatePin(pin)
  const errorEl = $('signup-error')
  if (!pinCheck.ok) {
    errorEl.textContent = pinCheck.error
    return
  }

  const hadAccounts = listAccounts().length > 0
  const res = createAccount({ name, pin, avatar: signupAvatar })
  if (!res.ok) {
    errorEl.textContent = res.error
    return
  }
  errorEl.textContent = ''
  $('signup-name').value = ''
  $('signup-pin').value = ''
  enterProfile(res.account, { isNew: true, claimLegacy: !hadAccounts })
}

function enterProfile(account, { isNew = false, claimLegacy = false } = {}) {
  closePin()
  currentAccount = account || null
  signedIn = true
  if (account) setSession(account.id)
  else clearSession()

  profile = useProfileSlot(account?.id ?? null, { claimLegacy })
  sound.setSound(profile.settings.sound)
  sound.setMusic(profile.settings.music)
  game.setQuality(profile.settings.quality)

  showScreen('menu', false)
  renderMenu()
  renderWorlds()
  renderShop()
  syncSettingsUI()
  renderAccountChrome()
  currentWorld = menuTarget.world
  currentStage = menuTarget.stage
  game.enterAttract(WORLDS[Math.min(20, Math.max(1, menuTarget.world)) - 1])

  const who = account?.name || 'Guest'
  toast(isNew ? `Runner created — welcome, ${esc(who)}` : `Welcome back, ${esc(who)}`)
  if (!profile.tutorialSeen) {
    setTimeout(() => {
      if (signedIn && app.dataset.view === 'menu') openTutorial(true)
    }, 700)
  }
}

function showLogin(message = '') {
  if (signedIn) saveProfile(profile)
  signedIn = false
  currentAccount = null
  clearSession()
  closePin()
  closeAllOverlays()
  closeOverlay(settingsOverlay)
  settingsOpen = false
  hud.classList.remove('is-active')
  hud.setAttribute('aria-hidden', 'true')
  clearGuide()
  game.quit()
  game.enterAttract(WORLDS[Math.min(20, Math.max(1, menuTarget.world)) - 1])
  profile = useProfileSlot(null)
  renderAccountChrome()
  showScreen('login', false)
  if (message) toast(message)
}

// ── account panel ────────────────────────────────────────────
function renderAccountChrome() {
  const avatar = currentAccount?.avatar || '🎒'
  const name = currentAccount?.name || 'Guest'
  $('account-avatar').textContent = avatar
  $('account-name').textContent = name
  $('settings-avatar').textContent = avatar
  $('settings-runner-name').textContent = currentAccount ? name : 'Guest runner'
}

function renderAccountOverlay() {
  const p = profile
  const s = summarizeProfile(p)
  const avatar = currentAccount?.avatar || '🎒'
  const name = currentAccount?.name || 'Guest runner'
  const since = currentAccount?.createdAt
    ? new Date(currentAccount.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const nextText = s.complete ? 'All 100 stages conquered' : `World ${s.next.world} · Stage ${s.next.stage}`

  $('account-body').innerHTML = `
    <div class="account-hero">
      <span class="account-avatar account-avatar-xl">${avatar}</span>
      <div>
        <p class="eyebrow">${currentAccount ? 'LOCAL RUNNER' : 'GUEST RUNNER'}</p>
        <h3>${esc(name)}</h3>
        <p>${currentAccount ? `Saved on this device${since ? ` since ${since}` : ''}` : 'Playing without a named profile. Create one any time.'}</p>
      </div>
    </div>
    <div class="account-stat-grid">
      <div><span>STARS</span><b>${s.stars}<small>/300</small></b></div>
      <div><span>STAGES</span><b>${s.cleared}<small>/100</small></b></div>
      <div><span>COINS</span><b>${fmt(p.coins)}</b></div>
      <div><span>DISTANCE</span><b>${fmt(p.stats.distance)}<small>m</small></b></div>
    </div>
    <div class="account-next">
      <span class="account-next-icon">${icon('map')}</span>
      <div><b>Next run</b><p>${nextText}</p></div>
    </div>
    <p class="account-tip">${currentAccount ? 'Switch runners any time — each profile keeps its own progress.' : 'Create a named runner to protect this progress and resume it from the login screen.'}</p>`
  $('btn-delete-account').style.display = currentAccount ? '' : 'none'
}

function openAccount() {
  accountOpen = true
  renderAccountOverlay()
  accountOverlay.classList.add('is-open')
}

function closeAccount() {
  accountOpen = false
  closeOverlay(accountOverlay)
}

function switchRunner() {
  closeAccount()
  closeSettings()
  showLogin()
}

function deleteCurrentAccount() {
  if (!currentAccount) return
  const id = currentAccount.id
  const name = currentAccount.name
  if (!window.confirm(`Delete “${name}” and all of this runner's stars, coins and upgrades? This cannot be undone.`)) return
  signedIn = false
  deleteProfileSlot(id)
  deleteAccount(id)
  showLogin(`Runner “${name}” deleted`)
}

// ── tutorial ─────────────────────────────────────────────────
const TUTORIAL_STEPS = [
  {
    title: 'Three lanes. One survivor.',
    copy: 'The track has three lanes. Move sideways to dodge blocks and grab coins. On a keyboard use A / D or ← / →. On a phone, swipe left or right.',
    visual: `<div class="tut-lane-demo">
      <div class="tut-lane"><span>LEFT</span></div>
      <div class="tut-lane is-active"><span>YOU</span><i class="tut-runner"></i></div>
      <div class="tut-lane"><span>RIGHT</span></div>
    </div>
    <div class="tut-keys"><kbd>A</kbd><kbd>←</kbd><span>or swipe sideways</span><kbd>D</kbd><kbd>→</kbd></div>`,
  },
  {
    title: 'Jump low. Slide low.',
    copy: 'Low hurdles need a jump. Hanging beams need a slide. Press SPACE / W or swipe up to jump, and S or swipe down to slide.',
    visual: `<div class="tut-actions-demo">
      <div class="tut-action"><span class="tut-arrow is-up">${icon('arrow-up')}</span><b>JUMP</b><small>low hurdles</small><kbd>SPACE</kbd></div>
      <div class="tut-action"><span class="tut-arrow is-down">${icon('arrow-down')}</span><b>SLIDE</b><small>hanging beams</small><kbd>S</kbd></div>
    </div>`,
  },
  {
    title: 'Follow the glowing arrow.',
    copy: 'A large arrow appears before every danger and tells you the exact move. The matching control glows too, so you always know where to tap.',
    visual: `<div class="tut-guide-demo">
      <span class="tut-arrow is-right">${icon('arrow-right')}</span>
      <div><b>MOVE RIGHT</b><small>12 m away</small></div>
    </div>
    <p class="tut-tip">${icon('spark')} You can turn guide arrows off in Settings, or replay this guide from How to play.</p>`,
  },
]

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialStep]
  const last = tutorialStep === TUTORIAL_STEPS.length - 1
  $('tutorial-kicker').textContent = tutorialStep === 0 ? '30-SECOND GUIDE' : `STEP ${tutorialStep + 1} OF ${TUTORIAL_STEPS.length}`
  $('tutorial-title').textContent = step.title
  $('tutorial-copy').textContent = step.copy
  $('tutorial-visual').innerHTML = step.visual
  $('tutorial-dots').innerHTML = TUTORIAL_STEPS.map(
    (_, i) => `<i class="${i === tutorialStep ? 'is-on' : ''}"></i>`,
  ).join('')
  $('btn-tutorial-back').disabled = tutorialStep === 0
  $('btn-tutorial-next').querySelector('span').textContent = last ? 'Start running' : 'Next'
}

function openTutorial(onboarding = false) {
  tutorialOnboarding = onboarding
  tutorialStep = 0
  renderTutorial()
  tutorialOverlay.classList.add('is-open')
}

function closeTutorial() {
  closeOverlay(tutorialOverlay)
  tutorialOnboarding = false
  if (signedIn && !profile.tutorialSeen) {
    profile.tutorialSeen = true
    saveProfile(profile)
  }
}

function nextTutorial() {
  if (tutorialStep < TUTORIAL_STEPS.length - 1) {
    tutorialStep++
    renderTutorial()
    return
  }
  closeTutorial()
}

function backTutorial() {
  if (tutorialStep > 0) {
    tutorialStep--
    renderTutorial()
  }
}

// ── menu ─────────────────────────────────────────────────────
function renderMenu() {
  const stars = totalStars(profile)
  const cleared = profile.stats.cleared
  $('wallet-coins').textContent = fmt(profile.coins)
  $('wallet-stars').textContent = fmt(stars)
  $('menu-stars').textContent = fmt(stars)
  $('menu-cleared').textContent = fmt(cleared)
  $('menu-distance').textContent = `${fmt(profile.stats.distance)} m`

  let target
  if (profile.complete) {
    const ls = profile.lastStage || { world: 20, stage: 5 }
    target = { world: ls.world, stage: ls.stage }
  } else {
    target = { world: profile.next.world, stage: profile.next.stage }
  }
  const cfg = getStageConfig(target.world, target.stage)
  const theme = WORLDS[target.world - 1]
  const wp = worldProgress(profile, target.world)
  const lo = loadout(profile, cfg)

  menuTarget = target
  selectedWorld = target.world
  applyThemeVars(theme)

  $('cc-world').textContent = pad2(target.world)
  $('cc-ghost').textContent = pad2(target.world)
  $('cc-chip').textContent = `STAGE ${target.stage}`
  $('cc-name').textContent = theme.name
  $('cc-stage').textContent = `${cfg.title} · Stage ${target.stage}/${STAGES_PER_WORLD}`
  $('cc-distance').textContent = fmt(cfg.distance)
  $('cc-coins').textContent = fmt(cfg.coinGoal)
  $('cc-hearts').textContent = lo.hearts
  $('cc-stars').innerHTML = `${icon('star')}<b>${wp.stars}</b><span>/ ${wp.max}</span>`
  $('cc-progress').style.width = `${(wp.stars / wp.max) * 100}%`
  $('continue-label').textContent = `World ${target.world} · Stage ${target.stage}`
  $('btn-play-card').querySelector('span').textContent = profile.complete ? 'Relive the final run' : 'Enter the temple'
  $('btn-play').querySelector('small').textContent = profile.complete ? 'FINAL RELIC' : 'CONTINUE RUN'

  if (profile.complete) {
    $('cc-tip').innerHTML = `The relic is yours. Replay any stage to chase a <b>perfect score</b>.`
  } else if (wp.stars > 0) {
    $('cc-tip').innerHTML = `World mastery <b>${wp.stars}/${wp.max} stars</b>. Next: stage ${target.stage} — ${cfg.title.toLowerCase()}.`
  } else {
    $('cc-tip').innerHTML = `Collect <b>${cfg.coinGoal} coins</b> and take no hits for three stars.`
  }

  // continue card art palette
  const art = $('cc-art')
  art.style.setProperty('--w1', theme.sky[0])
  art.style.setProperty('--w2', theme.sky[1])
  art.style.setProperty('--wa', theme.accent)

  if (!profile.complete) {
    game.enterAttract(theme)
  }
}

// ── worlds ───────────────────────────────────────────────────
function renderWorlds() {
  const clearedStages = Object.values(profile.stars).filter((s) => s > 0).length
  const pct = Math.round((clearedStages / 100) * 100)
  $('worlds-progress-label').textContent = `${clearedStages} of 100 stages`
  $('worlds-progress-pct').textContent = `${pct}%`
  $('worlds-progress-bar').style.width = `${pct}%`
  $('wallet-coins').textContent = fmt(profile.coins)
  $('wallet-stars').textContent = fmt(totalStars(profile))

  worldGrid.innerHTML = WORLDS.map((theme, i) => {
    const w = i + 1
    const unlocked = isWorldUnlocked(profile, w)
    const wp = worldProgress(profile, w)
    const mastered = wp.stars === wp.max
    const frontier = profile.next.world === w && !profile.complete
    const locked = !unlocked
    return `
      <button class="world-card ${locked ? 'is-locked' : ''} ${mastered ? 'is-mastered' : ''} ${frontier ? 'is-frontier' : ''}"
        data-world="${w}" data-unlocked="${unlocked ? 1 : 0}" ${locked ? 'aria-disabled="true"' : ''}
        style="--w1:${theme.sky[0]};--w2:${theme.sky[1]};--wa:${theme.accent};animation-delay:${Math.min(i * 0.028, 0.5)}s"
        aria-label="World ${w}: ${theme.name}${locked ? ' (locked)' : ''}">
        <div class="wc-art">
          <span class="wc-tag">WORLD ${pad2(w)}</span>
          <span class="wc-num">${pad2(w)}</span>
          ${templeSVG}
          ${locked ? `<span class="wc-lock">${icon('lock')}</span>` : ''}
          ${mastered ? `<span class="wc-crown">${icon('trophy')}</span>` : ''}
        </div>
        <div class="wc-body">
          <div class="wc-top">
            <h3>${theme.name}</h3>
            <span class="wc-starcount">${icon('star')}${wp.stars}/${wp.max}</span>
          </div>
          <p class="wc-blurb">${theme.blurb}</p>
          <div class="wc-pips">
            ${Array.from({ length: STAGES_PER_WORLD }, (_, s) => {
              const st = profile.stars[stageKey(w, s + 1)] || 0
              return `<i style="--fill:${(st / 3) * 100}%"></i>`
            }).join('')}
          </div>
        </div>
      </button>`
  }).join('')

  worldGrid.querySelectorAll('.world-card').forEach((card) => attachTilt(card))
}

function attachTilt(card) {
  if (card.dataset.unlocked !== '1') return
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width - 0.5
    const y = (e.clientY - r.top) / r.height - 0.5
    card.style.transform = `translateY(-4px) rotateX(${(-y * 5).toFixed(2)}deg) rotateY(${(x * 7).toFixed(2)}deg)`
  })
  card.addEventListener('pointerleave', () => {
    card.style.transform = ''
  })
}

function openStages(world) {
  selectedWorld = world
  const theme = WORLDS[world - 1]
  const wp = worldProgress(profile, world)
  applyThemeVars(theme)
  game.enterAttract(theme)

  const rows = Array.from({ length: STAGES_PER_WORLD }, (_, s) => {
    const stage = s + 1
    const cfg = getStageConfig(world, stage)
    const key = stageKey(world, stage)
    const stars = profile.stars[key] || 0
    const unlocked = isStageUnlocked(profile, world, stage)
    const current = profile.next.world === world && profile.next.stage === stage && !profile.complete
    const best = stageBest(profile, world, stage)
    return `
      <div class="stage-row ${unlocked ? 'is-open' : 'is-locked'} ${current ? 'is-current' : ''} ${stars > 0 ? 'is-done' : ''}"
        style="--w1:${theme.sky[0]};--w2:${theme.sky[1]}">
        <div class="stage-num">${ROMAN[s]}</div>
        <div class="stage-info">
          <h4>${cfg.title}</h4>
          <p>
            <span>${icon('map')}${fmt(cfg.distance)} m</span>
            <span>${icon('coin')}${cfg.coinGoal} coins</span>
            <span>${icon('heart')}${cfg.hearts} hearts</span>
          </p>
          ${best ? `<div class="stage-best">Best score ${fmt(best.score)} · ${fmt(best.distance)} m</div>` : ''}
        </div>
        <div class="stage-stars">${starRow(stars)}</div>
        ${
          unlocked
            ? `<button class="stage-play" data-play-world="${world}" data-play-stage="${stage}">${icon('play')}${stars > 0 ? 'Replay' : 'Run'}</button>`
            : `<button class="stage-play locked" disabled>${icon('lock')}Locked</button>`
        }
      </div>`
  }).join('')

  stageSheet.innerHTML = `
    <header class="sheet-top" style="--w1:${theme.sky[0]};--w2:${theme.sky[1]};--wa:${theme.accent}">
      <button class="icon-btn sheet-close" data-close aria-label="Close">${icon('close')}</button>
      <p class="eyebrow">WORLD ${pad2(world)} · ${wp.stars} / ${wp.max} STARS</p>
      <h2>${theme.name}</h2>
      <span class="sheet-ghost">${pad2(world)}</span>
      <div class="sheet-meta">
        <span>${theme.blurb}</span>
        <span>${icon('star')}${wp.stars} stars</span>
      </div>
    </header>
    <div class="sheet-body">${rows}</div>
    <div class="sheet-foot">
      <span>${wp.stars === wp.max ? 'World mastered — every star claimed' : 'Three stars per stage · five stages per world'}</span>
      <span>Stage ${pad2(world)} · 01 — 05</span>
    </div>`

  stagesOverlay.classList.add('is-open')
  stagesOpen = true
}

// ── shop ─────────────────────────────────────────────────────
function renderShop() {
  $('shop-coins').textContent = fmt(profile.coins)
  shopGrid.innerHTML = Object.entries(UPGRADES)
    .map(([type, def]) => {
      const level = profile.upgrades[type] || 0
      const maxed = level >= def.max
      const cost = upgradeCost(type, level)
      const can = !maxed && profile.coins >= cost
      return `
      <article class="shop-card" data-type="${type}">
        <div class="shop-icon">${icon(def.icon)}</div>
        <h3>${def.name}</h3>
        <p class="shop-desc">${def.desc}</p>
        <div class="shop-rank">
          <span>RANK ${level} / ${def.max}</span>
          <div class="rank-pips">
            ${Array.from({ length: def.max }, (_, i) => `<i class="${i < level ? 'on' : ''}"></i>`).join('')}
          </div>
        </div>
        <span class="shop-effect">${level > 0 ? def.effect(level) : 'Not yet forged'}</span>
        <button class="shop-buy" data-buy="${type}" ${maxed || !can ? 'disabled' : ''}>
          ${
            maxed
              ? `<span>${icon('check')}Fully forged</span>`
              : `<span>${can ? 'Forge upgrade' : 'Need more coins'}</span><span class="cost">${icon('coin')}${fmt(cost)}</span>`
          }
        </button>
      </article>`
    })
    .join('')
}

// ── stage lifecycle ──────────────────────────────────────────
function startStage(world, stage) {
  currentWorld = world
  currentStage = stage
  resultsOpen = false
  hideScreens()
  closeAllOverlays()
  flash.className = 'flash'

  const cfg = getStageConfig(world, stage)
  const theme = WORLDS[world - 1]
  applyThemeVars(theme)
  app.dataset.view = 'game'
  hud.classList.add('is-active')
  hud.setAttribute('aria-hidden', 'false')
  setHudStage(world, stage, cfg)
  renderHearts(loadout(profile, cfg).hearts, loadout(profile, cfg).hearts)

  game.start({
    theme,
    config: cfg,
    loadout: loadout(profile, cfg),
    worldName: theme.name,
  })

  sound.unlock()
  sound.whoosh()

  countdown.innerHTML = '<span>READY</span>'
  countdown.classList.remove('is-go')
  countdown.classList.add('show')
  clearTimeout(goTimer)
  clearTimeout(countdownTimer)
  goTimer = setTimeout(() => {
    countdown.querySelector('span').textContent = 'GO!'
    countdown.classList.add('is-go')
    countdownTimer = setTimeout(() => countdown.classList.remove('show', 'is-go'), 850)
  }, 900)
}

function handleGo() {
  sound.whoosh()
}

function openPause() {
  if (pauseOpen || resultsOpen) return
  pauseOpen = true
  game.pause()
  const cfg = getStageConfig(currentWorld, currentStage)
  $('pause-stage').textContent = `${currentWorld}-${currentStage}`
  $('pause-distance').textContent = `${lastHud ? fmt(lastHud.distance) : 0} / ${fmt(cfg.distance)} m`
  $('pause-coins').textContent = fmt(lastHud ? lastHud.coins : 0)
  syncSettingsUI()
  pauseOverlay.classList.add('is-open')
}

function resumeGame() {
  if (!pauseOpen) return
  pauseOpen = false
  closeOverlay(pauseOverlay)
  game.resume()
}

function restartStage() {
  closeOverlay(pauseOverlay)
  pauseOpen = false
  startStage(currentWorld, currentStage)
}

function quitToMap() {
  closeOverlay(pauseOverlay)
  pauseOpen = false
  clearGuide()
  hud.classList.remove('is-active')
  hud.setAttribute('aria-hidden', 'true')
  game.quit()
  game.enterAttract(WORLDS[currentWorld - 1])
  app.dataset.view = 'worlds'
  showScreen('worlds', false)
  renderWorlds()
}

// ── results ──────────────────────────────────────────────────
function showResults(result, cleared) {
  if (resultsOpen) return
  resultsOpen = true
  lastResult = result
  pauseOpen = false
  clearGuide()
  closeOverlay(pauseOverlay)

  const cfg = result.config
  const theme = WORLDS[cfg.world - 1] || WORLDS[0]
  const bonus = cleared ? cfg.reward : 0
  const banked = result.coins + bonus
  const prevNext = { ...profile.next }

  const record = recordRun(profile, {
    world: cfg.world,
    stage: cfg.stage,
    distance: result.distance,
    coins: banked,
    score: result.score,
    hits: result.hits,
    stars: result.stars,
    cleared,
    time: result.time,
  })

  $('wallet-coins').textContent = fmt(profile.coins)
  $('wallet-stars').textContent = fmt(totalStars(profile))
  if (profile.next.world > prevNext.world && !profile.complete) {
    setTimeout(() => toast(`World ${pad2(profile.next.world)} unlocked — ${WORLDS[profile.next.world - 1].name}`), 900)
  }

  const modal = $('result-modal')
  modal.dataset.state = cleared ? 'clear' : 'fail'
  modal.style.setProperty('--w1', theme.sky[0])
  modal.style.setProperty('--w2', theme.sky[1])
  modal.style.setProperty('--wa', theme.accent)

  $('result-kicker').textContent = cleared
    ? result.stars === 3
      ? 'FLAWLESS ESCAPE'
      : 'STAGE CLEARED'
    : 'RUN ENDED'
  $('result-title').textContent = theme.name
  $('result-sub').textContent = `Stage ${cfg.stage} · ${cfg.title}`
  $('result-message').textContent = cleared
    ? result.stars === 3
      ? 'Untouched. The temple remembers your name.'
      : result.stars === 2
        ? 'The gate yields. A little more gold next time.'
        : 'You escaped — barely. The gate closes behind you.'
    : 'The temple claims another runner. The relic waits.'

  const starEls = $('result-stars').querySelectorAll('.ico')
  starEls.forEach((el, i) => {
    el.classList.toggle('lit', cleared && i < result.stars)
    el.style.animationDelay = `${0.12 + i * 0.14}s`
  })

  $('res-distance').textContent = fmt(result.distance)
  $('res-coins').textContent = fmt(banked)
  $('res-coins-note').textContent = bonus > 0 ? `incl. +${fmt(bonus)} bonus` : 'collected'
  $('res-score').textContent = fmt(result.score)
  $('res-time').textContent = formatTime(result.time)

  const extras = []
  if (record.newBest) extras.push(`<span class="extra-pill">${icon('trophy')}New personal best</span>`)
  if (bonus > 0) extras.push(`<span class="extra-pill">${icon('coin')}+${fmt(bonus)} stage reward</span>`)
  if (cleared && result.stars === 3) extras.push(`<span class="extra-pill">${icon('spark')}Flawless · no hits</span>`)
  if (!cleared && result.distance < cfg.distance) {
    extras.push(`<span class="extra-pill">${icon('map')}${fmt(cfg.distance - result.distance)} m short of the gate</span>`)
  }
  if (profile.complete) extras.push(`<span class="extra-pill">${icon('trophy')}All 100 stages conquered</span>`)
  $('result-extra').innerHTML = extras.join('')

  const btnNext = $('btn-next')
  const btnRetry = $('btn-retry')
  btnRetry.className = `btn ${cleared ? 'btn-ghost' : 'btn-gold'}`
  btnNext.className = 'btn btn-gold'

  if (profile.complete) {
    nextTarget = null
    btnNext.querySelector('span').textContent = 'World map'
    btnNext.classList.remove('btn-gold')
    btnNext.classList.add('btn-ghost')
  } else {
    nextTarget = nextStageAfter(cfg.world, cfg.stage)
    btnNext.querySelector('span').textContent = 'Next stage'
  }
  btnNext.style.display = cleared ? '' : 'none'

  // confetti
  const confetti = $('confetti')
  if (cleared) {
    const colors = [theme.accent, theme.accent2, '#fff6d5', '#ffffff', theme.sky[1]]
    confetti.innerHTML = Array.from({ length: 36 }, () => {
      const c = colors[Math.floor(Math.random() * colors.length)]
      return `<i style="--x:${Math.random() * 100}%;--w:${4 + Math.random() * 5}px;--h:${6 + Math.random() * 9}px;--c:${c};--d:${1.4 + Math.random() * 1.6}s;--delay:${Math.random() * 0.5}s;--drift:${(Math.random() - 0.5) * 160}px;--rot:${Math.random() * 720 - 360}deg"></i>`
    }).join('')
  } else {
    confetti.innerHTML = ''
  }

  resultOverlay.classList.add('is-open')
  if (cleared) {
    sound.complete()
    if (result.stars > 0) {
      for (let i = 0; i < result.stars; i++) setTimeout(() => sound.star(i), 500 + i * 170)
    }
  } else {
    sound.fail()
  }

  renderMenu()
  renderWorlds()
  renderShop()
}

function nextStageAfter(world, stage) {
  if (stage < STAGES_PER_WORLD) return { world, stage: stage + 1 }
  if (world < WORLDS.length) return { world: world + 1, stage: 1 }
  return null
}

function closeResults() {
  resultsOpen = false
  closeOverlay(resultOverlay)
}

function resultsToMap() {
  closeResults()
  clearGuide()
  hud.classList.remove('is-active')
  hud.setAttribute('aria-hidden', 'true')
  game.quit()
  const w = lastResult?.config.world || currentWorld
  game.enterAttract(WORLDS[w - 1])
  app.dataset.view = 'worlds'
  showScreen('worlds', false)
  renderWorlds()
}

// ── settings / toggles ───────────────────────────────────────
function syncSettingsUI() {
  const s = profile.settings
  $('switch-sound').classList.toggle('is-on', s.sound)
  $('switch-sound').setAttribute('aria-checked', String(s.sound))
  $('switch-music').classList.toggle('is-on', s.music)
  $('switch-music').setAttribute('aria-checked', String(s.music))
  $('switch-guide').classList.toggle('is-on', s.guide !== false)
  $('switch-guide').setAttribute('aria-checked', String(s.guide !== false))
  $('btn-sound-pause').classList.toggle('is-on', s.sound)
  $('btn-music-pause').classList.toggle('is-on', s.music)
  $('quality-seg')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('is-on', b.dataset.quality === s.quality))
  $('settings-quality-label').textContent = s.quality
}

function toggleSound() {
  sound.unlock()
  profile.settings.sound = !profile.settings.sound
  sound.setSound(profile.settings.sound)
  saveProfile(profile)
  syncSettingsUI()
  if (profile.settings.sound) sound.click()
}

function toggleMusic() {
  sound.unlock()
  profile.settings.music = !profile.settings.music
  sound.setMusic(profile.settings.music)
  saveProfile(profile)
  syncSettingsUI()
}

function setQuality(q) {
  profile.settings.quality = q
  sound.unlock()
  sound.click()
  saveProfile(profile)
  game.setQuality(q)
  syncSettingsUI()
}

function toggleGuide() {
  profile.settings.guide = !profile.settings.guide
  saveProfile(profile)
  sound.unlock()
  sound.click()
  syncSettingsUI()
  if (!profile.settings.guide) clearGuide()
  else if (lastHud?.guide) renderGuide(lastHud.guide)
}

function openSettings() {
  settingsOpen = true
  syncSettingsUI()
  settingsOverlay.classList.add('is-open')
}

function closeSettings() {
  settingsOpen = false
  closeOverlay(settingsOverlay)
}

// ── toast ────────────────────────────────────────────────────
function toast(message) {
  clearTimeout(toastTimer)
  toastEl.innerHTML = `${icon('spark')}<span>${message}</span>`
  toastEl.classList.add('show')
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2800)
}

// ── sharing state ────────────────────────────────────────────
function buy(type) {
  const res = buyUpgrade(profile, type)
  if (res.ok) {
    sound.power()
    toast(`${UPGRADES[type].name} forged · rank ${res.level}`)
    renderShop()
    renderMenu()
    $('wallet-coins').textContent = fmt(profile.coins)
  } else if (res.reason === 'coins') {
    toast('Not enough coins. Run deeper into the temple.')
  }
}

// ── events ───────────────────────────────────────────────────
function bindUI() {
  buildAvatarPicker()

  // login / runner picker
  loginAccounts.addEventListener('click', (e) => {
    if (e.target.closest('#btn-login-create')) {
      $('signup-name').focus()
      return
    }
    const card = e.target.closest('[data-account-id]')
    if (card) chooseAccount(card.dataset.accountId)
  })
  $('btn-guest').addEventListener('click', () => enterProfile(null))
  $('btn-create-account').addEventListener('click', handleCreateAccount)
  $('signup-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleCreateAccount()
  })
  $('signup-pin').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
  })
  $('avatar-picker').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-avatar]')
    if (btn) selectAvatar(btn.dataset.avatar)
  })
  $('btn-pin-submit').addEventListener('click', submitPin)
  $('btn-pin-cancel').addEventListener('click', closePin)
  $('pin-input').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6)
  })
  $('pin-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitPin()
  })
  loginPin.addEventListener('click', (e) => {
    if (e.target === loginPin) closePin()
  })
  $('btn-login-help').addEventListener('click', () => openTutorial(false))

  // account panel
  $('btn-account').addEventListener('click', openAccount)
  $('btn-account-close').addEventListener('click', closeAccount)
  $('btn-account-continue').addEventListener('click', closeAccount)
  $('btn-switch-profile').addEventListener('click', switchRunner)
  $('btn-delete-account').addEventListener('click', deleteCurrentAccount)
  accountOverlay.addEventListener('click', (e) => {
    if (e.target === accountOverlay) closeAccount()
  })

  // tutorial
  $('btn-replay-tutorial').addEventListener('click', () => openTutorial(false))
  $('btn-tutorial-close').addEventListener('click', closeTutorial)
  $('btn-tutorial-next').addEventListener('click', nextTutorial)
  $('btn-tutorial-back').addEventListener('click', backTutorial)
  tutorialOverlay.addEventListener('click', (e) => {
    if (e.target === tutorialOverlay) closeTutorial()
  })

  // start buttons
  const play = () => {
    const t = profile.complete ? profile.lastStage || menuTarget : menuTarget
    startStage(t.world, t.stage)
  }
  $('btn-play').addEventListener('click', play)
  $('btn-play-card').addEventListener('click', play)
  $('btn-worlds').addEventListener('click', () => showScreen('worlds', false))
  $('btn-shop').addEventListener('click', () => showScreen('shop', false))
  $('btn-help').addEventListener('click', () => showScreen('help', false))
  $('brand-home').addEventListener('click', () => {
    showScreen('menu')
    renderMenu()
  })
  document.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => {
      showScreen('menu')
      renderMenu()
    })
  })

  // settings
  $('btn-settings').addEventListener('click', openSettings)
  $('btn-settings-close').addEventListener('click', closeSettings)
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) closeSettings()
  })
  $('switch-sound').addEventListener('click', toggleSound)
  $('switch-music').addEventListener('click', toggleMusic)
  $('switch-guide').addEventListener('click', toggleGuide)
  $('btn-settings-switch').addEventListener('click', switchRunner)
  $('quality-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-quality]')
    if (b) setQuality(b.dataset.quality)
  })
  $('btn-reset').addEventListener('click', () => {
    if (!window.confirm('Erase every star, coin and upgrade? This cannot be undone.')) return
    profile = resetProfile()
    sound.setSound(profile.settings.sound)
    sound.setMusic(profile.settings.music)
    game.setQuality(profile.settings.quality)
    renderMenu()
    renderWorlds()
    renderShop()
    syncSettingsUI()
    renderAccountChrome()
    closeSettings()
    toast('Expedition reset — a fresh trail awaits')
  })

  // worlds
  worldGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.world-card')
    if (!card) return
    const world = Number(card.dataset.world)
    if (card.dataset.unlocked !== '1') {
      toast(`World ${pad2(world)} is sealed — clear the previous stage first.`)
      return
    }
    openStages(world)
  })

  // stage sheet
  stageSheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) {
      stagesOpen = false
      closeOverlay(stagesOverlay)
      return
    }
    const playBtn = e.target.closest('[data-play-world]')
    if (playBtn) {
      stagesOpen = false
      closeOverlay(stagesOverlay)
      startStage(Number(playBtn.dataset.playWorld), Number(playBtn.dataset.playStage))
    }
  })
  stagesOverlay.addEventListener('click', (e) => {
    if (e.target === stagesOverlay) {
      stagesOpen = false
      closeOverlay(stagesOverlay)
    }
  })

  // shop
  shopGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-buy]')
    if (btn) buy(btn.dataset.buy)
  })

  // pause
  $('btn-pause').addEventListener('click', openPause)
  $('btn-resume').addEventListener('click', resumeGame)
  $('btn-restart').addEventListener('click', restartStage)
  $('btn-quit').addEventListener('click', quitToMap)
  $('btn-sound-pause').addEventListener('click', toggleSound)
  $('btn-music-pause').addEventListener('click', toggleMusic)

  // result
  $('btn-result-map').addEventListener('click', resultsToMap)
  $('btn-retry').addEventListener('click', () => {
    closeResults()
    startStage(currentWorld, currentStage)
  })
  $('btn-next').addEventListener('click', () => {
    if (profile.complete || !nextTarget) {
      resultsToMap()
      return
    }
    const t = nextTarget
    closeResults()
    startStage(t.world, t.stage)
  })

  // touch buttons
  $('touch-controls').addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    e.preventDefault()
    const a = btn.dataset.action
    if (a === 'left') game.moveLane(-1)
    else if (a === 'right') game.moveLane(1)
    else if (a === 'jump') game.jump()
    else if (a === 'slide') game.slide()
  })

  // swipes & taps
  let touch = null
  window.addEventListener(
    'touchstart',
    (e) => {
      if (app.dataset.view !== 'game' || pauseOpen || resultsOpen) return
      const t = e.changedTouches[0]
      touch = { x: t.clientX, y: t.clientY, time: performance.now() }
    },
    { passive: true },
  )
  window.addEventListener(
    'touchend',
    (e) => {
      if (!touch) return
      if (app.dataset.view !== 'game' || pauseOpen || resultsOpen) {
        touch = null
        return
      }
      const t = e.changedTouches[0]
      const dx = t.clientX - touch.x
      const dy = t.clientY - touch.y
      const dt = performance.now() - touch.time
      touch = null
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) {
        if (dt < 320) game.jump()
        return
      }
      if (Math.abs(dx) > Math.abs(dy)) game.moveLane(dx > 0 ? 1 : -1)
      else if (dy < 0) game.jump()
      else game.slide()
    },
    { passive: true },
  )

  // keyboard: escape closes overlays / pauses; P pauses
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (!loginPin.hidden) {
        closePin()
        e.preventDefault()
      } else if (tutorialOverlay.classList.contains('is-open')) {
        closeTutorial()
        e.preventDefault()
      } else if (accountOpen) {
        closeAccount()
        e.preventDefault()
      } else if (settingsOpen) {
        closeSettings()
        e.preventDefault()
      } else if (stagesOpen) {
        stagesOpen = false
        closeOverlay(stagesOverlay)
        e.preventDefault()
      } else if (pauseOpen) {
        resumeGame()
        e.preventDefault()
      } else if (app.dataset.view === 'game' && (game.state === 'running' || game.state === 'ready')) {
        openPause()
        e.preventDefault()
      }
    } else if (app.dataset.view === 'game' && (e.key === 'p' || e.key === 'P')) {
      if (game.state === 'running' || game.state === 'ready') {
        openPause()
        e.preventDefault()
      }
    }
  })

  // pause when the tab loses focus mid-run
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !resultsOpen && (game.state === 'running' || game.state === 'ready')) {
      openPause()
    }
  })

  // audio unlock
  const unlock = () => {
    sound.unlock()
    sound.setSound(profile.settings.sound)
    sound.setMusic(profile.settings.music)
  }
  document.addEventListener('pointerdown', unlock, { once: true })
  document.addEventListener('keydown', unlock, { once: true })
}

// ── atoms ────────────────────────────────────────────────────
function buildEmbers() {
  const host = $('embers')
  let html = ''
  for (let i = 0; i < 18; i++) {
    const size = 1.5 + Math.random() * 3
    html += `<i style="--x:${Math.random() * 100}%;--s:${size}px;--d:${12 + Math.random() * 16}s;--delay:${-Math.random() * 24}s;--drift:${(Math.random() - 0.5) * 120}px"></i>`
  }
  host.innerHTML = html
}

// ── boot ─────────────────────────────────────────────────────
function bootGame() {
  buildEmbers()
  bindUI()

  const startTheme = WORLDS[Math.min(20, Math.max(1, profile.next.world)) - 1] || WORLDS[0]
  applyThemeVars(startTheme)
  game.setQuality(profile.settings.quality)
  syncSettingsUI()
  renderAccountChrome()
  currentWorld = 1
  currentStage = 1
  showScreen('login', false)
  game.enterAttract(startTheme)

  $('boot-text').textContent = 'Lighting the torches…'
  setTimeout(() => {
    boot.classList.add('is-done')
  }, 900)
  setTimeout(() => {
    boot.style.display = 'none'
  }, 1700)
}

bootGame()
