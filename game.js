/* ═══════════════════════════════════════════════════════════════════════
   ZOMBIE ROAD RUSH — game engine
   A hand-built canvas survival racer. No external game assets.
   ═══════════════════════════════════════════════════════════════════════ */

import { AudioEngine } from './audio.js';

const TAU = Math.PI * 2;
const VIEW_DIST = 245;
const STORAGE_KEY = 'zombie-road-rush-save-v1';
const MAX_DPR = 2;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clamp01 = (v) => clamp(v, 0, 1);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const approach = (value, target, amount) => {
  if (value < target) return Math.min(target, value + amount);
  return Math.max(target, value - amount);
};
const smoothstep = (e0, e1, value) => {
  const t = clamp01((value - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const hash = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
};
const rgba = (color, alpha = 1) =>
  `rgba(${Math.round(color[0])},${Math.round(color[1])},${Math.round(color[2])},${alpha})`;
const mixRgb = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const shadeRgb = (color, amount) => [
  clamp(color[0] + amount, 0, 255),
  clamp(color[1] + amount, 0, 255),
  clamp(color[2] + amount, 0, 255),
];
const formatScore = (value) => Math.max(0, Math.round(value || 0)).toLocaleString('en-US');
const formatPadded = (value) => formatScore(value).padStart(6, '0');
const formatKm = (meters) => (Math.max(0, meters) / 1000).toFixed(2);
const pad2 = (value) => String(Math.max(0, Math.floor(value))).padStart(2, '0');

// Older Safari builds lack Path2D.roundRect; keep the procedural HUD props working.
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function roundRect(x, y, w, h, radii) {
    const r = Math.min(Math.abs(w) / 2, Math.abs(h) / 2, Array.isArray(radii) ? radii[0] : radii || 0);
    this.beginPath();
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
    return this;
  };
}

const DEFAULT_SETTINGS = {
  best: 0,
  lastDistance: 0,
  totalCoins: 0,
  runs: 0,
  musicOn: true,
  musicVol: 0.55,
  sfxOn: true,
  sfxVol: 0.75,
  shake: true,
  muted: false,
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch (error) {
    return { ...DEFAULT_SETTINGS };
  }
}

function persistSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // Storage can be disabled; the game still runs.
  }
}

const settings = loadSettings();
const sound = new AudioEngine(settings);

/* ── palettes ─────────────────────────────────────────────────────── */
const PALETTES = {
  day: {
    skyTop: [55, 105, 139],
    skyMid: [128, 171, 184],
    skyLow: [244, 204, 154],
    haze: [206, 199, 177],
    sun: [255, 247, 203],
    sunGlow: [255, 220, 144],
    cloud: [255, 250, 235],
    cloudShade: [186, 195, 193],
    far: [96, 122, 132],
    farSnow: [188, 200, 197],
    mid: [58, 94, 88],
    near: [36, 70, 61],
    forest: [22, 49, 39],
    forestHi: [43, 75, 51],
    ground: [64, 84, 52],
    grass: [78, 101, 59],
    shoulder: [104, 83, 58],
    asphalt: [66, 69, 69],
    asphaltAlt: [61, 64, 64],
    edge: [218, 207, 178],
    line: [237, 217, 160],
    tree: [24, 51, 39],
    treeHi: [46, 78, 53],
    trunk: [55, 41, 30],
    guard: [144, 145, 133],
    rock: [110, 114, 106],
  },
  sunset: {
    skyTop: [36, 32, 72],
    skyMid: [137, 63, 91],
    skyLow: [255, 157, 82],
    haze: [224, 139, 103],
    sun: [255, 222, 142],
    sunGlow: [255, 120, 70],
    cloud: [255, 204, 169],
    cloudShade: [137, 82, 101],
    far: [102, 67, 91],
    farSnow: [183, 137, 136],
    mid: [69, 52, 77],
    near: [37, 42, 54],
    forest: [24, 31, 36],
    forestHi: [47, 49, 48],
    ground: [75, 65, 47],
    grass: [88, 76, 49],
    shoulder: [87, 61, 48],
    asphalt: [57, 54, 58],
    asphaltAlt: [52, 50, 54],
    edge: [222, 196, 165],
    line: [245, 210, 129],
    tree: [20, 29, 32],
    treeHi: [44, 49, 43],
    trunk: [46, 33, 27],
    guard: [139, 124, 112],
    rock: [101, 92, 87],
  },
  night: {
    skyTop: [8, 13, 29],
    skyMid: [21, 30, 53],
    skyLow: [58, 53, 75],
    haze: [69, 68, 85],
    sun: [204, 218, 238],
    sunGlow: [110, 140, 190],
    cloud: [92, 102, 123],
    cloudShade: [45, 52, 73],
    far: [47, 53, 73],
    farSnow: [99, 108, 130],
    mid: [31, 40, 53],
    near: [17, 27, 34],
    forest: [10, 18, 22],
    forestHi: [22, 34, 34],
    ground: [42, 43, 35],
    grass: [53, 54, 41],
    shoulder: [61, 48, 41],
    asphalt: [42, 42, 46],
    asphaltAlt: [38, 38, 42],
    edge: [195, 186, 166],
    line: [224, 197, 129],
    tree: [10, 18, 22],
    treeHi: [28, 40, 36],
    trunk: [31, 24, 21],
    guard: [107, 103, 100],
    rock: [73, 72, 72],
  },
};

function mixPalette(a, b, t) {
  const out = {};
  for (const key of Object.keys(a)) out[key] = mixRgb(a[key], b[key], t);
  return out;
}

function getPalette(distance, menu = false) {
  let mix = menu ? 0.68 : smoothstep(160, 1250, distance);
  if (!menu) mix = Math.max(mix, 0.08);
  const pal = mixPalette(PALETTES.day, PALETTES.sunset, mix);
  const night = menu ? 0 : smoothstep(3900, 5700, distance);
  return night > 0 ? mixPalette(pal, PALETTES.night, night) : pal;
}

/* ── UI references ────────────────────────────────────────────────── */
const $ = (id) => document.getElementById(id);
const app = $('app');
const canvas = $('gameCanvas');
const ui = {
  menuScreen: $('menuScreen'),
  hud: $('hud'),
  pauseScreen: $('pauseScreen'),
  gameoverScreen: $('gameoverScreen'),
  scoreValue: $('scoreValue'),
  distanceValue: $('distanceValue'),
  killsValue: $('killsValue'),
  coinsValue: $('coinsValue'),
  levelValue: $('levelValue'),
  threatPips: $('threatPips'),
  threatIndicator: document.querySelector('.threat-indicator'),
  healthFill: $('healthFill'),
  healthValue: $('healthValue'),
  healthMeter: document.querySelector('.health-meter'),
  nitroFill: $('nitroFill'),
  nitroValue: $('nitroValue'),
  ammoValue: $('ammoValue'),
  ammoBox: document.querySelector('.ammo-box'),
  speedValue: $('speedValue'),
  speedo: document.querySelector('.speedo'),
  comboBadge: $('comboBadge'),
  comboValue: $('comboValue'),
  comboTimer: $('comboTimer'),
  statusEffects: $('statusEffects'),
  toast: $('toast'),
  toastTitle: $('toastTitle'),
  toastText: $('toastText'),
  menuBest: $('menuBest'),
  cardBest: $('cardBest'),
  cardLast: $('cardLast'),
  pauseScore: $('pauseScore'),
  pauseDistance: $('pauseDistance'),
  pauseKills: $('pauseKills'),
  finalScore: $('finalScore'),
  finalDistance: $('finalDistance'),
  finalKills: $('finalKills'),
  finalCoins: $('finalCoins'),
  finalSpeed: $('finalSpeed'),
  finalLevel: $('finalLevel'),
  newBestBanner: $('newBestBanner'),
  gameoverLine: $('gameoverLine'),
  gameoverTip: $('gameoverTip'),
  countdown: $('countdown'),
  damageFlash: $('damageFlash'),
  modalLayer: $('modalLayer'),
  instructionsModal: $('instructionsModal'),
  settingsModal: $('settingsModal'),
  musicToggle: $('musicToggle'),
  musicVolume: $('musicVolume'),
  musicVolLabel: $('musicVolLabel'),
  sfxToggle: $('sfxToggle'),
  sfxVolume: $('sfxVolume'),
  sfxVolLabel: $('sfxVolLabel'),
  shakeToggle: $('shakeToggle'),
  btnHudSound: $('btnHudSound'),
  toastIconUse: document.querySelector('#toast .toast-icon use'),
  touchControls: $('touchControls'),
};

const hudCache = {
  score: '',
  distance: '',
  kills: '',
  coins: '',
  level: '',
  health: '',
  nitro: '',
  ammo: '',
  speed: '',
  effects: '',
  combo: '',
  threat: '',
};

let game = null;
let toastTimeout = null;
let toastHideTimeout = null;
let modalOpen = false;

/* ── UI behavior ──────────────────────────────────────────────────── */
function setText(element, value, cacheKey = null) {
  if (!element) return;
  if (cacheKey && hudCache[cacheKey] === value) return;
  if (cacheKey) hudCache[cacheKey] = value;
  if (element.textContent !== value) element.textContent = value;
}

function showScreen(screen) {
  app.dataset.screen = screen;
  const inGame = screen === 'playing' || screen === 'paused' || screen === 'gameover';
  ui.menuScreen.classList.toggle('is-hidden', screen !== 'menu');
  ui.hud.classList.toggle('is-hidden', !inGame);
  ui.pauseScreen.classList.toggle('is-hidden', screen !== 'paused');
  ui.gameoverScreen.classList.toggle('is-hidden', screen !== 'gameover');
  if (screen !== 'playing') {
    ui.countdown.classList.remove('pop', 'go');
    ui.countdown.textContent = '';
  }
  document.body.classList.toggle('in-game', inGame);
}

function refreshMenuStats() {
  const best = formatPadded(settings.best);
  ui.menuBest.textContent = best;
  ui.cardBest.textContent = formatScore(settings.best);
  ui.cardLast.textContent = `${formatKm(settings.lastDistance)} KM`;
}

function updateHud(state) {
  setText(ui.scoreValue, formatScore(state.score), 'score');
  setText(ui.distanceValue, formatKm(state.distance), 'distance');
  setText(ui.killsValue, String(state.kills), 'kills');
  setText(ui.coinsValue, String(state.coins), 'coins');
  setText(ui.levelValue, pad2(state.level), 'level');

  const health = clamp(Math.ceil(state.health), 0, 100);
  setText(ui.healthValue, String(health), 'health');
  ui.healthFill.style.width = `${health}%`;
  ui.healthMeter.classList.toggle('critical', health <= 28);

  const nitro = clamp(Math.ceil(state.nitro), 0, 100);
  if (hudCache.nitro !== String(nitro)) {
    hudCache.nitro = String(nitro);
    if (ui.nitroValue.firstChild && ui.nitroValue.firstChild.nodeType === Node.TEXT_NODE) {
      ui.nitroValue.firstChild.nodeValue = String(nitro);
    } else {
      ui.nitroValue.textContent = String(nitro);
    }
  }
  ui.nitroFill.style.width = `${nitro}%`;
  ui.nitroFill.classList.toggle('full', nitro >= 100);

  const ammo = Math.max(0, Math.floor(state.ammo));
  setText(ui.ammoValue, String(ammo), 'ammo');
  ui.ammoBox.classList.toggle('low', ammo <= 5);

  const speed = Math.round(state.speed);
  setText(ui.speedValue, String(speed), 'speed');
  ui.speedo.style.setProperty('--speed', String(clamp((state.speed / 340) * 100, 0, 100)));

  const threat = clamp((state.level % 10 || 10) * 10, 10, 100);
  if (hudCache.threat !== String(threat)) {
    hudCache.threat = String(threat);
    ui.threatIndicator.style.setProperty('--threat', `${threat}%`);
  }

  const multiplier = state.comboMultiplier || 1;
  const showCombo = multiplier > 1;
  ui.comboBadge.classList.toggle('visible', showCombo);
  if (showCombo) {
    setText(ui.comboValue, `×${multiplier.toFixed(1).replace('.0', '')}`, 'combo');
    ui.comboTimer.style.setProperty('--combo', `${clamp(state.comboRatio * 100, 0, 100)}%`);
  }

  let effects = '';
  if (state.shield > 0) {
    effects += `<span class="effect-chip"><svg class="icon"><use href="#i-shield"/></svg>SHIELD ${Math.ceil(state.shield)}s</span>`;
  }
  if (state.nitroActive) {
    effects += `<span class="effect-chip" style="border-color:rgba(255,179,31,.32);background:rgba(255,179,31,.1);color:var(--hazard)"><svg class="icon"><use href="#i-bolt"/></svg>BOOST</span>`;
  }
  if (effects !== hudCache.effects) {
    hudCache.effects = effects;
    ui.statusEffects.innerHTML = effects;
  }
}

function updateSoundButton() {
  const muted = settings.muted;
  ui.btnHudSound.classList.toggle('muted', muted);
  ui.btnHudSound.setAttribute('aria-label', muted ? 'Unmute sound' : 'Mute sound');
  ui.btnHudSound.title = muted ? 'Unmute sound' : 'Mute sound';
}

function showToast(title, text = '', tone = '', duration = 1700) {
  clearTimeout(toastTimeout);
  clearTimeout(toastHideTimeout);
  ui.toastTitle.textContent = title;
  ui.toastText.textContent = text;
  ui.toast.className = `toast visible ${tone}`.trim();
  const iconMap = {
    warn: '#i-warning',
    shield: '#i-shield',
    gold: '#i-coin',
    nitro: '#i-bolt',
    ammo: '#i-ammo',
    repair: '#i-wrench',
    '': '#i-bolt',
  };
  ui.toastIconUse.setAttribute('href', iconMap[tone] || '#i-bolt');
  toastTimeout = setTimeout(() => {
    ui.toast.classList.remove('visible');
  }, duration);
}

function flashDamage(strength = 1) {
  if (!ui.damageFlash) return;
  if (ui.damageFlash.animate) {
    ui.damageFlash.animate(
      [{ opacity: 0.7 * strength }, { opacity: 0 }],
      { duration: 440, easing: 'cubic-bezier(.15,.8,.3,1)' },
    );
  }
}

function showCountdown(value, isGo = false) {
  ui.countdown.textContent = value;
  ui.countdown.classList.remove('pop', 'go');
  void ui.countdown.offsetWidth;
  ui.countdown.classList.add('pop');
  if (isGo) ui.countdown.classList.add('go');
}

function applySettingsToUI() {
  ui.musicToggle.checked = settings.musicOn;
  ui.sfxToggle.checked = settings.sfxOn;
  ui.shakeToggle.checked = settings.shake;
  ui.musicVolume.value = String(Math.round(settings.musicVol * 100));
  ui.sfxVolume.value = String(Math.round(settings.sfxVol * 100));
  ui.musicVolLabel.textContent = `${Math.round(settings.musicVol * 100)}%`;
  ui.sfxVolLabel.textContent = `${Math.round(settings.sfxVol * 100)}%`;
  ui.musicVolume.style.setProperty('--range', `${settings.musicVol * 100}%`);
  ui.sfxVolume.style.setProperty('--range', `${settings.sfxVol * 100}%`);
  updateSoundButton();
}

function openModal(which) {
  modalOpen = true;
  ui.modalLayer.classList.add('is-open');
  ui.modalLayer.setAttribute('aria-hidden', 'false');
  ui.instructionsModal.style.display = which === 'instructions' ? '' : 'none';
  ui.settingsModal.style.display = which === 'settings' ? '' : 'none';
  sound.ensure();
  sound.sfx('ui');
}

function closeModal() {
  modalOpen = false;
  ui.modalLayer.classList.remove('is-open');
  ui.modalLayer.setAttribute('aria-hidden', 'true');
  sound.sfx('ui');
  setTimeout(() => {
    if (!modalOpen) {
      ui.instructionsModal.style.display = '';
      ui.settingsModal.style.display = '';
    }
  }, 240);
}

function saveSettings() {
  persistSettings(settings);
}

function startNewRun() {
  if (!game) return;
  sound.ensure();
  if (modalOpen) closeModal();
  sound.setScene('playing');
  showScreen('playing');
  game.start();
  updateSoundButton();
  sound.sfx('ui');
}

function pauseRun() {
  if (!game || game.state !== 'playing') return;
  game.pause();
  ui.pauseScore.textContent = formatScore(game.score);
  ui.pauseDistance.textContent = `${formatKm(game.distance)} KM`;
  ui.pauseKills.textContent = String(game.kills);
  showScreen('paused');
  sound.setScene('paused');
  sound.sfx('ui');
}

function resumeRun() {
  if (!game || game.state !== 'paused') return;
  if (modalOpen) closeModal();
  game.resume();
  showScreen('playing');
  sound.setScene('playing');
  sound.sfx('ui');
}

function restartRun() {
  if (!game) return;
  if (modalOpen) closeModal();
  showScreen('playing');
  game.start();
  sound.setScene('playing');
  sound.sfx('ui');
}

function quitToMenu() {
  if (!game) return;
  if (modalOpen) closeModal();
  game.toMenu();
  showScreen('menu');
  refreshMenuStats();
  sound.setScene('menu');
  sound.sfx('ui');
}

const GAMEOVER_TIPS = [
  'Shoot barrels before they get close.',
  'Chain zombie kills to multiply your score.',
  'Nitro also makes roadkill hits more brutal.',
  'Roadblocks can be shot apart. Rocks take two hits.',
  'Repair kits restore more armor when timed well.',
  'The horde gets faster every threat level. Keep moving.',
  'Shield pickups can carry you through a full horde.',
];

function handleGameOver(stats) {
  const newBest = stats.score > settings.best;
  if (newBest) settings.best = stats.score;
  settings.lastDistance = Math.max(settings.lastDistance, stats.distance);
  settings.totalCoins += stats.coins;
  settings.runs += 1;
  saveSettings();

  ui.finalScore.textContent = formatScore(stats.score);
  ui.finalDistance.textContent = `${formatKm(stats.distance)} KM`;
  ui.finalKills.textContent = String(stats.kills);
  ui.finalCoins.textContent = String(stats.coins);
  ui.finalSpeed.textContent = `${Math.round(stats.topSpeed)} KM/H`;
  ui.finalLevel.textContent = pad2(stats.level);
  ui.newBestBanner.classList.toggle('is-hidden', !newBest);
  ui.gameoverLine.textContent =
    stats.distance > 2500
      ? 'You made the dead zone remember your name.'
      : stats.kills > 12
        ? 'You took plenty of them with you.'
        : 'The horde got the last laugh.';
  ui.gameoverTip.textContent = pick(GAMEOVER_TIPS);
  showScreen('gameover');
  refreshMenuStats();
  sound.setScene('gameover');
}

/* ── input ────────────────────────────────────────────────────────── */
const input = {
  left: false,
  right: false,
  accelerate: false,
  brake: false,
  shoot: false,
  nitro: false,
};

function clearInput() {
  input.left = false;
  input.right = false;
  input.accelerate = false;
  input.brake = false;
  input.shoot = false;
  input.nitro = false;
  document.querySelectorAll('.touch-controls .pressed').forEach((el) => el.classList.remove('pressed'));
}

function isTypingTarget(target) {
  return target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

window.addEventListener('keydown', (event) => {
  if (isTypingTarget(event.target)) return;
  const code = event.code;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(code)) event.preventDefault();

  if (code === 'Escape') {
    if (modalOpen) {
      closeModal();
      return;
    }
    if (game && game.state === 'playing') {
      pauseRun();
      return;
    }
    if (game && game.state === 'paused') {
      resumeRun();
      return;
    }
  }

  if (modalOpen) return;

  if (code === 'Enter' && (!game || game.state === 'menu')) {
    startNewRun();
    return;
  }
  if (code === 'KeyM') {
    settings.muted = !settings.muted;
    sound.setMuted(settings.muted);
    saveSettings();
    updateSoundButton();
    showToast(settings.muted ? 'AUDIO MUTED' : 'AUDIO ON', 'Press M to toggle', '');
    return;
  }
  if (code === 'KeyP') {
    if (game && game.state === 'playing') pauseRun();
    else if (game && game.state === 'paused') resumeRun();
    return;
  }
  if (!game || (game.state !== 'playing' && game.state !== 'paused')) return;

  switch (code) {
    case 'KeyA':
    case 'ArrowLeft':
      input.left = true;
      break;
    case 'KeyD':
    case 'ArrowRight':
      input.right = true;
      break;
    case 'KeyW':
    case 'ArrowUp':
      input.accelerate = true;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.brake = true;
      break;
    case 'Space':
    case 'KeyJ':
      input.shoot = true;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.nitro = true;
      break;
    default:
      break;
  }
});

window.addEventListener('keyup', (event) => {
  switch (event.code) {
    case 'KeyA':
    case 'ArrowLeft':
      input.left = false;
      break;
    case 'KeyD':
    case 'ArrowRight':
      input.right = false;
      break;
    case 'KeyW':
    case 'ArrowUp':
      input.accelerate = false;
      break;
    case 'KeyS':
    case 'ArrowDown':
      input.brake = false;
      break;
    case 'Space':
    case 'KeyJ':
      input.shoot = false;
      break;
    case 'ShiftLeft':
    case 'ShiftRight':
      input.nitro = false;
      break;
    default:
      break;
  }
});

function bindTouchControls() {
  const buttons = document.querySelectorAll('[data-control]');
  const stateFor = (name) => {
    if (!game) return;
    if (name === 'left') input.left = true;
    if (name === 'right') input.right = true;
    if (name === 'brake') input.brake = true;
    if (name === 'shoot') input.shoot = true;
    if (name === 'nitro') input.nitro = true;
  };
  const release = (name) => {
    if (name === 'left') input.left = false;
    if (name === 'right') input.right = false;
    if (name === 'brake') input.brake = false;
    if (name === 'shoot') input.shoot = false;
    if (name === 'nitro') input.nitro = false;
  };
  buttons.forEach((button) => {
    const name = button.dataset.control;
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (!game || game.state !== 'playing') return;
      sound.ensure();
      stateFor(name);
      button.classList.add('pressed');
      button.setPointerCapture?.(event.pointerId);
    });
    const stop = (event) => {
      event.preventDefault();
      release(name);
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerup', stop);
    button.addEventListener('pointercancel', stop);
    button.addEventListener('lostpointercapture', stop);
    button.addEventListener('contextmenu', (event) => event.preventDefault());
  });
  const coarsePointer = window.matchMedia?.('(pointer: coarse), (hover: none)').matches;
  const smallTouch = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 560;
  if (coarsePointer || smallTouch) {
    document.body.classList.add('is-touch');
  }
}

/* ── entity data ──────────────────────────────────────────────────── */
const OBSTACLE_DATA = {
  crate: { hp: 1, damage: 9, laneWidth: 0.17, score: 90, label: 'WOODEN CRATE' },
  barrel: { hp: 1, damage: 15, laneWidth: 0.16, score: 130, label: 'FUEL BARREL' },
  rock: { hp: 2, damage: 20, laneWidth: 0.2, score: 80, label: 'BOULDER' },
  wreck: { hp: 3, damage: 26, laneWidth: 0.28, score: 180, label: 'WRECK' },
  barrier: { hp: 2, damage: 22, laneWidth: 0.34, score: 150, label: 'ROADBLOCK' },
};

const ZOMBIE_DATA = {
  walker: { hp: 1, damage: 10, laneWidth: 0.15, score: 120, run: 3.1, size: 1 },
  runner: { hp: 1, damage: 8, laneWidth: 0.13, score: 165, run: 7.8, size: 0.92 },
  brute: { hp: 3, damage: 24, laneWidth: 0.22, score: 280, run: 2.2, size: 1.34 },
};

const SHIRTS = [
  [122, 57, 44],
  [45, 71, 84],
  [109, 91, 47],
  [69, 56, 78],
  [75, 79, 61],
  [126, 81, 42],
];

const GAMEOVER_FALLBACK_STATS = {
  score: 0,
  distance: 0,
  kills: 0,
  coins: 0,
  topSpeed: 0,
  level: 1,
};

class Game {
  constructor(canvasElement, audio, callbacks) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d', { alpha: false });
    this.audio = audio;
    this.callbacks = callbacks;
    this.state = 'menu';
    this.time = 0;
    this.menuTime = 0;
    this.menuDistance = 620;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.kills = 0;
    this.level = 1;
    this.speed = 0;
    this.topSpeed = 0;
    this.health = 100;
    this.nitro = 100;
    this.ammo = 30;
    this.maxAmmo = 99;
    this.playerLane = 0;
    this.laneVelocity = 0;
    this.tilt = 0;
    this.wheelAngle = 0;
    this.countdown = 0;
    this.lastCountdown = 3;
    this.goFlash = 0;
    this.nitroActive = false;
    this.shield = 0;
    this.invulnerable = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboPeak = 0;
    this.hitFlash = 0;
    this.shake = 0;
    this.muzzleFlash = 0;
    this.recoil = 0;
    this.shootCooldown = 0;
    this.emptyWarnCooldown = 0;
    this.spawnTimer = 1.2;
    this.zombieTimer = 1.8;
    this.pickupTimer = 4.5;
    this.growlTimer = 6;
    this.levelToastTimer = 0;
    this.dyingTimer = 0;
    this.speedLines = [];
    this.entities = [];
    this.particles = [];
    this.tracers = [];
    this.floatTexts = [];
    this.clouds = [];
    this.menuZombies = [];
    this.entityId = 0;
    this.w = 1600;
    this.h = 900;
    this.dpr = 1;
    this.horizonY = 390;
    this.nearY = 738;
    this.lastFrame = 0;
    this.lastHudUpdate = 0;
    this.config = { ...DEFAULT_SETTINGS };
    this.roadPatches = [];
    this.setupClouds();
    this.setupMenuProps();
    this.resize();
    this.state = 'menu';
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const width = rect.width || window.innerWidth || 1600;
    const height = rect.height || window.innerHeight || 900;
    this.w = Math.max(320, width);
    this.h = Math.max(240, height);
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.lineJoin = 'round';
    this.ctx.lineCap = 'round';
    this.horizonY = this.h * 0.435;
    this.nearY = this.h * 0.82;
    this.buildRoadPatches();
  }

  setupClouds() {
    const rng = (seed) => hash(seed);
    this.clouds = Array.from({ length: 13 }, (_, i) => ({
      x: rng(i * 3.7 + 1.2),
      y: 0.055 + rng(i * 5.1 + 4) * 0.25,
      size: 0.42 + rng(i * 7.3 + 2) * 1.2,
      speed: 0.0025 + rng(i * 2.2 + 8) * 0.005,
      phase: rng(i * 9.7 + 3) * TAU,
      tone: rng(i * 4.4 + 6),
    }));
  }

  setupMenuProps() {
    this.menuZombies = [
      { type: 'zombie', kind: 'walker', z: 62, lane: -0.64, walkPhase: 0.4, seed: 0.21, dead: false, size: 1 },
      { type: 'zombie', kind: 'runner', z: 108, lane: 0.56, walkPhase: 2.2, seed: 0.62, dead: false, size: 1 },
      { type: 'zombie', kind: 'brute', z: 150, lane: -0.2, walkPhase: 4.1, seed: 0.8, dead: false, size: 1 },
      { type: 'obstacle', kind: 'barrel', z: 86, lane: 0.18, seed: 0.35, dead: false, phase: 0 },
    ];
  }

  buildRoadPatches() {
    this.roadPatches = [];
    for (let i = 0; i < 16; i++) {
      this.roadPatches.push({
        z: 14 + (i / 16) * 215 + hash(i * 5.3) * 8,
        lane: (hash(i * 7.2 + 2) - 0.5) * 1.2,
        len: 3 + hash(i * 4.9 + 8) * 8,
        alpha: 0.04 + hash(i * 2.4) * 0.05,
      });
    }
  }

  resetRunState() {
    this.time = 0;
    this.distance = 0;
    this.score = 0;
    this.coins = 0;
    this.kills = 0;
    this.level = 1;
    this.speed = 46;
    this.topSpeed = 46;
    this.health = 100;
    this.nitro = 100;
    this.ammo = 30;
    this.playerLane = 0;
    this.laneVelocity = 0;
    this.tilt = 0;
    this.wheelAngle = 0;
    this.countdown = 3.0;
    this.lastCountdown = 3;
    this.goFlash = 0;
    this.nitroActive = false;
    this.shield = 0;
    this.invulnerable = 0.8;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboPeak = 0;
    this.hitFlash = 0;
    this.shake = 0;
    this.muzzleFlash = 0;
    this.recoil = 0;
    this.shootCooldown = 0;
    this.emptyWarnCooldown = 0;
    this.spawnTimer = 1.25;
    this.zombieTimer = 2.1;
    this.pickupTimer = 4.2;
    this.growlTimer = 5;
    this.levelToastTimer = 0;
    this.dyingTimer = 0;
    this.speedLines = [];
    this.entities = [];
    this.particles = [];
    this.tracers = [];
    this.floatTexts = [];
    this.entityId = 0;
    this.lastCountdown = 3;
    this.callbacks.onCountdown?.('3', false);
  }

  start() {
    this.resetRunState();
    this.state = 'playing';
    this.callbacks.onHud?.(this.getHudState());
    this.callbacks.onStart?.();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.goFlash = 0;
    clearInput();
    this.audio.setScene('paused');
  }

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing';
    this.invulnerable = Math.max(this.invulnerable, 0.65);
    this.audio.setScene('playing');
    clearInput();
  }

  toMenu() {
    this.state = 'menu';
    this.speed = 0;
    this.nitroActive = false;
    this.entities = [];
    this.particles = [];
    this.tracers = [];
    this.floatTexts = [];
    this.setupMenuProps();
    clearInput();
    this.audio.setScene('menu');
  }

  updateCountdown(dt) {
    if (this.countdown <= 0) return;
    this.countdown -= dt;
    if (this.countdown <= 0) {
      this.countdown = 0;
      this.goFlash = 0.62;
      this.callbacks.onCountdown?.('GO', true);
      this.audio.sfx('level');
    } else {
      const n = Math.max(1, Math.ceil(this.countdown));
      if (n !== this.lastCountdown) {
        this.lastCountdown = n;
        this.callbacks.onCountdown?.(String(n), false);
        this.audio.sfx('ui');
      }
    }
  }

  update(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;
    this.updateCountdown(dt);
    const controls = this.countdown <= 0;
    this.updateDriving(dt, controls);

    if (controls) {
      this.updateShooting(dt);
      this.updateSpawning(dt);
      this.updateEntities(dt);
      this.updateCombo(dt);
    } else {
      this.updateParticles(dt);
    }

    if (this.state !== 'playing') return;

    this.distance += (this.speed / 3.6) * dt;
    this.score += (this.speed / 3.6) * dt * 0.42 * (this.nitroActive ? 1.3 : 1);
    this.audio.setScene('playing');
    this.updateEffects(dt);
    this.updateParticles(dt);
    this.updateSpeedLines(dt);
    this.checkLevel();
    this.callbacks.onHud?.(this.getHudState());
  }

  updateDriving(dt, controls) {
    const steer = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const steerSpeed = 2.65;
    this.laneVelocity = approach(this.laneVelocity, steer * steerSpeed, dt * 13.5);
    this.playerLane += this.laneVelocity * dt;
    if (this.playerLane < -0.86) {
      this.playerLane = -0.86;
      this.laneVelocity *= -0.13;
    } else if (this.playerLane > 0.86) {
      this.playerLane = 0.86;
      this.laneVelocity *= -0.13;
    }
    const targetTilt = steer * 0.055 + this.laneVelocity * 0.012;
    this.tilt = lerp(this.tilt, targetTilt, 1 - Math.exp(-dt * 9));

    this.updateNitro(dt, controls);

    let targetSpeed;
    if (!controls) targetSpeed = 46;
    else if (input.brake) targetSpeed = 36;
    else if (this.nitroActive) targetSpeed = 338;
    else if (input.accelerate) targetSpeed = 238 + Math.min(42, (this.level - 1) * 3);
    else targetSpeed = 128 + Math.min(28, (this.level - 1) * 2.4);

    let rate;
    if (targetSpeed > this.speed) {
      rate = this.nitroActive ? 175 : input.accelerate ? 54 : 26;
    } else {
      rate = input.brake ? 142 : this.nitroActive ? 80 : 33;
    }
    this.speed = approach(this.speed, targetSpeed, rate * dt);
    this.topSpeed = Math.max(this.topSpeed, this.speed);
    this.wheelAngle += (this.speed / 3.6) * dt * 2.2;
    if (this.speed > 160 && Math.random() < dt * 6) {
      this.spawnRoadDust();
    }
    if (this.nitroActive && Math.random() < dt * 20) {
      this.spawnNitroFlame();
    }
    if (this.health > 0 && this.health < 36 && Math.random() < dt * 9) {
      this.spawnDamageSmoke();
    }
    if (this.nitroActive) this.shake = Math.max(this.shake, 1.4);
  }

  updateNitro(dt, controls) {
    const wasActive = this.nitroActive;
    if (controls && input.nitro && !input.brake && this.nitro > 0.4) {
      this.nitroActive = true;
      this.nitro = Math.max(0, this.nitro - dt * 26);
      if (!wasActive) {
        this.audio.sfx('nitro');
        this.callbacks.onToast?.('NITRO ENGAGED', 'Hold SHIFT to keep burning', 'nitro', 1500);
      }
      if (this.nitro <= 0.4) {
        this.nitroActive = false;
        this.callbacks.onToast?.('NITRO EMPTY', 'Find a blue nitro cell', 'warn', 1500);
      }
    } else {
      this.nitroActive = false;
      if (this.nitro < 100) {
        this.nitro = Math.min(100, this.nitro + dt * (this.shield > 0 ? 1.65 : 1.05));
      }
      if (controls && input.nitro && !input.brake && this.nitro <= 0.4 && this.emptyWarnCooldown <= 0) {
        this.emptyWarnCooldown = 1.6;
        this.callbacks.onToast?.('NITRO EMPTY', 'Grab a nitro canister', 'warn', 1200);
      }
    }
    this.emptyWarnCooldown = Math.max(0, this.emptyWarnCooldown - dt);
  }

  updateShooting(dt) {
    this.shootCooldown = Math.max(0, this.shootCooldown - dt);
    this.muzzleFlash = Math.max(0, this.muzzleFlash - dt);
    this.recoil = Math.max(0, this.recoil - dt * 5);
    if (!input.shoot || this.shootCooldown > 0) return;
    if (this.ammo <= 0) {
      this.shootCooldown = 0.3;
      if (this.emptyWarnCooldown <= 0) {
        this.emptyWarnCooldown = 1.8;
        this.audio.sfx('empty');
        this.callbacks.onToast?.('OUT OF AMMO', 'Search the road for green crates', 'warn', 1400);
      }
      return;
    }

    this.shootCooldown = 0.16;
    this.ammo -= 1;
    this.muzzleFlash = 0.075;
    this.recoil = 1;
    this.audio.sfx('shoot');
    this.shake = Math.max(this.shake, 0.6);

    const aimWidth = 0.47;
    const candidates = this.entities
      .filter(
        (entity) =>
          !entity.dead &&
          (entity.type === 'zombie' || entity.type === 'obstacle') &&
          entity.z > 7 &&
          entity.z < 205 &&
          Math.abs(entity.lane - this.playerLane) < aimWidth,
      )
      .sort((a, b) => a.z - b.z);

    const muzzle = this.getCarMuzzlePosition();
    let target = candidates[0] || null;
    let targetPoint;
    if (target) {
      targetPoint = this.getEntityScreenPosition(target);
    } else {
      const far = this.project(155);
      const laneScale = far.half * 0.63;
      targetPoint = {
        x: far.x + this.playerLane * laneScale,
        y: far.y - this.h * 0.04,
      };
    }

    this.tracers.push({
      x1: muzzle.x,
      y1: muzzle.y,
      x2: targetPoint.x,
      y2: targetPoint.y,
      t: 0,
      dur: 0.1,
      hit: Boolean(target),
    });
    this.burst(muzzle.x, muzzle.y, 5, {
      color: ['#ffe38a', '#ffb31f', '#fff6d2'],
      speed: 150,
      life: 0.18,
      size: 2.4,
      gravity: 160,
      shape: 'spark',
    });

    if (target) {
      this.hitEntity(target, 1, 'bullet');
    } else {
      this.audio.sfx('hit');
    }
    if (this.ammo === 0) {
      this.callbacks.onToast?.('MAG EMPTY', 'Find an ammo crate', 'ammo', 1300);
    }
  }

  updateSpawning(dt) {
    this.spawnTimer -= dt;
    this.zombieTimer -= dt;
    this.pickupTimer -= dt;
    this.growlTimer -= dt;

    if (this.spawnTimer <= 0) {
      this.spawnObstacle();
      const base = Math.max(0.52, 1.55 - (this.level - 1) * 0.11);
      this.spawnTimer = base * rand(0.72, 1.25);
    }

    if (this.zombieTimer <= 0) {
      this.spawnZombieWave();
      const base = Math.max(0.58, 1.95 - (this.level - 1) * 0.115);
      this.zombieTimer = base * rand(0.76, 1.3);
    }

    if (this.pickupTimer <= 0) {
      this.spawnPickup();
      this.pickupTimer = rand(4.1, 7.3);
    }

    if (this.growlTimer <= 0) {
      this.growlTimer = rand(5.5, 10.5);
      const nearby = this.entities.some((e) => e.type === 'zombie' && !e.dead && e.z < 130);
      if (nearby) this.audio.sfx('zombie');
    }
  }

  spawnObstacle() {
    const lane = rand(-0.76, 0.76);
    const tooCrowded = this.entities.some(
      (e) => e.type === 'obstacle' && e.z > 180 && Math.abs(e.lane - lane) < 0.35,
    );
    if (tooCrowded) return;

    const roll = Math.random();
    let kind;
    if (this.level <= 1) {
      kind = roll < 0.4 ? 'crate' : roll < 0.7 ? 'barrel' : 'rock';
    } else if (this.level <= 3) {
      kind = roll < 0.28 ? 'crate' : roll < 0.52 ? 'barrel' : roll < 0.76 ? 'rock' : 'wreck';
    } else {
      kind = roll < 0.18 ? 'crate' : roll < 0.38 ? 'barrel' : roll < 0.59 ? 'rock' : roll < 0.8 ? 'wreck' : 'barrier';
    }
    const data = OBSTACLE_DATA[kind];
    this.entities.push({
      id: ++this.entityId,
      type: 'obstacle',
      kind,
      z: rand(226, 246),
      lane,
      hp: data.hp,
      maxHp: data.hp,
      dead: false,
      deathT: 0,
      deathVx: 0,
      hitFlash: 0,
      passed: false,
      seed: Math.random(),
      phase: rand(0, TAU),
    });
  }

  spawnZombieWave() {
    const groupChance = this.level >= 3 ? 0.34 : this.level >= 2 ? 0.15 : 0;
    const count = Math.random() < groupChance ? randInt(2, Math.min(3, 1 + Math.floor(this.level / 2))) : 1;
    const lanes = [-0.68, -0.23, 0.23, 0.68].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      const roll = Math.random();
      let kind = 'walker';
      if (this.level >= 2 && roll < 0.27) kind = 'runner';
      if (this.level >= 4 && roll > 0.8) kind = 'brute';
      const data = ZOMBIE_DATA[kind];
      this.entities.push({
        id: ++this.entityId,
        type: 'zombie',
        kind,
        z: rand(205, 243) + i * rand(6, 18),
        lane: count > 1 ? lanes[i] + rand(-0.08, 0.08) : rand(-0.78, 0.78),
        hp: data.hp,
        maxHp: data.hp,
        dead: false,
        deathT: 0,
        deathVx: 0,
        deathVy: 0,
        hitFlash: 0,
        passed: false,
        walkPhase: rand(0, TAU),
        seed: Math.random(),
        runSpeed: data.run + (this.level - 1) * 0.26,
        chase: 0.07 + Math.min(0.1, this.level * 0.012),
        phase: rand(0, TAU),
      });
    }
    if (count > 1 && this.level >= 4) {
      this.callbacks.onToast?.('HORDE DETECTED', 'Multiple contacts ahead', 'warn', 1500);
    }
  }

  spawnPickup() {
    const roll = Math.random();
    let kind;
    if (roll < 0.31) kind = 'coin';
    else if (roll < 0.51) kind = 'ammo';
    else if (roll < 0.68) kind = 'nitro';
    else if (roll < 0.86) kind = 'repair';
    else kind = 'shield';

    if (kind === 'coin') {
      const lane = rand(-0.68, 0.68);
      const startZ = rand(225, 245);
      for (let i = 0; i < 4; i++) {
        this.entities.push(this.makePickup(kind, startZ + i * 11, lane + Math.sin(i * 1.3) * 0.06));
      }
      return;
    }
    this.entities.push(this.makePickup(kind, rand(222, 244), rand(-0.7, 0.7)));
  }

  makePickup(kind, z, lane) {
    return {
      id: ++this.entityId,
      type: 'pickup',
      kind,
      z,
      lane,
      dead: false,
      deathT: 0,
      passed: false,
      phase: rand(0, TAU),
      seed: Math.random(),
    };
  }

  updateEntities(dt) {
    const worldStep = (this.speed / 3.6) * 1.72 * dt;
    let collided = false;

    for (const entity of this.entities) {
      if (entity.dead) {
        entity.deathT += dt;
        entity.z -= worldStep * 0.42;
        continue;
      }

      if (entity.type === 'zombie') {
        entity.z -= worldStep + entity.runSpeed * dt;
        entity.walkPhase += dt * (3.2 + entity.runSpeed * 0.42);
        if (entity.z < 140) {
          entity.lane += (this.playerLane - entity.lane) * entity.chase * dt * (1 + this.level * 0.016);
          entity.lane = clamp(entity.lane, -0.92, 0.92);
        }
      } else if (entity.type === 'pickup') {
        entity.z -= worldStep;
        entity.phase += dt * 2.6;
      } else {
        entity.z -= worldStep;
      }

      entity.hitFlash = Math.max(0, (entity.hitFlash || 0) - dt);

      const laneDiff = Math.abs(entity.lane - this.playerLane);

      if (entity.type === 'pickup' && entity.z < 9 && entity.z > -8 && laneDiff < 0.34) {
        this.collectPickup(entity);
        continue;
      }

      if (entity.type === 'zombie' && entity.z < 8 && entity.z > -7 && laneDiff < ZOMBIE_DATA[entity.kind].laneWidth + 0.15) {
        const roadKill = this.speed >= 78;
        this.killZombie(entity, roadKill ? 'car' : 'contact');
        if (roadKill) {
          this.takeDamage(4 + Math.max(0, 18 - this.level * 0.8), 'zombie');
          this.speed = Math.max(55, this.speed * 0.88);
          this.shake = Math.max(this.shake, 6);
          this.audio.sfx('crash');
        } else {
          this.takeDamage(12 + this.level, 'zombie');
          this.speed = Math.max(25, this.speed * 0.5);
        }
        collided = true;
        continue;
      }

      if (entity.type === 'obstacle') {
        const data = OBSTACLE_DATA[entity.kind];
        if (entity.z < 8 && entity.z > -6 && laneDiff < data.laneWidth + 0.15) {
          const impact = this.hitObstacleWithCar(entity);
          if (impact) collided = true;
          continue;
        }
      }

      if (!entity.passed && entity.z < -3 && (entity.type === 'zombie' || entity.type === 'obstacle')) {
        entity.passed = true;
        if (laneDiff > 0.3 && laneDiff < 0.67) {
          this.score += 35 * this.comboMultiplier();
          this.addFloatText('CLOSE CALL', this.getEntityScreenPosition(entity).x, this.nearY - this.h * 0.19, '#ffcf4b', 13);
        }
      }
    }

    if (collided) this.shake = Math.max(this.shake, 2);
    this.entities = this.entities.filter(
      (entity) => !(entity.dead && entity.deathT > 1.15) && entity.z > -26 && entity.z < VIEW_DIST + 80,
    );
  }

  hitObstacleWithCar(entity) {
    const data = OBSTACLE_DATA[entity.kind];
    if (entity.dead) return false;
    this.destroyObstacle(entity, 'car');
    const speedFactor = clamp(this.speed / 160, 0.55, 1.35);
    this.takeDamage(data.damage * speedFactor, entity.kind);
    const hardStop = ['wreck', 'barrier', 'rock'].includes(entity.kind);
    this.speed = Math.max(28, this.speed * (hardStop ? 0.38 : 0.58));
    this.shake = Math.max(this.shake, hardStop ? 10 : 6);
    if (entity.kind === 'barrel') this.audio.sfx('explosion');
    else this.audio.sfx('crash');
    return true;
  }

  hitEntity(entity, damage, source = 'bullet') {
    if (!entity || entity.dead) return;
    if (entity.type === 'zombie') {
      entity.hp -= damage;
      entity.hitFlash = 0.12;
      const point = this.getEntityScreenPosition(entity);
      this.burst(point.x, point.y - this.h * 0.04, 5, {
        color: ['#9dff5f', '#4e8f38', '#d8ffb0'],
        speed: 105,
        life: 0.42,
        size: 2.2,
        gravity: 220,
        shape: 'dot',
      });
      this.audio.sfx('hit');
      if (entity.hp <= 0) this.killZombie(entity, source);
    } else if (entity.type === 'obstacle') {
      entity.hp -= damage;
      entity.hitFlash = 0.1;
      const point = this.getEntityScreenPosition(entity);
      this.burst(point.x, point.y - this.h * 0.035, 7, {
        color: entity.kind === 'barrel' ? ['#ffd36a', '#ff8a22', '#fff1c2'] : ['#c9a66c', '#fff0c7', '#7a6044'],
        speed: 150,
        life: 0.4,
        size: 2,
        gravity: 300,
        shape: 'spark',
      });
      if (entity.hp <= 0) this.destroyObstacle(entity, source);
      else this.audio.sfx('hit');
    }
  }

  destroyObstacle(entity, source) {
    if (entity.dead) return;
    entity.dead = true;
    entity.deathT = 0;
    entity.deathVx = (source === 'car' ? rand(-90, 90) : rand(-40, 40));
    const data = OBSTACLE_DATA[entity.kind];
    const point = this.getEntityScreenPosition(entity);
    const colorMap = {
      crate: ['#e2bd7f', '#a9793f', '#5b3d22', '#fff0c7'],
      barrel: ['#ffd24b', '#ff7b1f', '#61391d', '#fff4c7'],
      rock: ['#aaa99f', '#63665f', '#d7d2c2', '#3b3c39'],
      wreck: ['#b5452f', '#62261f', '#d8b18b', '#2e2b2a'],
      barrier: ['#ffd346', '#d94d26', '#e8e1ca', '#2f2b28'],
    };
    const colors = colorMap[entity.kind] || colorMap.crate;
    this.burst(point.x, point.y - this.h * 0.04, entity.kind === 'barrel' ? 28 : 18, {
      color: colors,
      speed: entity.kind === 'barrel' ? 260 : 175,
      life: 0.8,
      size: 4,
      gravity: 430,
      shape: 'rect',
      front: true,
    });
    if (entity.kind === 'barrel') this.explodeBarrel(entity, point);
    else this.audio.sfx(source === 'car' ? 'crash' : 'hit');

    if (source === 'bullet') {
      const points = Math.round(data.score * this.comboMultiplier());
      this.score += points;
      this.addFloatText(`+${points}`, point.x, point.y - this.h * 0.1, '#ffcf4b', 14);
    }
  }

  explodeBarrel(entity, point) {
    this.shake = Math.max(this.shake, entity.z < 100 ? 12 : 4);
    this.burst(point.x, point.y - this.h * 0.03, 30, {
      color: ['#fff6c9', '#ffc32c', '#ff6b20', '#7a2b17'],
      speed: 310,
      life: 0.95,
      size: 6,
      gravity: 280,
      shape: 'dot',
      front: true,
    });
    this.burst(point.x, point.y - this.h * 0.05, 12, {
      color: ['#313331', '#1b1e1d', '#696a61'],
      speed: 95,
      life: 1.45,
      size: 15,
      gravity: -18,
      shape: 'smoke',
      front: false,
      drag: 0.35,
    });
    this.audio.sfx('explosion');
    for (const other of this.entities) {
      if (other === entity || other.dead) continue;
      if (other.type === 'zombie' && Math.abs(other.z - entity.z) < 44 && Math.abs(other.lane - entity.lane) < 0.62) {
        this.killZombie(other, 'explosion');
      } else if (other.type === 'obstacle' && other.kind === 'crate' && Math.abs(other.z - entity.z) < 34 && Math.abs(other.lane - entity.lane) < 0.45) {
        other.dead = true;
        other.deathT = 0;
      }
    }
  }

  killZombie(entity, source) {
    if (entity.dead) return;
    entity.dead = true;
    entity.deathT = 0;
    entity.deathVx = (source === 'car' ? rand(20, 120) : rand(-70, 70));
    entity.deathVy = source === 'car' ? -rand(20, 90) : -rand(10, 40);
    this.kills += 1;
    this.combo += 1;
    this.comboTimer = 2.8;
    this.comboPeak = Math.max(this.comboPeak, this.combo);
    const points = Math.round(ZOMBIE_DATA[entity.kind].score * this.comboMultiplier());
    this.score += points;
    this.nitro = Math.min(100, this.nitro + 1.15);
    const point = this.getEntityScreenPosition(entity);
    this.burst(point.x, point.y - this.h * 0.06, source === 'car' ? 24 : 14, {
      color: ['#b9ff71', '#75c94b', '#396b2e', '#e4ffca'],
      speed: source === 'car' ? 260 : 150,
      life: 0.85,
      size: 3.4,
      gravity: 420,
      shape: 'dot',
      front: true,
    });
    this.addFloatText(
      `${source === 'car' ? 'ROADKILL' : source === 'explosion' ? 'BLAST' : 'DOWN'} +${points}`,
      point.x,
      point.y - this.h * 0.13,
      source === 'car' ? '#ffcf4b' : '#b6ff4b',
      source === 'car' ? 14 : 12,
    );
    if (this.combo >= 2) this.audio.sfx('combo');
    else this.audio.sfx('hit');
    if (this.combo === 3) this.callbacks.onToast?.('CHAIN KILL', 'Score multiplier up', 'gold', 1300);
    if (this.combo === 8) this.callbacks.onToast?.('MASSACRE', 'The road is yours', 'gold', 1600);
  }

  collectPickup(entity) {
    if (entity.dead) return;
    entity.dead = true;
    entity.deathT = 0;
    const point = this.getEntityScreenPosition(entity);
    switch (entity.kind) {
      case 'coin':
        this.coins += 1;
        this.score += 50;
        this.audio.sfx('coin');
        this.burst(point.x, point.y - 15, 9, {
          color: ['#ffe27a', '#ffca3a', '#fff6ce'],
          speed: 125,
          life: 0.55,
          size: 2.2,
          gravity: 160,
          shape: 'spark',
          front: true,
        });
        this.addFloatText('+50', point.x, point.y - this.h * 0.08, '#ffd15a', 12);
        break;
      case 'ammo':
        this.ammo = Math.min(this.maxAmmo, this.ammo + 18);
        this.score += 30;
        this.audio.sfx('ammo');
        this.callbacks.onToast?.('AMMO +18', 'Keep the barrel hot', 'ammo', 1200);
        break;
      case 'nitro':
        this.nitro = Math.min(100, this.nitro + 44);
        this.score += 30;
        this.audio.sfx('pickup');
        this.callbacks.onToast?.('NITRO +44', 'Hold SHIFT to burn', 'nitro', 1200);
        break;
      case 'repair':
        this.health = Math.min(100, this.health + 30);
        this.score += 30;
        this.audio.sfx('repair');
        this.callbacks.onToast?.('ARMOR +30', 'Back in the fight', 'repair', 1300);
        break;
      case 'shield':
        this.shield = 8;
        this.score += 30;
        this.audio.sfx('shield');
        this.callbacks.onToast?.('SHIELD ONLINE', '8 seconds of protection', 'shield', 1600);
        break;
      default:
        break;
    }
    if (this.health <= 0) this.endRun();
  }

  takeDamage(amount, source = 'impact') {
    if (this.state !== 'playing') return;
    if (this.shield > 0) {
      this.shield = Math.max(0, this.shield - 0.3);
      this.shake = Math.max(this.shake, 4);
      this.audio.sfx('shield');
      this.addFloatText('BLOCKED', this.getCarScreenPosition().x, this.nearY - this.h * 0.2, '#67e8ed', 16);
      return;
    }
    if (this.invulnerable > 0) return;
    this.health = Math.max(0, this.health - amount);
    this.invulnerable = 0.92;
    this.hitFlash = 0.25;
    this.shake = Math.max(this.shake, 7);
    this.combo = 0;
    this.comboTimer = 0;
    this.callbacks.onDamage?.(amount);
    this.audio.sfx('damage');
    if (this.health <= 0) this.endRun();
  }

  updateCombo(dt) {
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.comboTimer = 0;
        this.combo = 0;
      }
    }
  }

  comboMultiplier() {
    return 1 + Math.floor(Math.max(0, this.combo - 1) / 2) * 0.5;
  }

  checkLevel() {
    const nextLevel = 1 + Math.floor(this.distance / 650);
    if (nextLevel > this.level) {
      this.level = nextLevel;
      this.audio.sfx('level');
      this.callbacks.onToast?.(`THREAT LEVEL ${pad2(this.level)}`, 'The horde is getting faster', 'warn', 1900);
    }
  }

  updateEffects(dt) {
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.goFlash = Math.max(0, this.goFlash - dt);
    this.shake = Math.max(0, this.shake - dt * 19);
    this.emptyWarnCooldown = Math.max(0, this.emptyWarnCooldown - dt);
  }

  updateSpeedLines(dt) {
    const targetCount =
      this.speed > 175 || this.nitroActive
        ? Math.max(0, Math.min(38, Math.floor((this.speed - 140) / 4)))
        : 0;
    while (this.speedLines.length < targetCount) {
      this.speedLines.push({
        x: rand(0, this.w),
        y: rand(this.h * 0.35, this.h * 0.89),
        len: rand(30, 150),
        alpha: rand(0.05, 0.2),
        speed: rand(450, 950),
      });
    }
    if (this.speedLines.length > targetCount) this.speedLines.length = targetCount;
    for (const line of this.speedLines) {
      line.x -= line.speed * dt;
      if (line.x + line.len < 0) {
        line.x = this.w + rand(0, 150);
        line.y = rand(this.h * 0.35, this.h * 0.89);
      }
    }
  }

  updateParticles(dt) {
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy += (particle.gravity || 0) * dt;
      particle.vx *= Math.pow(particle.drag ?? 0.985, dt * 60);
      particle.vy *= Math.pow(particle.drag ?? 0.985, dt * 60);
      if (particle.shape === 'smoke') particle.size += dt * 22;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    for (const tracer of this.tracers) tracer.t += dt;
    this.tracers = this.tracers.filter((tracer) => tracer.t < tracer.dur);
    for (const text of this.floatTexts) {
      text.life -= dt;
      text.y += text.vy * dt;
      text.vy *= 0.97;
    }
    this.floatTexts = this.floatTexts.filter((text) => text.life > 0);
  }

  updateDying(dt) {
    this.time += dt;
    this.speed = approach(this.speed, 0, 90 * dt);
    this.distance += (this.speed / 3.6) * dt * 0.45;
    this.updateEffects(dt);
    this.updateParticles(dt);
    this.updateSpeedLines(dt);
    if (Math.random() < dt * 20) {
      const car = this.getCarScreenPosition();
      this.burst(car.x + rand(-55, 55), car.y - this.h * 0.06, 1, {
        color: ['#3b3d3a', '#202321', '#696a61'],
        speed: 50,
        life: 1.4,
        size: 12,
        gravity: -25,
        shape: 'smoke',
        drag: 0.4,
      });
    }
    this.dyingTimer -= dt;
    if (this.dyingTimer <= 0) {
      this.state = 'gameover';
      this.callbacks.onGameOver?.(this.getStats());
    }
  }

  updateIdle(dt) {
    this.updateParticles(dt);
    this.updateEffects(dt);
    this.shake = Math.max(0, this.shake - dt * 12);
  }

  updateMenu(dt) {
    this.menuTime += dt;
    this.distance = this.menuDistance;
    this.menuDistance += dt * 19;
    this.wheelAngle += dt * 3.2;
    for (const zombie of this.menuZombies) zombie.walkPhase += dt * 2.4;
    this.updateParticles(dt);
    if (Math.random() < dt * 2.4) {
      this.particles.push({
        x: rand(0, this.w),
        y: rand(0, this.h),
        vx: rand(-10, 8),
        vy: rand(-18, -4),
        life: rand(2, 5),
        maxLife: 5,
        size: rand(1, 2.4),
        color: Math.random() < 0.4 ? '#ffb84a' : '#e0d6bb',
        gravity: 0,
        drag: 0.99,
        shape: 'dot',
        front: false,
        alpha: rand(0.15, 0.4),
      });
    }
  }

  endRun() {
    if (this.state === 'dying' || this.state === 'gameover') return;
    this.health = 0;
    this.state = 'dying';
    this.dyingTimer = 1.45;
    this.shake = 13;
    this.nitroActive = false;
    clearInput();
    this.audio.sfx('explosion');
    this.audio.sfx('gameover');
    const car = this.getCarScreenPosition();
    this.burst(car.x, car.y - this.h * 0.02, 34, {
      color: ['#fff0a8', '#ff9d2e', '#e44421', '#262927'],
      speed: 320,
      life: 1.1,
      size: 5,
      gravity: 370,
      shape: 'spark',
      front: true,
    });
    this.callbacks.onDying?.();
  }

  getStats() {
    return {
      score: Math.round(this.score),
      distance: this.distance,
      kills: this.kills,
      coins: this.coins,
      topSpeed: this.topSpeed,
      level: this.level,
    };
  }

  getHudState() {
    return {
      score: Math.round(this.score),
      distance: this.distance,
      kills: this.kills,
      coins: this.coins,
      level: this.level,
      health: this.health,
      nitro: this.nitro,
      ammo: this.ammo,
      speed: this.speed,
      shield: this.shield,
      nitroActive: this.nitroActive,
      comboMultiplier: this.comboMultiplier(),
      comboRatio: clamp(this.comboTimer / 2.8, 0, 1),
    };
  }

  burst(x, y, count, options = {}) {
    const {
      color = ['#ffffff'],
      speed = 120,
      life = 0.6,
      size = 2,
      gravity = 0,
      shape = 'dot',
      front = false,
      drag = 0.985,
    } = options;
    for (let i = 0; i < count; i++) {
      const angle = rand(0, TAU);
      const velocity = rand(speed * 0.3, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - speed * 0.08,
        life: life * rand(0.6, 1.2),
        maxLife: life,
        size: size * rand(0.6, 1.5),
        color: Array.isArray(color[0]) ? pick(color) : pick(color),
        gravity,
        drag,
        shape,
        front,
        alpha: 1,
        rot: rand(0, TAU),
        spin: rand(-12, 12),
      });
    }
  }

  spawnRoadDust() {
    const car = this.getCarScreenPosition();
    const side = Math.random() < 0.5 ? -1 : 1;
    this.particles.push({
      x: car.x + side * rand(40, 75),
      y: this.nearY + rand(2, 12),
      vx: -rand(20, 70) - this.speed * 0.08,
      vy: rand(-18, -4),
      life: rand(0.35, 0.7),
      maxLife: 0.7,
      size: rand(2, 5),
      color: 'rgba(177,155,122,0.35)',
      gravity: -6,
      drag: 0.96,
      shape: 'smoke',
      front: false,
      alpha: 0.5,
    });
  }

  spawnNitroFlame() {
    const car = this.getCarScreenPosition();
    this.particles.push({
      x: car.x + rand(-52, 52),
      y: car.y - rand(18, 35),
      vx: -rand(30, 130) - this.speed * 0.08,
      vy: rand(-10, 22),
      life: rand(0.12, 0.28),
      maxLife: 0.28,
      size: rand(3, 7),
      color: Math.random() < 0.5 ? '#67e8ed' : '#ffb31f',
      gravity: 0,
      drag: 0.94,
      shape: 'dot',
      front: false,
      alpha: 0.85,
    });
  }

  spawnDamageSmoke() {
    const car = this.getCarScreenPosition();
    const side = Math.random() < 0.5 ? -1 : 1;
    this.particles.push({
      x: car.x + side * rand(30, 68),
      y: car.y - rand(45, 85),
      vx: rand(-24, 24) - this.speed * 0.012,
      vy: rand(-46, -22),
      life: rand(0.7, 1.5),
      maxLife: 1.5,
      size: rand(5, 11),
      color: Math.random() < 0.25 ? '#6b6455' : '#34362f',
      gravity: -16,
      drag: 0.5,
      shape: 'smoke',
      front: false,
      alpha: 0.55,
    });
  }

  addFloatText(text, x, y, color = '#ffcf4b', size = 13) {
    this.floatTexts.push({ text, x, y, color, size, life: 1.05, vy: -40 });
  }

  // __INTERNAL_HELPERS__
}

/* ═══════════════════════════════════════════════════════════════════════
   Geometry & projection
   ═══════════════════════════════════════════════════════════════════════ */
const LANE_SPREAD = 0.84;

Game.prototype.roadCurveAt = function roadCurveAt(progress) {
  const w = this.w;
  return (
    Math.sin(progress * 0.00115 + 0.7) * w * 0.105 +
    Math.sin(progress * 0.00365 + 2.1) * w * 0.034 +
    Math.sin(progress * 0.0081 + 0.2) * w * 0.011
  );
};

Game.prototype.roadHeightAt = function roadHeightAt(progress) {
  // Normalized rolling terrain. Two long swells and a shorter chatter keep the
  // highway feeling like it is climbing through the mountains.
  return (
    Math.sin(progress * 0.0052 + 0.8) * 0.62 +
    Math.sin(progress * 0.0135 + 2.4) * 0.26 +
    Math.sin(progress * 0.031 + 1.1) * 0.1
  );
};

Game.prototype.roadSlopeAt = function roadSlopeAt(progress) {
  return this.roadHeightAt(progress + 3) - this.roadHeightAt(progress - 3);
};

Game.prototype.project = function project(z) {
  const t = Math.max(0, 1 - z / VIEW_DIST);
  const p = Math.pow(t, 2.12);
  const flatY = this.horizonY + (this.nearY - this.horizonY) * p;
  const worldZ = this.distance + z;
  const heightDelta = this.roadHeightAt(worldZ) - this.roadHeightAt(this.distance);
  const hillDepth = 0.55 + p * 0.45;
  const y = clamp(
    flatY - heightDelta * hillDepth * this.h * 0.115,
    this.horizonY - this.h * 0.19,
    this.h * 0.985,
  );
  const half = lerp(this.w * 0.013, this.w * 0.462, p);
  const delta = this.roadCurveAt(worldZ) - this.roadCurveAt(this.distance);
  const curveFactor = Math.max(0, 1 - Math.min(1, p));
  const x = this.w * 0.5 + delta * curveFactor * 0.9;
  return { x, y, half, p, z, elevation: heightDelta };
};

Game.prototype.laneX = function laneX(proj, lane) {
  return proj.x + lane * proj.half * LANE_SPREAD;
};

Game.prototype.getCarScreenPosition = function getCarScreenPosition() {
  const near = this.project(0);
  return {
    x: near.x + this.playerLane * near.half * LANE_SPREAD,
    y: this.nearY + this.h * 0.009,
    p: 1,
  };
};

Game.prototype.getCarMuzzlePosition = function getCarMuzzlePosition() {
  const car = this.getCarScreenPosition();
  return {
    x: car.x + this.tilt * this.h * 0.16,
    y: car.y - this.h * 0.19 - this.recoil * 2,
  };
};

Game.prototype.getEntityScreenPosition = function getEntityScreenPosition(entity) {
  const proj = this.project(entity.z);
  return {
    x: proj.x + entity.lane * proj.half * LANE_SPREAD,
    y: proj.y,
    p: proj.p,
  };
};

Game.prototype.getEntityVisualScale = function getEntityVisualScale(z) {
  const p = this.project(z).p;
  return (this.h / 900) * (0.035 + Math.min(1.5, p) * 0.97);
};

/* ═══════════════════════════════════════════════════════════════════════
   Scene rendering
   ═══════════════════════════════════════════════════════════════════════ */
Game.prototype.render = function render() {
  const ctx = this.ctx;
  const menu = this.state === 'menu';
  const shakeActive =
    settings.shake &&
    this.shake > 0.05 &&
    (this.state === 'playing' || this.state === 'dying' || this.state === 'gameover');
  ctx.save();
  if (shakeActive) {
    const amount = Math.min(13, this.shake) * 0.55;
    ctx.translate(rand(-amount, amount), rand(-amount, amount));
  }
  this.drawScene(menu);
  ctx.restore();
};

Game.prototype.drawScene = function drawScene(menu) {
  const ctx = this.ctx;
  const palette = getPalette(menu ? 0 : this.distance, menu);
  this.currentPalette = palette;
  ctx.save();
  this.drawSky(palette, menu);
  this.drawClouds(palette, menu);
  this.drawMountains(palette, menu);
  this.drawGround(palette, menu);
  this.drawRoad(palette, menu);
  this.drawGuardrails(palette);
  this.drawScenery(palette, menu);
  this.drawSpeedLines();
  if (menu) this.drawMenuProps(palette);
  else this.drawEntities(palette);
  this.drawParticles(false);
  this.drawCar(palette, menu);
  this.drawParticles(true);
  this.drawTracers();
  this.drawFloatTexts();
  this.drawForeground(palette, menu);
  this.drawScreenAtmosphere(palette, menu);
  ctx.restore();
};

Game.prototype.drawSky = function drawSky(palette, menu) {
  const ctx = this.ctx;
  const w = this.w;
  const h = this.h;
  const gradient = ctx.createLinearGradient(0, -10, 0, this.horizonY + 100);
  gradient.addColorStop(0, rgba(palette.skyTop));
  gradient.addColorStop(0.44, rgba(palette.skyMid));
  gradient.addColorStop(0.9, rgba(palette.skyLow));
  gradient.addColorStop(1, rgba(mixRgb(palette.skyLow, palette.haze, 0.35)));
  ctx.fillStyle = gradient;
  ctx.fillRect(-40, -40, w + 80, h + 80);

  const night = menu ? 0 : smoothstep(3900, 5700, this.distance);
  if (night > 0.04) {
    ctx.save();
    ctx.globalAlpha = night * 0.8;
    for (let i = 0; i < 55; i++) {
      const x = hash(i * 7.1 + 1.4) * w;
      const y = hash(i * 4.7 + 9.2) * this.horizonY * 0.72;
      const twinkle = 0.3 + 0.7 * Math.abs(Math.sin(this.time * 0.8 + i));
      ctx.fillStyle = `rgba(225,235,255,${0.2 + twinkle * 0.35})`;
      ctx.fillRect(x, y, i % 7 === 0 ? 1.8 : 1, i % 7 === 0 ? 1.8 : 1);
    }
    ctx.restore();
  }

  const sunX = w * (menu ? 0.715 : 0.73 + Math.sin(this.distance * 0.00018) * 0.014);
  const sunY = h * (menu ? 0.238 : 0.242);
  const sunRadius = Math.min(w, h) * (menu ? 0.066 : 0.061);
  const glow = ctx.createRadialGradient(sunX, sunY, sunRadius * 0.25, sunX, sunY, sunRadius * 4.8);
  glow.addColorStop(0, rgba(palette.sunGlow, 0.32));
  glow.addColorStop(0.25, rgba(palette.sunGlow, 0.14));
  glow.addColorStop(0.7, rgba(palette.sunGlow, 0.035));
  glow.addColorStop(1, rgba(palette.sunGlow, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - sunRadius * 5, sunY - sunRadius * 5, sunRadius * 10, sunRadius * 10);

  const sunGradient = ctx.createRadialGradient(
    sunX - sunRadius * 0.22,
    sunY - sunRadius * 0.22,
    0,
    sunX,
    sunY,
    sunRadius,
  );
  sunGradient.addColorStop(0, rgba([255, 255, 237], 0.98));
  sunGradient.addColorStop(0.55, rgba(palette.sun, 0.95));
  sunGradient.addColorStop(1, rgba(palette.sunGlow, 0.72));
  ctx.fillStyle = sunGradient;
  ctx.beginPath();
  ctx.arc(sunX, sunY, sunRadius, 0, TAU);
  ctx.fill();

  if (!menu || true) {
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = rgba(palette.skyMid, 0.55);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(sunX - sunRadius * 1.2, sunY + sunRadius * (0.1 + i * 0.2), sunRadius * 2.4, 1.5 + i);
    }
    ctx.restore();
  }

  const horizonGlow = ctx.createLinearGradient(0, this.horizonY - h * 0.2, 0, this.horizonY + h * 0.12);
  horizonGlow.addColorStop(0, rgba(palette.sunGlow, 0));
  horizonGlow.addColorStop(0.62, rgba(palette.sunGlow, 0.07));
  horizonGlow.addColorStop(1, rgba(palette.haze, 0.25));
  ctx.fillStyle = horizonGlow;
  ctx.fillRect(0, this.horizonY - h * 0.2, w, h * 0.33);

  this.drawBirds(palette, menu);
};

Game.prototype.drawBirds = function drawBirds(palette, menu) {
  const ctx = this.ctx;
  const time = menu ? this.menuTime : this.time * 0.35;
  ctx.save();
  ctx.strokeStyle = rgba(mixRgb(palette.skyTop, [10, 12, 13], 0.45), 0.5);
  ctx.lineWidth = 1.35;
  for (let i = 0; i < 5; i++) {
    const x = ((this.w * 0.18 + i * 57 + time * (3 + i * 0.4)) % (this.w + 100)) - 50;
    const y = this.h * 0.15 + hash(i * 5.2) * this.h * 0.16 + Math.sin(time * 0.5 + i) * 3;
    const span = 3.5 + hash(i * 2.1) * 4;
    ctx.beginPath();
    ctx.moveTo(x - span, y);
    ctx.quadraticCurveTo(x - span * 0.45, y - span * 0.55, x, y);
    ctx.quadraticCurveTo(x + span * 0.45, y - span * 0.55, x + span, y);
    ctx.stroke();
  }
  ctx.restore();
};

Game.prototype.drawClouds = function drawClouds(palette, menu) {
  const ctx = this.ctx;
  const time = menu ? this.menuTime : this.time;
  for (const cloud of this.clouds) {
    const drift = time * cloud.speed * 0.032 + cloud.phase * 0.003;
    let nx = (cloud.x - drift) % 1.22;
    if (nx < -0.16) nx += 1.22;
    const x = nx * this.w;
    const y = cloud.y * this.h + Math.sin(time * 0.22 + cloud.phase) * 3;
    const s = cloud.size * Math.min(this.w, this.h) * 0.075;
    const alpha = (menu ? 0.32 : 0.26) * (0.7 + cloud.tone * 0.5);
    ctx.save();
    ctx.filter = `blur(${Math.max(2, s * 0.28)}px)`;
    ctx.fillStyle = rgba(palette.cloudShade, alpha * 0.5);
    ctx.beginPath();
    ctx.ellipse(x + s * 0.15, y + s * 0.3, s * 1.15, s * 0.3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(palette.cloud, alpha);
    ctx.beginPath();
    ctx.ellipse(x - s * 0.62, y + s * 0.12, s * 0.58, s * 0.23, -0.08, 0, TAU);
    ctx.ellipse(x - s * 0.05, y - s * 0.02, s * 0.68, s * 0.34, 0, 0, TAU);
    ctx.ellipse(x + s * 0.54, y + s * 0.11, s * 0.62, s * 0.25, 0.06, 0, TAU);
    ctx.ellipse(x + s * 0.95, y + s * 0.22, s * 0.45, s * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
};

Game.prototype.drawMountains = function drawMountains(palette, menu) {
  const ctx = this.ctx;
  const w = this.w;
  const distance = menu ? this.menuDistance : this.distance;

  const layers = [
    {
      base: this.horizonY + 7,
      amp: this.h * 0.172,
      color: palette.far,
      snow: palette.farSnow,
      step: 46,
      f1: 0.0019,
      f2: 0.0051,
      f3: 0.012,
      seed: 1.7,
      parallax: 0.011,
      lineAlpha: 0.28,
      snowLine: 0.55,
    },
    {
      base: this.horizonY + 28,
      amp: this.h * 0.121,
      color: palette.mid,
      snow: palette.farSnow,
      step: 34,
      f1: 0.0028,
      f2: 0.0067,
      f3: 0.015,
      seed: 3.2,
      parallax: 0.022,
      lineAlpha: 0.17,
      snowLine: 0.66,
    },
    {
      base: this.horizonY + 52,
      amp: this.h * 0.072,
      color: palette.near,
      snow: palette.near,
      step: 27,
      f1: 0.0044,
      f2: 0.0088,
      f3: 0.019,
      seed: 5.8,
      parallax: 0.038,
      lineAlpha: 0.12,
      snowLine: 1.1,
    },
  ];

  for (const layer of layers) {
    const offset = distance * layer.parallax;
    const ridgeY = (x) => {
      const n = x + offset;
      const wave =
        0.52 +
        0.31 * Math.sin(n * layer.f1 + layer.seed) +
        0.16 * Math.sin(n * layer.f2 + layer.seed * 2.13) +
        0.088 * Math.sin(n * layer.f3 + layer.seed * 0.63);
      return layer.base - layer.amp * wave;
    };

    const points = [];
    for (let x = -90; x <= w + 90; x += layer.step) {
      points.push({ x, y: ridgeY(x) });
    }

    // Silhouette mass.
    const grad = ctx.createLinearGradient(0, layer.base - layer.amp, 0, layer.base + 30);
    grad.addColorStop(0, rgba(mixRgb(layer.color, palette.haze, 0.16)));
    grad.addColorStop(0.62, rgba(layer.color));
    grad.addColorStop(1, rgba(mixRgb(layer.color, palette.haze, 0.3)));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-90, this.horizonY + 120);
    for (const point of points) ctx.lineTo(point.x, point.y);
    ctx.lineTo(w + 90, this.horizonY + 120);
    ctx.closePath();
    ctx.fill();

    // Faceted slopes: sunlit faces catch the warm sky, shadowed faces fall back
    // into the range. This is what gives the ridges their chiselled 3D read.
    const litColor = mixRgb(layer.color, palette.sunGlow, 0.24);
    const shadowColor = mixRgb(shadeRgb(layer.color, -18), palette.haze, 0.14);
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const descending = b.y > a.y;
      ctx.fillStyle = rgba(descending ? litColor : shadowColor, descending ? 0.28 : 0.2);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(b.x, layer.base + 6);
      ctx.lineTo(a.x, layer.base + 6);
      ctx.closePath();
      ctx.fill();
    }

    // Snow caps on the highest peaks.
    if (layer.snowLine < 1) {
      const snowLit = mixRgb(layer.snow, [255, 255, 245], 0.35);
      const snowShade = mixRgb(layer.snow, palette.skyMid, 0.28);
      for (let i = 1; i < points.length - 1; i++) {
        const prev = points[i - 1];
        const peak = points[i];
        const next = points[i + 1];
        const isPeak = peak.y < prev.y && peak.y <= next.y;
        if (!isPeak || peak.y > layer.base - layer.amp * layer.snowLine) continue;
        const capW = Math.min(64, (next.x - prev.x) * 0.68);
        const capH = layer.amp * (0.15 + hash(i * 3.7 + layer.seed) * 0.09);
        ctx.fillStyle = rgba(snowLit, 0.82);
        ctx.beginPath();
        ctx.moveTo(peak.x, peak.y + 1);
        ctx.lineTo(peak.x - capW * 0.5, peak.y + capH * 0.72);
        ctx.lineTo(peak.x - capW * 0.3, peak.y + capH * 0.6);
        ctx.lineTo(peak.x - capW * 0.12, peak.y + capH * 0.88);
        ctx.lineTo(peak.x + capW * 0.04, peak.y + capH * 0.68);
        ctx.lineTo(peak.x + capW * 0.24, peak.y + capH);
        ctx.lineTo(peak.x + capW * 0.5, peak.y + capH * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = rgba(snowShade, 0.45);
        ctx.beginPath();
        ctx.moveTo(peak.x, peak.y + 1);
        ctx.lineTo(peak.x + capW * 0.5, peak.y + capH * 0.7);
        ctx.lineTo(peak.x + capW * 0.24, peak.y + capH);
        ctx.lineTo(peak.x + capW * 0.04, peak.y + capH * 0.68);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Crisp alpine rim light.
    ctx.save();
    ctx.globalAlpha = layer.lineAlpha;
    ctx.strokeStyle = rgba(mixRgb(layer.snow, palette.sunGlow, 0.3));
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
    ctx.restore();
  }
};

Game.prototype.drawGround = function drawGround(palette, menu) {
  const ctx = this.ctx;
  const w = this.w;
  const h = this.h;
  const grad = ctx.createLinearGradient(0, this.horizonY, 0, h);
  grad.addColorStop(0, rgba(mixRgb(palette.ground, palette.haze, 0.48)));
  grad.addColorStop(0.28, rgba(palette.ground));
  grad.addColorStop(0.75, rgba(shadeRgb(palette.ground, -15)));
  grad.addColorStop(1, rgba(shadeRgb(palette.ground, -31)));
  ctx.fillStyle = grad;
  ctx.fillRect(0, this.horizonY - 1, w, h - this.horizonY + 2);

  const band = ctx.createLinearGradient(0, this.horizonY - 5, 0, this.horizonY + h * 0.17);
  band.addColorStop(0, rgba(palette.haze, 0.27));
  band.addColorStop(1, rgba(palette.haze, 0));
  ctx.fillStyle = band;
  ctx.fillRect(0, this.horizonY - 5, w, h * 0.18);

  const treelineBase = this.horizonY + h * 0.035;
  ctx.save();
  ctx.fillStyle = rgba(mixRgb(palette.forest, palette.haze, 0.22), 0.88);
  ctx.beginPath();
  ctx.moveTo(-20, treelineBase + 22);
  for (let x = -20; x <= w + 20; x += 10) {
    const seed = Math.floor(x / 10);
    const height = 4 + hash(seed * 3.7 + 0.5) * h * 0.035;
    const sway = Math.sin(x * 0.02 + 1.8) * 2;
    ctx.lineTo(x, treelineBase - height + sway);
  }
  ctx.lineTo(w + 20, treelineBase + 22);
  ctx.closePath();
  ctx.fill();

  ctx.globalAlpha = 0.35;
  ctx.fillStyle = rgba(palette.forestHi);
  ctx.beginPath();
  ctx.moveTo(-20, treelineBase + 20);
  for (let x = -20; x <= w + 20; x += 17) {
    const seed = Math.floor(x / 17) + 88;
    const height = 3 + hash(seed * 2.3) * h * 0.02;
    ctx.lineTo(x, treelineBase - height);
  }
  ctx.lineTo(w + 20, treelineBase + 20);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = rgba(palette.grass, 0.7);
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i++) {
    const x = hash(i * 3.4) * w;
    const y = this.horizonY + h * 0.09 + hash(i * 8.1) * h * 0.22;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (hash(i * 2.7) - 0.5) * 25, y + h * 0.08);
    ctx.stroke();
  }
  ctx.restore();
};

Game.prototype.drawRoad = function drawRoad(palette, menu) {
  const ctx = this.ctx;
  const steps = 106;
  let prev = this.project(VIEW_DIST);
  const zStart = VIEW_DIST;
  const zEnd = -58;

  for (let i = 1; i <= steps; i++) {
    const z = zStart + ((zEnd - zStart) * i) / steps;
    const cur = this.project(z);
    const fog = Math.pow(1 - clamp01(cur.p), 1.35) * 0.82;
    const shoulderColor = mixRgb(palette.shoulder, palette.haze, fog * 0.92);
    const asphaltBase = mixRgb(
      Math.floor((this.distance + z) / 7) % 2 === 0 ? palette.asphalt : palette.asphaltAlt,
      palette.haze,
      fog,
    );
    const outerPrev = prev.half * 1.19;
    const outerCur = cur.half * 1.19;

    ctx.fillStyle = rgba(shoulderColor);
    ctx.beginPath();
    ctx.moveTo(prev.x - outerPrev, prev.y);
    ctx.lineTo(prev.x + outerPrev, prev.y);
    ctx.lineTo(cur.x + outerCur, cur.y + 0.7);
    ctx.lineTo(cur.x - outerCur, cur.y + 0.7);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = rgba(asphaltBase);
    ctx.beginPath();
    ctx.moveTo(prev.x - prev.half, prev.y);
    ctx.lineTo(prev.x + prev.half, prev.y);
    ctx.lineTo(cur.x + cur.half, cur.y + 0.7);
    ctx.lineTo(cur.x - cur.half, cur.y + 0.7);
    ctx.closePath();
    ctx.fill();

    prev = cur;
  }

  // Edge lines and lane dividers.
  prev = this.project(VIEW_DIST);
  for (let i = 1; i <= steps; i++) {
    const z = zStart + ((zEnd - zStart) * i) / steps;
    const cur = this.project(z);
    const fog = Math.pow(1 - clamp01(cur.p), 1.35) * 0.84;
    const edgeColor = mixRgb(palette.edge, palette.haze, fog);
    const lineColor = mixRgb(palette.line, palette.haze, fog);
    const edgeWidth = 0.011;

    ctx.fillStyle = rgba(edgeColor, 0.68);
    this.fillLaneQuad(prev, cur, -1.0 - edgeWidth, -1.0 + edgeWidth);
    this.fillLaneQuad(prev, cur, 1.0 - edgeWidth, 1.0 + edgeWidth);

    const worldZ = this.distance + z;
    const dashOn = Math.floor(((worldZ + 200) % 10 + 10) % 10) < 5.2;
    if (dashOn) {
      ctx.fillStyle = rgba(lineColor, 0.84);
      this.fillLaneQuad(prev, cur, -0.337 - edgeWidth, -0.337 + edgeWidth);
      this.fillLaneQuad(prev, cur, 0.337 - edgeWidth, 0.337 + edgeWidth);
    }
    prev = cur;
  }

  // A little asphalt grain / repaired cracks near the player.
  ctx.save();
  for (let i = 0; i < 11; i++) {
    const z = 18 + i * 17 + hash(i * 5.2) * 8;
    const pr = this.project(z);
    if (pr.p < 0.1) continue;
    const x = pr.x + (hash(i * 4.3 + 2) - 0.5) * pr.half * 1.35;
    const len = (5 + hash(i * 3.1) * 18) * pr.p;
    ctx.strokeStyle = rgba([18, 18, 18], 0.12 + pr.p * 0.08);
    ctx.lineWidth = 0.6 + pr.p * 1.3;
    ctx.beginPath();
    ctx.moveTo(x, pr.y);
    ctx.quadraticCurveTo(x + len * 0.4, pr.y - pr.p * 3, x + len, pr.y + pr.p * 2);
    ctx.stroke();
  }
  ctx.restore();

  const glow = ctx.createLinearGradient(0, this.horizonY - 5, 0, this.horizonY + this.h * 0.2);
  glow.addColorStop(0, rgba(palette.haze, 0.18));
  glow.addColorStop(1, rgba(palette.haze, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, this.horizonY - 5, this.w, this.h * 0.22);
};

Game.prototype.fillLaneQuad = function fillLaneQuad(prev, cur, laneA, laneB) {
  const ctx = this.ctx;
  const ax = prev.x + laneA * prev.half * LANE_SPREAD;
  const bx = prev.x + laneB * prev.half * LANE_SPREAD;
  const cx = cur.x + laneB * cur.half * LANE_SPREAD;
  const dx = cur.x + laneA * cur.half * LANE_SPREAD;
  ctx.beginPath();
  ctx.moveTo(ax, prev.y);
  ctx.lineTo(bx, prev.y);
  ctx.lineTo(cx, cur.y + 0.8);
  ctx.lineTo(dx, cur.y + 0.8);
  ctx.closePath();
  ctx.fill();
};

Game.prototype.drawGuardrails = function drawGuardrails(palette) {
  const ctx = this.ctx;
  for (const side of [-1, 1]) {
    let prev = null;
    for (let z = VIEW_DIST - 5; z >= -24; z -= 7) {
      const pr = this.project(z);
      const x = pr.x + side * pr.half * 1.075;
      const top = pr.y - pr.p * this.h * 0.034;
      const point = { x, y: pr.y, top, p: pr.p };
      if (prev) {
        const fog = Math.pow(1 - clamp01(point.p), 1.25) * 0.68;
        const railColor = mixRgb(palette.guard, palette.haze, fog);
        ctx.strokeStyle = rgba(railColor, 0.82);
        ctx.lineWidth = 0.55 + point.p * 3.8;
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.top);
        ctx.lineTo(point.x, point.top);
        ctx.stroke();

        if (point.p > 0.1) {
          ctx.strokeStyle = rgba(mixRgb(palette.guard, [15, 17, 17], 0.45), 0.75);
          ctx.lineWidth = 0.5 + point.p * 2;
          ctx.beginPath();
          ctx.moveTo(point.x, point.y);
          ctx.lineTo(point.x, point.top);
          ctx.stroke();
        }
        if (Math.round(z) % 14 === 0 && point.p > 0.2) {
          ctx.fillStyle = rgba([255, 204, 99], 0.55);
          ctx.fillRect(point.x - 1.2, point.top + 1, 2.4, 1.6 + point.p * 2);
        }
      }
      prev = point;
    }
  }
};

Game.prototype.drawScenery = function drawScenery(palette, menu) {
  const travel = menu ? this.menuDistance : this.distance;
  const spacing = 16;
  const offset = ((travel % spacing) + spacing) % spacing;
  const count = Math.ceil(VIEW_DIST / spacing) + 2;

  for (let i = count; i >= 0; i--) {
    const z = i * spacing - offset;
    if (z < -16 || z > VIEW_DIST + 8) continue;
    const worldIndex = Math.round((travel + z) / spacing);
    const pr = this.project(z);
    if (pr.p < 0.015) continue;
    for (const side of [-1, 1]) {
      const seed = worldIndex * 4.7 + (side > 0 ? 31.7 : 0);
      const roll = hash(seed + 0.4);
      if (roll < 0.19) continue;
      const sideOffset = 1.21 + hash(seed + 1.9) * 0.62;
      const x = pr.x + side * pr.half * sideOffset;
      const p = Math.max(0.035, pr.p);
      const height = this.h * 0.34 * (0.48 + p * 0.74) * (0.72 + hash(seed + 3.3) * 0.55);
      const fog = Math.pow(1 - clamp01(p), 1.4) * 0.72;
      const treeColor = mixRgb(palette.tree, palette.haze, fog * 0.72);
      const treeHi = mixRgb(palette.treeHi, palette.haze, fog * 0.62);

      if (roll > 0.93 && p > 0.2) {
        this.drawRoadSign(x, pr.y, side, p, palette, hash(seed + 9.1));
        continue;
      }
      if (roll > 0.83) {
        this.drawRock(x, pr.y, height * 0.22, p, palette);
        continue;
      }
      if (roll > 0.7) {
        this.drawBush(x, pr.y, height * 0.22, p, treeColor, treeHi);
        continue;
      }
      this.drawPine(x, pr.y, height, treeColor, treeHi, palette.trunk, fog);
    }
  }
};

Game.prototype.drawPine = function drawPine(x, y, height, color, colorHi, trunk, fog) {
  const ctx = this.ctx;
  const width = height * 0.42;
  ctx.save();
  ctx.fillStyle = rgba([0, 0, 0], 0.15 * (1 - fog));
  ctx.beginPath();
  ctx.ellipse(x, y + 1, width * 0.7, height * 0.05, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = rgba(mixRgb(trunk, color, 0.15));
  ctx.fillRect(x - width * 0.055, y - height * 0.26, width * 0.11, height * 0.27);

  for (let layer = 0; layer < 3; layer++) {
    const base = y - height * (0.18 + layer * 0.24);
    const spread = width * (0.5 - layer * 0.09);
    const top = y - height * (0.62 + layer * 0.19);
    ctx.fillStyle = rgba(layer === 1 ? colorHi : color);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x - spread, base);
    ctx.lineTo(x - spread * 0.56, base);
    ctx.lineTo(x - spread * 0.92, base - height * 0.1);
    ctx.lineTo(x + spread * 0.92, base - height * 0.1);
    ctx.lineTo(x + spread * 0.56, base);
    ctx.lineTo(x + spread, base);
    ctx.closePath();
    ctx.fill();
  }
  ctx.fillStyle = rgba(mixRgb(colorHi, [255, 226, 150], 0.22), 0.35);
  ctx.beginPath();
  ctx.moveTo(x, y - height * 0.94);
  ctx.lineTo(x - width * 0.08, y - height * 0.42);
  ctx.lineTo(x + width * 0.07, y - height * 0.47);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Game.prototype.drawBush = function drawBush(x, y, size, p, color, colorHi) {
  const ctx = this.ctx;
  ctx.save();
  ctx.fillStyle = rgba(color, 0.9);
  ctx.beginPath();
  ctx.ellipse(x - size * 0.34, y, size * 0.56, size * 0.4, -0.2, 0, TAU);
  ctx.ellipse(x + size * 0.2, y + size * 0.04, size * 0.6, size * 0.34, 0.12, 0, TAU);
  ctx.ellipse(x, y - size * 0.18, size * 0.54, size * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(colorHi, 0.42);
  ctx.beginPath();
  ctx.ellipse(x - size * 0.12, y - size * 0.24, size * 0.24, size * 0.14, -0.3, 0, TAU);
  ctx.fill();
  ctx.restore();
};

Game.prototype.drawRock = function drawRock(x, y, size, p, palette) {
  const ctx = this.ctx;
  ctx.save();
  const rockColor = mixRgb(palette.rock, palette.haze, (1 - p) * 0.5);
  ctx.fillStyle = rgba([0, 0, 0], 0.18);
  ctx.beginPath();
  ctx.ellipse(x, y + 1, size * 0.9, size * 0.18, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(rockColor);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.8, y - size * 0.03);
  ctx.lineTo(x - size * 0.58, y - size * 0.46);
  ctx.lineTo(x - size * 0.12, y - size * 0.63);
  ctx.lineTo(x + size * 0.48, y - size * 0.4);
  ctx.lineTo(x + size * 0.78, y - size * 0.06);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = rgba(shadeRgb(rockColor, 35), 0.4);
  ctx.beginPath();
  ctx.moveTo(x - size * 0.55, y - size * 0.42);
  ctx.lineTo(x - size * 0.12, y - size * 0.61);
  ctx.lineTo(x + size * 0.08, y - size * 0.18);
  ctx.lineTo(x - size * 0.34, y - size * 0.08);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

Game.prototype.drawRoadSign = function drawRoadSign(x, y, side, p, palette, variant) {
  const ctx = this.ctx;
  const signH = this.h * 0.095 * (0.65 + p * 0.5);
  const signW = signH * 1.85;
  const labels = ['DEAD ZONE', 'TURN BACK', 'NO FUEL', 'SECTOR 07'];
  ctx.save();
  ctx.fillStyle = rgba(mixRgb(palette.wood || [86, 62, 42], palette.haze, (1 - p) * 0.4));
  ctx.fillRect(x - signW * 0.025, y - signH * 0.72, signW * 0.05, signH * 0.74);
  ctx.translate(x, y - signH * 0.92);
  ctx.fillStyle = rgba(mixRgb([31, 34, 31], palette.haze, (1 - p) * 0.36));
  ctx.fillRect(-signW * 0.5, -signH * 0.28, signW, signH * 0.55);
  ctx.strokeStyle = rgba([255, 179, 31], 0.6);
  ctx.lineWidth = Math.max(1, signH * 0.02);
  ctx.strokeRect(-signW * 0.47, -signH * 0.24, signW * 0.94, signH * 0.47);
  ctx.fillStyle = rgba([255, 199, 72], 0.88);
  ctx.font = `700 ${Math.max(6, signH * 0.13)}px "Cascadia Mono", Consolas, "Courier New", monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(labels[Math.floor(variant * labels.length) % labels.length], 0, signH * 0.02);
  ctx.restore();
};

/* ═══════════════════════════════════════════════════════════════════════
   Entities
   ═══════════════════════════════════════════════════════════════════════ */
Game.prototype.drawMenuProps = function drawMenuProps(palette) {
  const props = [...this.menuZombies].sort((a, b) => b.z - a.z);
  for (const prop of props) this.drawEntity(prop, palette, true);
};

Game.prototype.drawEntities = function drawEntities(palette) {
  const visible = this.entities
    .filter((entity) => entity.z < VIEW_DIST + 36 && entity.z > -25)
    .sort((a, b) => b.z - a.z);
  for (const entity of visible) this.drawEntity(entity, palette, false);

  if (this.state === 'playing' && this.countdown <= 0) {
    let target = null;
    for (const entity of visible) {
      if (entity.dead || entity.type === 'pickup' || entity.z < 8 || entity.z > 190) continue;
      if (Math.abs(entity.lane - this.playerLane) > 0.47) continue;
      if (!target || entity.z < target.z) target = entity;
    }
    if (target) this.drawTargetReticle(target);
  }
};

Game.prototype.drawEntity = function drawEntity(entity, palette, menu) {
  const pos = this.getEntityScreenPosition(entity);
  const scale = this.getEntityVisualScale(entity.z);
  if (pos.p < 0.006) return;
  const depthAlpha = clamp(0.38 + pos.p * 0.72, 0.28, 1);

  if (entity.type === 'zombie') {
    this.drawZombie(entity, pos, scale, palette, depthAlpha, menu);
  } else if (entity.type === 'obstacle') {
    this.drawObstacle(entity, pos, scale, palette, depthAlpha, menu);
  } else if (entity.type === 'pickup') {
    this.drawPickup(entity, pos, scale, palette, depthAlpha);
  }
};

Game.prototype.drawZombie = function drawZombie(entity, pos, scale, palette, depthAlpha, menu) {
  const ctx = this.ctx;
  const data = ZOMBIE_DATA[entity.kind];
  const size = data.size;
  const dead = entity.dead;
  const deathProgress = dead ? clamp(entity.deathT / 0.72, 0, 1) : 0;
  const alpha = dead ? Math.max(0, 1 - Math.max(0, entity.deathT - 0.48) / 0.68) : depthAlpha;
  if (alpha <= 0.01) return;

  const shadowScale = 0.9 + pos.p * 0.1;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${0.25 * depthAlpha * shadowScale})`;
  ctx.beginPath();
  ctx.ellipse(pos.x, pos.y + 1, 28 * scale * size, 6 * scale * size, 0, 0, TAU);
  ctx.fill();
  ctx.restore();

  const phase = entity.walkPhase || 0;
  const step = Math.sin(phase * 2.1);
  const armSwing = Math.cos(phase * 1.85);
  const bob = Math.abs(Math.sin(phase * 2.1)) * 2.4;
  const skins = [
    [144, 166, 106],
    [122, 148, 91],
    [159, 170, 118],
    [111, 138, 94],
  ];
  const skin = skins[Math.floor((entity.seed || 0.3) * skins.length) % skins.length];
  const skinDark = shadeRgb(skin, -34);
  const skinHi = shadeRgb(skin, 25);
  const shirtBase = SHIRTS[Math.floor((entity.seed || 0.4) * SHIRTS.length) % SHIRTS.length];
  const shirt = shadeRgb(shirtBase, entity.kind === 'runner' ? -5 : 0);
  const shirtHi = shadeRgb(shirt, 23);
  const pants = entity.kind === 'brute' ? [53, 54, 45] : [41, 50, 55];
  const pantsHi = shadeRgb(pants, 22);

  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.globalAlpha = alpha;
  if (dead) {
    const dir = (entity.deathVx || 1) >= 0 ? 1 : -1;
    ctx.translate(dir * deathProgress * 16, -deathProgress * 4);
    ctx.rotate(dir * deathProgress * 1.28);
    ctx.scale(1, 1 - deathProgress * 0.34);
  } else {
    ctx.rotate(Math.sin(phase * 1.1) * 0.018);
  }
  ctx.translate(0, -bob);
  ctx.scale(scale * size, scale * size);

  // Rear leg (darker), then torso, then front leg.
  const legLift = Math.max(0, step) * 6;
  const legLift2 = Math.max(0, -step) * 6;
  ctx.strokeStyle = rgba(shadeRgb(pants, -15));
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(-9, -51);
  ctx.lineTo(-12 - step * 4, -25);
  ctx.lineTo(-15 - step * 9, -2 - legLift);
  ctx.stroke();
  ctx.fillStyle = rgba([27, 29, 27]);
  ctx.beginPath();
  ctx.ellipse(-15 - step * 9, -2 - legLift, 9, 4.6, -0.1, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = rgba(pants);
  ctx.lineWidth = 12;
  ctx.beginPath();
  ctx.moveTo(9, -51);
  ctx.lineTo(12 + step * 4, -25);
  ctx.lineTo(15 + step * 9, -2 - legLift2);
  ctx.stroke();
  ctx.fillStyle = rgba([37, 39, 34]);
  ctx.beginPath();
  ctx.ellipse(15 + step * 9, -2 - legLift2, 9, 4.6, 0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = rgba(shadeRgb(pants, 24), 0.8);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-10, -47);
  ctx.lineTo(-12 - step * 3, -28);
  ctx.stroke();

  // Rear (left) arm sits behind the torso to sell the volume of the body.
  const armReach = entity.kind === 'runner' ? 13 : 7;
  ctx.strokeStyle = rgba(shadeRgb(skinDark, -20));
  ctx.lineWidth = entity.kind === 'brute' ? 13 : 8.5;
  ctx.beginPath();
  ctx.moveTo(-17, -100);
  ctx.quadraticCurveTo(-35 - armReach, -90, -31 - armReach + armSwing * 4, -58);
  ctx.stroke();
  ctx.fillStyle = rgba(shadeRgb(skinDark, -14));
  ctx.beginPath();
  ctx.ellipse(-31 - armReach + armSwing * 4, -55, 6.4, 7.6, -0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(shadeRgb(shirt, -26));
  ctx.beginPath();
  ctx.ellipse(-18, -98, 9.5, 6.6, -0.45, 0, TAU);
  ctx.fill();

  // Torso / shirt.
  const torsoGrad = ctx.createLinearGradient(0, -108, 0, -47);
  torsoGrad.addColorStop(0, rgba(shirtHi));
  torsoGrad.addColorStop(0.54, rgba(shirt));
  torsoGrad.addColorStop(1, rgba(shadeRgb(shirt, -24)));
  ctx.fillStyle = torsoGrad;
  ctx.beginPath();
  ctx.moveTo(-22, -104);
  ctx.quadraticCurveTo(-31, -88, -23, -61);
  ctx.lineTo(-17, -46);
  ctx.lineTo(-8, -49);
  ctx.lineTo(-2, -44);
  ctx.lineTo(5, -49);
  ctx.lineTo(13, -45);
  ctx.lineTo(20, -49);
  ctx.lineTo(25, -62);
  ctx.quadraticCurveTo(31, -89, 20, -104);
  ctx.closePath();
  ctx.fill();

  // Curved right-hand side plane plus a warm rim light on the left edge.
  ctx.fillStyle = rgba(shadeRgb(shirt, -19), 0.55);
  ctx.beginPath();
  ctx.moveTo(12, -103);
  ctx.quadraticCurveTo(30, -89, 24, -62);
  ctx.lineTo(19, -49);
  ctx.lineTo(8, -51);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,226,176,0.2)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-21, -103);
  ctx.quadraticCurveTo(-30, -88, -22, -62);
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(16, -57, 8, 5, 0.2, 0, TAU);
  ctx.fill();

  // Torn shirt openings + grime.
  ctx.fillStyle = rgba(skin, 0.92);
  ctx.beginPath();
  ctx.moveTo(-23, -86);
  ctx.lineTo(-13, -77);
  ctx.lineTo(-18, -65);
  ctx.lineTo(-27, -71);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(10, -96);
  ctx.lineTo(22, -89);
  ctx.lineTo(19, -80);
  ctx.lineTo(9, -84);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(52,20,17,0.5)';
  ctx.beginPath();
  ctx.ellipse(-4, -69, 8, 6, 0.35, 0, TAU);
  ctx.fill();

  // Belt.
  ctx.fillStyle = 'rgba(31,27,22,0.9)';
  ctx.fillRect(-18, -51, 36, 6);
  ctx.fillStyle = 'rgba(144,126,84,0.65)';
  ctx.fillRect(-3, -51, 6, 5);

  // Front (right) arm reaches toward the player, layered over the torso.
  ctx.strokeStyle = rgba(skinDark);
  ctx.lineWidth = entity.kind === 'brute' ? 14 : 9;
  ctx.beginPath();
  ctx.moveTo(20, -99);
  ctx.quadraticCurveTo(38 + armReach, -87, 32 + armReach - armSwing * 4, -55);
  ctx.stroke();
  ctx.strokeStyle = rgba(skin);
  ctx.lineWidth = entity.kind === 'brute' ? 11 : 6.5;
  ctx.beginPath();
  ctx.moveTo(20, -99);
  ctx.quadraticCurveTo(38 + armReach, -87, 32 + armReach - armSwing * 4, -55);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,232,188,0.18)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(24, -96);
  ctx.quadraticCurveTo(37 + armReach, -85, 32 + armReach - armSwing * 4, -58);
  ctx.stroke();
  ctx.fillStyle = rgba(skin);
  ctx.beginPath();
  ctx.ellipse(32 + armReach - armSwing * 4, -52, 6.5, 8, 0.2, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(skinDark, 0.4);
  ctx.beginPath();
  ctx.ellipse(33 + armReach - armSwing * 4, -50, 5, 5.5, 0.3, 0, TAU);
  ctx.fill();

  // Front sleeve remnant.
  ctx.fillStyle = rgba(shirt);
  ctx.beginPath();
  ctx.ellipse(21, -97, 10, 7, 0.45, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.beginPath();
  ctx.ellipse(24, -99, 7, 4.5, 0.45, 0, TAU);
  ctx.fill();

  if (entity.kind === 'brute') {
    ctx.fillStyle = 'rgba(69,72,63,0.95)';
    ctx.beginPath();
    ctx.moveTo(14, -107);
    ctx.lineTo(34, -102);
    ctx.lineTo(31, -83);
    ctx.lineTo(18, -87);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(138,139,121,0.65)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#a8a488';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(20 + i * 5, -97 + i * 1.2, 1.2, 0, TAU);
      ctx.fill();
    }
  }

  // Neck and head.
  ctx.fillStyle = rgba(skinDark);
  ctx.fillRect(-7, -113, 14, 9);
  const headY = -124;
  const headR = entity.kind === 'brute' ? 17.5 : 15.5;
  // Offset skull mass gives the head a rounded, volumetric silhouette.
  ctx.fillStyle = rgba(shadeRgb(skinDark, -24), 0.85);
  ctx.beginPath();
  ctx.ellipse(3, headY + 1.5, headR * 1.02, headR * 1.1, 0.04, 0, TAU);
  ctx.fill();
  const headGrad = ctx.createRadialGradient(-5, headY - 5, 2, 0, headY, headR + 2);
  headGrad.addColorStop(0, rgba(skinHi));
  headGrad.addColorStop(0.7, rgba(skin));
  headGrad.addColorStop(1, rgba(skinDark));
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.ellipse(0, headY, headR, headR * 1.08, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = rgba(shadeRgb(skinDark, -10), 0.34);
  ctx.beginPath();
  ctx.ellipse(headR * 0.46, headY + 2, headR * 0.56, headR * 0.95, -0.1, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,232,190,0.28)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, headY, headR - 1, headR * 1.08 - 1, 0, Math.PI * 0.78, Math.PI * 1.42);
  ctx.stroke();

  // Jaw / cheek shading.
  ctx.fillStyle = rgba(skinDark, 0.3);
  ctx.beginPath();
  ctx.ellipse(0, headY + 9, headR * 0.72, headR * 0.4, 0, 0, Math.PI);
  ctx.fill();

  // Scruffy hair.
  ctx.fillStyle = rgba([37, 37, 28], 0.9);
  ctx.beginPath();
  ctx.moveTo(-headR * 0.92, headY - 3);
  ctx.quadraticCurveTo(-headR * 0.8, headY - headR * 1.22, 0, headY - headR * 1.05);
  ctx.quadraticCurveTo(headR * 0.72, headY - headR * 1.1, headR * 0.85, headY - headR * 0.15);
  ctx.lineTo(headR * 0.5, headY - headR * 0.65);
  ctx.lineTo(headR * 0.18, headY - headR * 0.94);
  ctx.lineTo(-headR * 0.12, headY - headR * 0.65);
  ctx.closePath();
  ctx.fill();

  // Face.
  ctx.fillStyle = 'rgba(21,22,17,0.92)';
  ctx.beginPath();
  ctx.ellipse(-headR * 0.4, headY - 3, headR * 0.28, headR * 0.2, 0.1, 0, TAU);
  ctx.ellipse(headR * 0.4, headY - 3, headR * 0.28, headR * 0.2, -0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ff5a37';
  ctx.shadowColor = '#ff3b20';
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.arc(-headR * 0.4, headY - 2, 2.1, 0, TAU);
  ctx.arc(headR * 0.4, headY - 2, 2.1, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.fillStyle = 'rgba(24,19,16,0.95)';
  ctx.beginPath();
  ctx.ellipse(0, headY + 8.2, headR * 0.44, headR * 0.26, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(227,216,179,0.78)';
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(-headR * 0.3 + i * headR * 0.18, headY + 6.5, 2, 3.3);
  }

  // Wounds.
  ctx.strokeStyle = 'rgba(107,31,25,0.75)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(headR * 0.55, headY - headR * 0.58);
  ctx.lineTo(headR * 0.84, headY - headR * 0.32);
  ctx.lineTo(headR * 0.58, headY - headR * 0.08);
  ctx.stroke();

  if (entity.kind === 'runner') {
    ctx.fillStyle = 'rgba(160,42,34,0.9)';
    ctx.fillRect(-headR * 0.94, headY - headR * 0.72, headR * 1.88, 4.2);
    ctx.fillStyle = 'rgba(229,196,95,0.7)';
    ctx.beginPath();
    ctx.moveTo(headR * 0.9, headY - headR * 0.72);
    ctx.lineTo(headR * 1.3, headY - headR * 0.54);
    ctx.lineTo(headR * 0.88, headY - headR * 0.38);
    ctx.closePath();
    ctx.fill();
  }

  // Hit sparkle.
  if (entity.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = entity.hitFlash * 5;
    ctx.fillStyle = 'rgba(255,245,190,0.7)';
    ctx.beginPath();
    ctx.ellipse(0, -74, 28, 52, 0, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = alpha;
  }

  // Health bar.
  if (!dead && entity.maxHp && entity.hp < entity.maxHp) {
    const barW = 34;
    ctx.fillStyle = 'rgba(7,10,9,0.8)';
    ctx.fillRect(-barW / 2, -154, barW, 4);
    ctx.fillStyle = '#b6ff4b';
    ctx.fillRect(-barW / 2 + 1, -153, (barW - 2) * (entity.hp / entity.maxHp), 2);
  }
  ctx.restore();
};

Game.prototype.drawObstacle = function drawObstacle(entity, pos, scale, palette, depthAlpha, menu) {
  const ctx = this.ctx;
  const dead = entity.dead;
  const fade = dead ? Math.max(0, 1 - Math.max(0, entity.deathT - 0.32) / 0.85) : depthAlpha;
  if (fade <= 0.01) return;
  const dir = (entity.seed || 0.5) > 0.5 ? 1 : -1;
  const deathSpin = dead ? Math.min(1, entity.deathT / 0.65) : 0;

  ctx.save();
  if (entity.kind === 'barrel' && dead) {
    ctx.fillStyle = 'rgba(20,16,12,0.3)';
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 45 * scale, 8 * scale, 0, 0, TAU);
    ctx.fill();
  } else {
    ctx.fillStyle = `rgba(0,0,0,${0.27 * depthAlpha})`;
    ctx.beginPath();
    const sw = entity.kind === 'wreck' || entity.kind === 'barrier' ? 74 : entity.kind === 'rock' ? 40 : 30;
    ctx.ellipse(pos.x, pos.y + 2, sw * scale, 7 * scale, 0, 0, TAU);
    ctx.fill();
  }
  ctx.translate(pos.x, pos.y);
  if (dead) {
    ctx.rotate(deathSpin * 0.72 * dir);
    ctx.translate(0, -deathSpin * 12);
    ctx.scale(1, 1 - deathSpin * 0.18);
  } else {
    ctx.rotate((entity.seed - 0.5) * 0.035);
  }
  ctx.globalAlpha = fade;
  ctx.scale(scale, scale);
  const fog = (1 - clamp01(pos.p)) * 0.5;
  const haze = palette.haze;

  if (entity.kind === 'crate') {
    const w = 66;
    const h = 58;
    const dx = 11;
    const dy = -13;
    const wood = mixRgb([143, 92, 48], haze, fog);
    const woodDark = mixRgb([91, 56, 30], haze, fog);
    const woodHi = mixRgb([191, 137, 76], haze, fog);
    const woodTop = mixRgb([172, 121, 66], haze, fog);
    const woodSide = mixRgb([70, 43, 24], haze, fog);

    // Right-hand side plane. The vanishing offset gives the box real volume.
    ctx.fillStyle = rgba(woodSide);
    ctx.beginPath();
    ctx.moveTo(w / 2, -h);
    ctx.lineTo(w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2 + dx, dy);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(woodDark, 0.55);
    ctx.beginPath();
    ctx.moveTo(w / 2, -h);
    ctx.lineTo(w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2 + dx, dy);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();

    // Top face, brighter because it catches the sky.
    const topGrad = ctx.createLinearGradient(0, -h + dy, 0, -h);
    topGrad.addColorStop(0, rgba(woodTop));
    topGrad.addColorStop(1, rgba(woodHi));
    ctx.fillStyle = topGrad;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h);
    ctx.lineTo(-w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2, -h);
    ctx.closePath();
    ctx.fill();

    // Top planks follow the perspective of the lid.
    ctx.strokeStyle = rgba([60, 36, 20], 0.55);
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      ctx.beginPath();
      ctx.moveTo(-w / 2 + dx * t, -h + dy * t);
      ctx.lineTo(w / 2 + dx * t, -h + dy * t);
      ctx.stroke();
    }
    ctx.strokeStyle = rgba([60, 36, 20], 0.75);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h);
    ctx.lineTo(-w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2 + dx, -h + dy);
    ctx.lineTo(w / 2, -h);
    ctx.closePath();
    ctx.stroke();

    // Front face.
    const grad = ctx.createLinearGradient(0, -h, 0, 0);
    grad.addColorStop(0, rgba(woodHi));
    grad.addColorStop(0.55, rgba(wood));
    grad.addColorStop(1, rgba(woodDark));
    ctx.fillStyle = grad;
    ctx.fillRect(-w / 2, -h, w, h);
    ctx.strokeStyle = rgba([60, 36, 20], 0.8);
    ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2 + 1.5, -h + 1.5, w - 3, h - 3);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 5, -h + 5);
    ctx.lineTo(w / 2 - 5, -5);
    ctx.moveTo(w / 2 - 5, -h + 5);
    ctx.lineTo(-w / 2 + 5, -5);
    ctx.stroke();
    ctx.strokeStyle = rgba(mixRgb([69, 41, 21], haze, fog), 0.72);
    ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(-w / 2 + 3, -h + (h * i) / 4);
      ctx.lineTo(w / 2 - 3, -h + (h * i) / 4);
      ctx.stroke();
    }
    // Ambient occlusion where the lid meets the front face.
    ctx.fillStyle = 'rgba(38,23,12,0.32)';
    ctx.fillRect(-w / 2, -h, w, 5);
    // Sunlit top lip and front-face sheen.
    ctx.fillStyle = 'rgba(244,219,166,0.42)';
    ctx.fillRect(-w / 2 + 3, -h - 1, w - 6, 2.6);
    ctx.fillStyle = 'rgba(255,225,170,0.14)';
    ctx.fillRect(-w / 2 + 4, -h + 7, 6, h - 16);
    ctx.fillStyle = 'rgba(41,28,17,0.8)';
    for (const nx of [-w / 2 + 9, w / 2 - 9]) {
      for (const ny of [-h + 9, -9]) {
        ctx.beginPath();
        ctx.arc(nx, ny, 2, 0, TAU);
        ctx.fill();
      }
    }
  } else if (entity.kind === 'barrel') {
    const w = 45;
    const h = 63;
    const rust = mixRgb([143, 58, 35], haze, fog);
    const rustDark = mixRgb([78, 37, 28], haze, fog);
    const rustHi = mixRgb([214, 110, 63], haze, fog);
    const bandColor = mixRgb([231, 191, 44], haze, fog);

    // Back side for more volume.
    ctx.fillStyle = rgba(rustDark);
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 3, -8);
    ctx.quadraticCurveTo(-w / 2 + 1, -h / 2, -w / 2 + 3, -h + 6);
    ctx.quadraticCurveTo(0, -h - 11, w / 2 - 3, -h + 6);
    ctx.quadraticCurveTo(w / 2 - 1, -h / 2, w / 2 - 3, -8);
    ctx.quadraticCurveTo(0, -1, -w / 2 + 3, -8);
    ctx.closePath();
    ctx.fill();

    // Main body.
    const grad = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
    grad.addColorStop(0, rgba(rustDark));
    grad.addColorStop(0.26, rgba(mixRgb(rust, [230, 146, 68], 0.26)));
    grad.addColorStop(0.5, rgba(rustHi));
    grad.addColorStop(0.76, rgba(rust));
    grad.addColorStop(1, rgba(rustDark));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -8);
    ctx.quadraticCurveTo(-w / 2 - 2, -h / 2, -w / 2, -h + 6);
    ctx.quadraticCurveTo(0, -h - 10, w / 2, -h + 6);
    ctx.quadraticCurveTo(w / 2 + 2, -h / 2, w / 2, -8);
    ctx.quadraticCurveTo(0, 2, -w / 2, -8);
    ctx.closePath();
    ctx.fill();

    // Top rim / lid bevel for 3D cylinder.
    const rim = ctx.createRadialGradient(0, -h + 6, 6, 0, -h + 4, w * 0.72);
    rim.addColorStop(0, rgba(mixRgb(bandColor, [255, 236, 188], 0.4)));
    rim.addColorStop(0.6, rgba(bandColor));
    rim.addColorStop(1, rgba(rustDark));
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.ellipse(0, -h + 6, w / 2 - 1, 9, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(247,220,148,0.3)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.ellipse(0, -h + 6, w / 2 - 2.5, 7.5, 0, 0, TAU);
    ctx.stroke();

    // Metal bands.
    ctx.fillStyle = 'rgba(34,32,27,0.92)';
    ctx.beginPath();
    ctx.ellipse(0, -h + 18, w / 2 + 0.5, 7, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, -28, w / 2 + 0.5, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rgba(bandColor, 0.88);
    ctx.beginPath();
    ctx.ellipse(0, -h + 34, w / 2 - 1, 6.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(29,27,22,0.8)';
    ctx.beginPath();
    ctx.moveTo(-8, -h + 33);
    ctx.lineTo(0, -h + 46);
    ctx.lineTo(8, -h + 33);
    ctx.closePath();
    ctx.fill();

    // Highlight streaks and rivets for a bolted 3D look.
    ctx.fillStyle = 'rgba(255,210,88,0.22)';
    ctx.fillRect(-w / 2 + 4, -h + 12, 6, h - 36);
    ctx.fillStyle = 'rgba(255,198,120,0.16)';
    ctx.fillRect(-w / 2 + 11, -h + 24, 4, h - 46);
    ctx.fillStyle = 'rgba(18,15,12,0.9)';
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI * 0.8 + i * Math.PI * 0.4;
      const rx = Math.cos(angle) * (w / 2 - 2);
      const ry = -h / 2 + 16 + i * 9;
      ctx.beginPath();
      ctx.arc(rx, ry, 1.8, 0, TAU);
      ctx.fill();
    }
  } else if (entity.kind === 'rock') {
    const rockColor = mixRgb([105, 108, 100], haze, fog);
    const dark = shadeRgb(rockColor, -35);
    const hi = shadeRgb(rockColor, 31);
    ctx.fillStyle = rgba(dark);
    ctx.beginPath();
    ctx.moveTo(-42, -2);
    ctx.lineTo(-38, -35);
    ctx.lineTo(-14, -57);
    ctx.lineTo(18, -54);
    ctx.lineTo(40, -29);
    ctx.lineTo(35, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(rockColor);
    ctx.beginPath();
    ctx.moveTo(-34, -4);
    ctx.lineTo(-31, -32);
    ctx.lineTo(-10, -51);
    ctx.lineTo(15, -48);
    ctx.lineTo(34, -25);
    ctx.lineTo(28, -5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = rgba(hi, 0.35);
    ctx.beginPath();
    ctx.moveTo(-27, -33);
    ctx.lineTo(-9, -49);
    ctx.lineTo(8, -47);
    ctx.lineTo(-6, -29);
    ctx.lineTo(-20, -20);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(47,65,38,0.65)';
    ctx.beginPath();
    ctx.ellipse(-21, -11, 10, 5, -0.2, 0, TAU);
    ctx.fill();
  } else if (entity.kind === 'wreck') {
    const w = 150;
    const h = 58;
    ctx.save();
    ctx.rotate(0.04);
    const body = mixRgb([92, 60, 47], haze, fog);
    const rust = mixRgb([140, 65, 36], haze, fog);
    ctx.fillStyle = rgba(body);
    ctx.beginPath();
    ctx.moveTo(-w / 2, -9);
    ctx.lineTo(-w / 2 + 10, -h + 15);
    ctx.lineTo(-30, -h + 4);
    ctx.lineTo(-18, -h - 17);
    ctx.lineTo(36, -h - 9);
    ctx.lineTo(53, -h + 17);
    ctx.lineTo(w / 2 - 3, -h + 26);
    ctx.lineTo(w / 2 - 10, -8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(25,26,25,0.78)';
    ctx.beginPath();
    ctx.moveTo(-28, -h + 9);
    ctx.lineTo(-16, -h - 12);
    ctx.lineTo(31, -h - 5);
    ctx.lineTo(42, -h + 14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = rgba(rust, 0.8);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-w / 2 + 6, -h + 28);
    ctx.lineTo(-5, -h + 21);
    ctx.lineTo(44, -h + 31);
    ctx.stroke();
    ctx.fillStyle = 'rgba(37,27,22,0.8)';
    ctx.beginPath();
    ctx.arc(-47, -6, 17, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(158,119,82,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-47, -6, 11, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(151,45,30,0.8)';
    ctx.fillRect(-w / 2 + 16, -h + 42, 20, 8);
    ctx.fillRect(w / 2 - 31, -h + 44, 15, 6);
    ctx.restore();
    if (pos.p > 0.18) {
      ctx.save();
      for (let i = 0; i < 2; i++) {
        const rise = ((this.time * 10 + i * 21) % 48) * pos.p;
        ctx.fillStyle = `rgba(62,63,58,${0.12 * pos.p * (1 - rise / 55)})`;
        ctx.beginPath();
        ctx.ellipse(-26 + i * 16, -h - 18 - rise, 10 + rise * 0.25, 6 + rise * 0.15, 0, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  } else if (entity.kind === 'barrier') {
    const w = 156;
    ctx.strokeStyle = rgba([64, 61, 54]);
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(-54, -5);
    ctx.lineTo(-42, -64);
    ctx.moveTo(55, -5);
    ctx.lineTo(45, -64);
    ctx.moveTo(-51, -5);
    ctx.lineTo(52, -5);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -96, w, 30);
    ctx.clip();
    ctx.fillStyle = rgba(mixRgb([248, 188, 42], haze, fog));
    ctx.fillRect(-w / 2, -96, w, 30);
    ctx.fillStyle = rgba(mixRgb([50, 43, 32], haze, fog));
    for (let i = -w / 2 - 30; i < w / 2 + 30; i += 28) {
      ctx.beginPath();
      ctx.moveTo(i, -66);
      ctx.lineTo(i + 18, -96);
      ctx.lineTo(i + 32, -96);
      ctx.lineTo(i + 14, -66);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,18,16,0.72)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(-w / 2, -96, w, 30);
    ctx.fillStyle = 'rgba(24,22,19,0.9)';
    ctx.fillRect(-w / 2 + 4, -88, 26, 14);
    ctx.fillStyle = '#ffcf3d';
    ctx.font = '700 9px "Cascadia Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('DANGER', -w / 2 + 6, -78);
    const blink = 0.45 + Math.abs(Math.sin(this.time * 5.5)) * 0.55;
    ctx.fillStyle = `rgba(255,120,53,${blink})`;
    ctx.beginPath();
    ctx.arc(w / 2 - 16, -101, 5.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = `rgba(255,191,70,${blink * 0.18})`;
    ctx.beginPath();
    ctx.arc(w / 2 - 16, -101, 15, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
};

Game.prototype.drawPickup = function drawPickup(entity, pos, scale, palette, depthAlpha) {
  const ctx = this.ctx;
  const bob = Math.sin(entity.phase * 2.1) * 5;
  const baseGlow = {
    coin: '255, 193, 62',
    ammo: '182, 255, 75',
    nitro: '103, 232, 237',
    repair: '255, 91, 70',
    shield: '124, 168, 255',
  }[entity.kind] || '255, 193, 62';
  ctx.save();
  ctx.globalAlpha = depthAlpha;
  ctx.translate(pos.x, pos.y + bob * scale);
  const scaleFinal = scale * 1.05;
  ctx.scale(scaleFinal, scaleFinal);

  const glow = ctx.createRadialGradient(0, -34, 2, 0, -34, 58);
  glow.addColorStop(0, `rgba(${baseGlow},0.3)`);
  glow.addColorStop(0.48, `rgba(${baseGlow},0.1)`);
  glow.addColorStop(1, `rgba(${baseGlow},0)`);
  ctx.fillStyle = glow;
  ctx.fillRect(-58, -92, 116, 110);

  ctx.strokeStyle = `rgba(${baseGlow},0.2)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(0, 1, 22, 4.5, 0, 0, TAU);
  ctx.stroke();

  if (entity.kind === 'coin') {
    const spin = Math.cos(entity.phase * 2.2);
    ctx.save();
    ctx.translate(0, -34);
    ctx.scale(Math.max(0.18, Math.abs(spin)), 1);
    ctx.fillStyle = '#e8a921';
    ctx.strokeStyle = '#ffe48d';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#7a4a10';
    ctx.beginPath();
    ctx.arc(0, -1, 10, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd562';
    ctx.beginPath();
    ctx.arc(-3.2, -4, 2.5, 0, TAU);
    ctx.arc(3.2, -4, 2.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#c98b1a';
    ctx.beginPath();
    ctx.arc(0, 1, 7.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff4b4';
    ctx.beginPath();
    ctx.arc(-5, -7, 2.5, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (entity.kind === 'ammo') {
    ctx.fillStyle = '#1c2e21';
    ctx.strokeStyle = '#b6ff4b';
    ctx.lineWidth = 2.2;
    ctx.fillRect(-19, -50, 38, 28);
    ctx.strokeRect(-19, -50, 38, 28);
    ctx.fillStyle = '#b6ff4b';
    ctx.fillRect(-14, -45, 9, 3);
    ctx.fillRect(-14, -39, 9, 3);
    ctx.fillRect(-14, -33, 9, 3);
    ctx.fillStyle = '#e5ffc1';
    ctx.fillRect(1, -44, 12, 16);
    ctx.fillStyle = '#3f6029';
    ctx.fillRect(4, -41, 6, 7);
    ctx.strokeStyle = 'rgba(182,255,75,0.55)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-22, -53, 44, 34);
  } else if (entity.kind === 'nitro') {
    ctx.save();
    ctx.rotate(-0.08);
    const grad = ctx.createLinearGradient(-15, 0, 17, 0);
    grad.addColorStop(0, '#114b5a');
    grad.addColorStop(0.45, '#58dfe7');
    grad.addColorStop(1, '#0b3641');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(-15, -52, 30, 40, 8);
    ctx.fill();
    ctx.strokeStyle = '#aefaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#b9fcff';
    ctx.fillRect(-8, -48, 16, 7);
    ctx.fillStyle = '#0b3037';
    ctx.beginPath();
    ctx.moveTo(3, -41);
    ctx.lineTo(-5, -30);
    ctx.lineTo(0, -30);
    ctx.lineTo(-3, -20);
    ctx.lineTo(6, -33);
    ctx.lineTo(1, -33);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#6ee7ed';
    ctx.fillRect(-8, -9, 16, 5);
    ctx.restore();
  } else if (entity.kind === 'repair') {
    ctx.fillStyle = '#e8e4d9';
    ctx.strokeStyle = '#ff6b52';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-20, -51, 40, 30, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ff5b46';
    ctx.fillRect(-4, -46, 8, 21);
    ctx.fillRect(-14, -37, 28, 8);
    ctx.fillStyle = 'rgba(40,40,37,0.65)';
    ctx.fillRect(-13, -26, 26, 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(-22, -53, 44, 34);
  } else if (entity.kind === 'shield') {
    const shieldGrad = ctx.createLinearGradient(0, -65, 0, -14);
    shieldGrad.addColorStop(0, '#cde3ff');
    shieldGrad.addColorStop(0.4, '#7ca8ff');
    shieldGrad.addColorStop(1, '#2f5ac9');
    ctx.fillStyle = shieldGrad;
    ctx.beginPath();
    ctx.moveTo(0, -65);
    ctx.lineTo(22, -57);
    ctx.lineTo(20, -34);
    ctx.quadraticCurveTo(17, -20, 0, -12);
    ctx.quadraticCurveTo(-17, -20, -20, -34);
    ctx.lineTo(-22, -57);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d8e9ff';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(17,36,83,0.75)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-8, -40);
    ctx.lineTo(-1, -32);
    ctx.lineTo(10, -48);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  const twinkle = 0.45 + Math.sin(entity.phase * 3.1) * 0.3;
  ctx.globalAlpha = depthAlpha * twinkle;
  ctx.beginPath();
  ctx.arc(-25, -66, 1.7, 0, TAU);
  ctx.arc(23, -27, 1.2, 0, TAU);
  ctx.fill();
  ctx.restore();
};

Game.prototype.drawTargetReticle = function drawTargetReticle(entity) {
  const ctx = this.ctx;
  const pos = this.getEntityScreenPosition(entity);
  const p = clamp(pos.p, 0, 1);
  if (p < 0.06) return;
  const size = (entity.type === 'zombie' ? 24 : 32) * (0.5 + p * 0.8);
  const pulse = 0.58 + Math.sin(this.time * 8) * 0.18;
  ctx.save();
  ctx.strokeStyle = `rgba(255,191,54,${pulse})`;
  ctx.lineWidth = 1.4;
  const y = pos.y - this.h * 0.07 * p;
  const x = pos.x;
  ctx.beginPath();
  for (const [sx, sy] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ]) {
    const cx = x + sx * size;
    const cy = y + sy * size;
    ctx.moveTo(cx - sx * 7, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy - sy * 7);
  }
  ctx.stroke();
  ctx.fillStyle = `rgba(255,191,54,${pulse * 0.75})`;
  ctx.fillRect(x - 1, y - 1, 2, 2);
  ctx.restore();
};

/* ═══════════════════════════════════════════════════════════════════════
   Player car & screen effects
   ═══════════════════════════════════════════════════════════════════════ */
Game.prototype.drawCar = function drawCar(palette, menu) {
  const ctx = this.ctx;
  const car = this.getCarScreenPosition();
  const scale = (this.h / 900) * 1.02;
  const speedNorm = clamp01(this.speed / 340);
  const bounce = Math.sin(this.wheelAngle * 1.85) * (0.5 + speedNorm * 1.3);
  const brake = !menu && input.brake && this.state === 'playing';
  const flicker =
    !menu && this.invulnerable > 0 && this.state === 'playing' && Math.floor(this.time * 18) % 2 === 0;

  ctx.save();
  ctx.translate(car.x, car.y + bounce);
  ctx.rotate(this.tilt * 0.8 - (menu ? 0.006 : 0));
  ctx.scale(scale, scale);
  if (flicker) ctx.globalAlpha = 0.68;

  // Ground shadow and a warm underbody pool.
  const shadow = ctx.createRadialGradient(0, -5, 18, 0, -5, 142);
  shadow.addColorStop(0, 'rgba(0,0,0,0.48)');
  shadow.addColorStop(0.65, 'rgba(0,0,0,0.22)');
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadow;
  ctx.beginPath();
  ctx.ellipse(0, -3, 148, 30, 0, 0, TAU);
  ctx.fill();

  const underglow = ctx.createRadialGradient(0, -18, 6, 0, -18, 120);
  underglow.addColorStop(0, this.nitroActive ? 'rgba(103,232,237,0.22)' : 'rgba(255,147,54,0.13)');
  underglow.addColorStop(1, 'rgba(255,130,40,0)');
  ctx.fillStyle = underglow;
  ctx.fillRect(-130, -120, 260, 132);

  // Rear tyres, with animated tread.
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 86, -27);
    ctx.fillStyle = '#0b0d0d';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 30, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 30, 0, 0, TAU);
    ctx.clip();
    ctx.fillStyle = '#262a29';
    const treadOffset = (this.wheelAngle * 17 + (side > 0 ? 9 : 0)) % 14;
    for (let i = -2; i < 4; i++) {
      ctx.fillRect(-18, i * 14 + treadOffset - 32, 36, 4.5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(-17, -28, 5, 56);
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(side * 86, -27, 17, 30, 0, 0, TAU);
    ctx.stroke();
  }

  // Main body shell — wide, low hypercar haunches.
  const bodyPath = () => {
    ctx.beginPath();
    ctx.moveTo(-99, -46);
    ctx.quadraticCurveTo(-106, -64, -100, -92);
    ctx.quadraticCurveTo(-97, -114, -76, -123);
    ctx.lineTo(-52, -128);
    ctx.quadraticCurveTo(-47, -148, -30, -153);
    ctx.lineTo(30, -153);
    ctx.quadraticCurveTo(47, -148, 52, -128);
    ctx.lineTo(76, -123);
    ctx.quadraticCurveTo(97, -114, 100, -92);
    ctx.quadraticCurveTo(106, -64, 99, -46);
    ctx.closePath();
  };
  const body = ctx.createLinearGradient(0, -156, 0, -20);
  body.addColorStop(0, rgba(mixRgb([238, 118, 82], palette.haze, 0.08)));
  body.addColorStop(0.14, rgba(mixRgb([205, 70, 47], palette.haze, 0.05)));
  body.addColorStop(0.46, rgba(mixRgb([154, 42, 29], palette.haze, 0.03)));
  body.addColorStop(0.8, rgba(mixRgb([96, 26, 21], palette.haze, 0.02)));
  body.addColorStop(1, rgba([48, 13, 13]));
  ctx.fillStyle = body;
  bodyPath();
  ctx.fill();

  // Sculpted 3D surfaces clipped inside the shell.
  ctx.save();
  bodyPath();
  ctx.clip();
  const leftSheen = ctx.createLinearGradient(-100, 0, 0, 0);
  leftSheen.addColorStop(0, 'rgba(255,176,128,0.3)');
  leftSheen.addColorStop(0.3, 'rgba(255,146,94,0.05)');
  leftSheen.addColorStop(1, 'rgba(255,120,70,0)');
  ctx.fillStyle = leftSheen;
  ctx.fillRect(-110, -160, 120, 130);
  const rightShade = ctx.createLinearGradient(0, 0, 104, 0);
  rightShade.addColorStop(0, 'rgba(0,0,0,0)');
  rightShade.addColorStop(0.55, 'rgba(28,4,8,0.22)');
  rightShade.addColorStop(1, 'rgba(14,2,5,0.5)');
  ctx.fillStyle = rightShade;
  ctx.fillRect(0, -160, 110, 130);
  // Upper shoulder highlights.
  ctx.strokeStyle = 'rgba(255,196,150,0.42)';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-96, -112);
  ctx.quadraticCurveTo(-82, -124, -54, -128);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,205,160,0.2)';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(96, -112);
  ctx.quadraticCurveTo(82, -124, 54, -128);
  ctx.stroke();
  // Rear fender vents.
  ctx.fillStyle = 'rgba(9,10,10,0.82)';
  for (const side of [-1, 1]) {
    ctx.save();
    ctx.translate(side * 79, -108);
    ctx.rotate(side * 0.16);
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(-11, i * 6, 22, 3.2);
    }
    ctx.restore();
  }
  ctx.restore();

  // Beltline highlight.
  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = 'rgba(255,186,136,0.8)';
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(-94, -96);
  ctx.quadraticCurveTo(0, -84, 94, -96);
  ctx.stroke();
  ctx.restore();

  // Cabin and rear glass — sharper, more cab-forward shape.
  const glassPath = () => {
    ctx.beginPath();
    ctx.moveTo(-41, -126);
    ctx.lineTo(-30, -147);
    ctx.quadraticCurveTo(0, -151, 30, -147);
    ctx.lineTo(41, -126);
    ctx.lineTo(30, -120);
    ctx.lineTo(-30, -120);
    ctx.closePath();
  };
  const glass = ctx.createLinearGradient(0, -150, 0, -120);
  glass.addColorStop(0, 'rgba(112,151,166,0.95)');
  glass.addColorStop(0.42, 'rgba(43,69,82,0.97)');
  glass.addColorStop(1, 'rgba(15,27,34,0.99)');
  ctx.fillStyle = glass;
  glassPath();
  ctx.fill();
  ctx.save();
  glassPath();
  ctx.clip();
  ctx.fillStyle = 'rgba(200,232,239,0.18)';
  ctx.beginPath();
  ctx.moveTo(-44, -141);
  ctx.lineTo(14, -152);
  ctx.lineTo(34, -146);
  ctx.lineTo(-24, -122);
  ctx.closePath();
  ctx.fill();
  // Defroster lines.
  ctx.strokeStyle = 'rgba(208,224,228,0.12)';
  ctx.lineWidth = 0.9;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(-30 + i * 1.4, -126 - i * 4.4);
    ctx.lineTo(30 - i * 1.4, -126 - i * 4.4);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(8,16,19,0.8)';
  ctx.lineWidth = 1.8;
  glassPath();
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,196,150,0.22)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-40, -127);
  ctx.lineTo(-29, -147);
  ctx.stroke();

  // Rear deck with a subtle raised centre spine.
  ctx.fillStyle = rgba(mixRgb([118, 33, 26], palette.haze, 0.02));
  ctx.beginPath();
  ctx.moveTo(-91, -122);
  ctx.quadraticCurveTo(0, -132, 91, -122);
  ctx.lineTo(87, -111);
  ctx.quadraticCurveTo(0, -120, -87, -111);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = 'rgba(255,178,122,0.2)';
  ctx.beginPath();
  ctx.moveTo(-42, -126);
  ctx.quadraticCurveTo(0, -131, 42, -126);
  ctx.lineTo(36, -122.5);
  ctx.quadraticCurveTo(0, -127, -36, -122.5);
  ctx.closePath();
  ctx.fill();

  // Active aero wing with endplates.
  ctx.fillStyle = '#1c1d1b';
  ctx.fillRect(-62, -132, 7, 20);
  ctx.fillRect(55, -132, 7, 20);
  ctx.fillStyle = 'rgba(255,179,31,0.2)';
  ctx.fillRect(-62, -132, 7, 1.6);
  ctx.fillRect(55, -132, 7, 1.6);
  const wingGrad = ctx.createLinearGradient(0, -150, 0, -138);
  wingGrad.addColorStop(0, '#4a4843');
  wingGrad.addColorStop(0.35, '#2c2d2a');
  wingGrad.addColorStop(1, '#141514');
  ctx.fillStyle = wingGrad;
  ctx.beginPath();
  ctx.roundRect(-84, -150, 168, 9, 3);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,178,92,0.35)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-82, -149);
  ctx.lineTo(82, -149);
  ctx.stroke();
  // Endplates.
  ctx.fillStyle = '#191a18';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.roundRect(side * 84 - (side > 0 ? 0 : 7), -155, 7, 19, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,179,31,0.55)';
    ctx.fillRect(side * 84 - (side > 0 ? 0 : 7), -155, 7, 1.8);
    ctx.fillStyle = '#191a18';
  }
  // High-mount rain light on the wing.
  ctx.fillStyle = 'rgba(255,70,48,0.85)';
  ctx.shadowColor = 'rgba(255,52,32,0.8)';
  ctx.shadowBlur = 8;
  ctx.fillRect(-8, -147, 16, 2.4);
  ctx.shadowBlur = 0;

  // Full-width LED light bar.
  ctx.fillStyle = 'rgba(16,11,11,0.95)';
  ctx.beginPath();
  ctx.roundRect(-94, -104, 188, 20, 9);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,142,98,0.16)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.save();
  ctx.shadowColor = brake ? 'rgba(255,92,62,0.95)' : 'rgba(255,48,28,0.7)';
  ctx.shadowBlur = brake ? 30 : 17;
  const barGrad = ctx.createLinearGradient(-88, 0, 88, 0);
  barGrad.addColorStop(0, brake ? '#ffd9c4' : '#ff9b6a');
  barGrad.addColorStop(0.18, brake ? '#ff8560' : '#f0442a');
  barGrad.addColorStop(0.5, brake ? '#fff0e2' : '#ff8a55');
  barGrad.addColorStop(0.82, brake ? '#ff8560' : '#f0442a');
  barGrad.addColorStop(1, brake ? '#ffd9c4' : '#ff9b6a');
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.roundRect(-88, -99, 176, 9, 4.5);
  ctx.fill();
  ctx.restore();
  // Segmented LEDs over the bar.
  ctx.fillStyle = brake ? 'rgba(24,10,8,0.45)' : 'rgba(52,8,5,0.62)';
  for (let i = 1; i < 17; i++) {
    ctx.fillRect(-88 + i * (176 / 17), -99, 2.1, 9);
  }
  // Outer clusters and reverse strips.
  for (const side of [-1, 1]) {
    ctx.fillStyle = brake ? '#fff4e6' : '#ffcf9a';
    ctx.fillRect(side * 79 - 7, -97.6, 14, 5.4);
    ctx.fillStyle = 'rgba(22,17,15,0.9)';
    ctx.fillRect(side * 79 - 1, -99, 2, 9);
  }
  // Bumper reflectors.
  for (const side of [-1, 1]) {
    ctx.fillStyle = 'rgba(255,74,48,0.5)';
    ctx.fillRect(side * 80 - 9, -51, 18, 4);
  }
  if (brake) {
    const brakeGlow = ctx.createRadialGradient(0, -88, 8, 0, -88, 118);
    brakeGlow.addColorStop(0, 'rgba(255,72,42,0.2)');
    brakeGlow.addColorStop(1, 'rgba(255,72,42,0)');
    ctx.fillStyle = brakeGlow;
    ctx.fillRect(-126, -180, 252, 170);
  }

  // License plate.
  ctx.fillStyle = 'rgba(216,207,179,0.94)';
  ctx.beginPath();
  ctx.roundRect(-27, -76, 54, 16, 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,38,33,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#2a2925';
  ctx.font = '700 9px "Cascadia Mono", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DEAD-07', 0, -67.6);

  // Carbon diffuser with vertical strakes.
  const diffuser = ctx.createLinearGradient(0, -42, 0, -8);
  diffuser.addColorStop(0, '#2b2c29');
  diffuser.addColorStop(0.55, '#171817');
  diffuser.addColorStop(1, '#0b0c0b');
  ctx.fillStyle = diffuser;
  ctx.beginPath();
  ctx.moveTo(-90, -43);
  ctx.lineTo(90, -43);
  ctx.lineTo(80, -9);
  ctx.lineTo(-80, -9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(128,132,122,0.28)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
  for (let i = -3; i <= 3; i++) {
    const x = i * 22;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(58,61,56,0.85)' : 'rgba(40,42,38,0.9)';
    ctx.beginPath();
    ctx.moveTo(x - 2.4, -41);
    ctx.lineTo(x + 2.4, -41);
    ctx.lineTo(x + 4.4, -11);
    ctx.lineTo(x + 0.8, -11);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,146,96,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-90, -43);
  ctx.lineTo(90, -43);
  ctx.stroke();

  // Quad titanium exhausts with nitro flame.
  const exhausts = [-68, -48, 48, 68];
  for (const ex of exhausts) {
    ctx.fillStyle = '#0d0f0f';
    ctx.beginPath();
    ctx.ellipse(ex, -22, 9, 6.8, 0, 0, TAU);
    ctx.fill();
    const tip = ctx.createLinearGradient(ex - 9, 0, ex + 9, 0);
    tip.addColorStop(0, '#42463f');
    tip.addColorStop(0.45, '#b9b4a2');
    tip.addColorStop(1, '#3b3f39');
    ctx.strokeStyle = tip;
    ctx.lineWidth = 2.2;
    ctx.stroke();
    ctx.fillStyle = '#050606';
    ctx.beginPath();
    ctx.ellipse(ex, -22, 5.4, 3.9, 0, 0, TAU);
    ctx.fill();
    if (this.nitroActive && !menu) {
      const flick = 0.72 + Math.random() * 0.5;
      const flame = ctx.createLinearGradient(ex, -25, ex, 6);
      flame.addColorStop(0, 'rgba(226,255,255,0.95)');
      flame.addColorStop(0.25, 'rgba(103,232,237,0.85)');
      flame.addColorStop(0.7, 'rgba(255,179,31,0.55)');
      flame.addColorStop(1, 'rgba(255,103,31,0)');
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(ex - 6, -25);
      ctx.quadraticCurveTo(ex - 3.6, -4 * flick, ex, 10 * flick);
      ctx.quadraticCurveTo(ex + 3.6, -4 * flick, ex + 6, -25);
      ctx.closePath();
      ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(103,232,237,0.3)';
      ctx.beginPath();
      ctx.ellipse(ex, -12, 8, 14, 0, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // Roof-mounted twin cannon.
  ctx.fillStyle = '#242522';
  ctx.beginPath();
  ctx.roundRect(-17, -158, 34, 10, 3);
  ctx.fill();
  ctx.fillStyle = '#3b3d38';
  ctx.fillRect(-8, -171, 5, 18);
  ctx.fillRect(3, -171, 5, 18);
  ctx.fillStyle = '#151716';
  ctx.fillRect(-9.5, -173, 8, 5);
  ctx.fillRect(1.5, -173, 8, 5);
  ctx.fillStyle = 'rgba(255,179,31,0.9)';
  ctx.fillRect(-16, -157, 32, 1.6);

  if (this.muzzleFlash > 0 && !menu) {
    const strength = clamp01(this.muzzleFlash / 0.075);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = strength;
    const flash = ctx.createRadialGradient(0, -176, 0, 0, -176, 38);
    flash.addColorStop(0, 'rgba(255,252,220,0.95)');
    flash.addColorStop(0.35, 'rgba(255,196,73,0.65)');
    flash.addColorStop(1, 'rgba(255,128,31,0)');
    ctx.fillStyle = flash;
    ctx.fillRect(-42, -218, 84, 84);
    ctx.strokeStyle = 'rgba(255,239,175,0.9)';
    ctx.lineWidth = 2.4;
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * TAU + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 8, -176 + Math.sin(angle) * 8);
      ctx.lineTo(
        Math.cos(angle) * (20 + 12 * strength),
        -176 + Math.sin(angle) * (20 + 12 * strength),
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // Shield bubble.
  if (this.shield > 0 && !menu) {
    const pulse = 0.55 + Math.sin(this.time * 6.4) * 0.2;
    const shieldGrad = ctx.createRadialGradient(0, -78, 26, 0, -78, 132);
    shieldGrad.addColorStop(0, 'rgba(103,232,237,0)');
    shieldGrad.addColorStop(0.72, `rgba(103,232,237,${0.05 * pulse})`);
    shieldGrad.addColorStop(1, `rgba(103,232,237,${0.2 * pulse})`);
    ctx.fillStyle = shieldGrad;
    ctx.beginPath();
    ctx.ellipse(0, -78, 130, 124, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `rgba(142,247,250,${0.45 * pulse})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(0, -78, 130, 124, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(103,232,237,${0.28 * pulse})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(0, -78, 112, 106, 0, -0.6, 1.8);
    ctx.stroke();
  }

  ctx.restore();
};

Game.prototype.drawParticles = function drawParticles(front) {
  const ctx = this.ctx;
  if (!this.particles.length) return;
  ctx.save();
  for (const particle of this.particles) {
    if (Boolean(particle.front) !== front) continue;
    const t = clamp01(particle.life / (particle.maxLife || 1));
    if (t <= 0) continue;
    const alpha = t * (particle.alpha ?? 1);
    if (particle.shape === 'smoke') {
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.ellipse(particle.x, particle.y, particle.size * (1.4 - t * 0.4), particle.size * (1.05 - t * 0.2), 0, 0, TAU);
      ctx.fill();
    } else if (particle.shape === 'rect') {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate((particle.rot || 0) + (particle.spin || 0) * (1 - t) * 0.3);
      const size = particle.size * (0.55 + t * 0.55);
      ctx.fillRect(-size / 2, -size / 2, size, size * 0.7);
      ctx.restore();
    } else if (particle.shape === 'spark') {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = particle.color;
      ctx.lineWidth = Math.max(0.8, particle.size * 0.5);
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 0.022, particle.y - particle.vy * 0.022);
      ctx.stroke();
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0.5, particle.size * 0.42), 0, TAU);
      ctx.fill();
    } else {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, Math.max(0.5, particle.size * (0.55 + t * 0.45)), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
};

Game.prototype.drawTracers = function drawTracers() {
  const ctx = this.ctx;
  if (!this.tracers.length) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const tracer of this.tracers) {
    const progress = clamp01(tracer.t / tracer.dur);
    const alpha = 1 - progress;
    const gradient = ctx.createLinearGradient(tracer.x1, tracer.y1, tracer.x2, tracer.y2);
    gradient.addColorStop(0, `rgba(255,248,209,${0.95 * alpha})`);
    gradient.addColorStop(0.55, `rgba(255,190,58,${0.85 * alpha})`);
    gradient.addColorStop(1, `rgba(255,255,255,${0.22 * alpha})`);
    ctx.strokeStyle = gradient;
    ctx.lineWidth = 2.4 + (1 - progress) * 1.4;
    ctx.beginPath();
    ctx.moveTo(tracer.x1, tracer.y1);
    ctx.lineTo(tracer.x2, tracer.y2);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,217,120,${0.85 * alpha})`;
    ctx.beginPath();
    ctx.arc(tracer.x1, tracer.y1, 4.5 * alpha, 0, TAU);
    ctx.fill();

    if (tracer.hit) {
      const radius = 5 + progress * 22;
      ctx.strokeStyle = `rgba(255,179,31,${0.7 * alpha})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(tracer.x2, tracer.y2, radius, 0, TAU);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,226,140,${0.7 * alpha})`;
      ctx.beginPath();
      ctx.arc(tracer.x2, tracer.y2, Math.max(0.5, 5 * alpha), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
};

Game.prototype.drawFloatTexts = function drawFloatTexts() {
  const ctx = this.ctx;
  if (!this.floatTexts.length) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const text of this.floatTexts) {
    const t = clamp01(text.life / 1.05);
    const appear = clamp01((1.05 - text.life) * 8);
    const scale = 0.7 + appear * 0.3;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t * 1.5);
    ctx.translate(text.x, text.y);
    ctx.scale(scale, scale);
    ctx.font = `800 ${text.size}px "Bahnschrift Condensed", "Arial Black", Impact, sans-serif`;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(6,9,8,0.78)';
    ctx.strokeText(text.text, 0, 0);
    ctx.fillStyle = text.color;
    ctx.fillText(text.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
};

Game.prototype.drawSpeedLines = function drawSpeedLines() {
  if (!this.speedLines.length) return;
  const ctx = this.ctx;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const line of this.speedLines) {
    const gradient = ctx.createLinearGradient(line.x, line.y, line.x + line.len, line.y);
    if (this.nitroActive) {
      gradient.addColorStop(0, `rgba(103,232,237,0)`);
      gradient.addColorStop(0.5, `rgba(150,248,250,${line.alpha * 1.6})`);
      gradient.addColorStop(1, `rgba(255,220,140,0)`);
    } else {
      gradient.addColorStop(0, `rgba(255,250,235,0)`);
      gradient.addColorStop(0.55, `rgba(255,244,214,${line.alpha})`);
      gradient.addColorStop(1, `rgba(255,255,255,0)`);
    }
    ctx.strokeStyle = gradient;
    ctx.lineWidth = this.nitroActive ? 1.6 : 1.1;
    ctx.beginPath();
    ctx.moveTo(line.x, line.y);
    ctx.lineTo(line.x + line.len, line.y);
    ctx.stroke();
  }
  ctx.restore();
};

Game.prototype.drawForeground = function drawForeground(palette, menu) {
  const ctx = this.ctx;
  const w = this.w;
  const h = this.h;
  const time = menu ? this.menuTime : this.time;

  // Grounding shadow at the base of the frame.
  const base = ctx.createLinearGradient(0, h * 0.87, 0, h + 2);
  base.addColorStop(0, 'rgba(5,8,7,0)');
  base.addColorStop(0.7, 'rgba(5,8,7,0.24)');
  base.addColorStop(1, 'rgba(4,6,5,0.62)');
  ctx.fillStyle = base;
  ctx.fillRect(0, h * 0.87, w, h * 0.13 + 2);

  // Silhouetted grass framing the edges.
  ctx.save();
  const grassDark = rgba(mixRgb(palette.forest, [8, 12, 10], 0.5), 0.92);
  const grassLight = rgba(mixRgb(palette.forestHi, [13, 19, 16], 0.35), 0.8);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const seed = i * 6.3 + (side > 0 ? 41 : 0);
      const edge = hash(seed) * w * 0.14;
      const x = side < 0 ? edge : w - edge;
      const height = h * (0.07 + hash(seed + 2.2) * 0.15);
      const lean = side * (8 + hash(seed + 4.4) * 24);
      const sway = Math.sin(time * 1.6 + i * 0.8) * (2 + hash(seed + 7.1) * 3);
      ctx.strokeStyle = i % 3 === 0 ? grassLight : grassDark;
      ctx.lineWidth = 1.6 + hash(seed + 9.5) * 2.1;
      ctx.beginPath();
      ctx.moveTo(x, h + 4);
      ctx.quadraticCurveTo(
        x + lean * 0.28 + sway * 0.4,
        h - height * 0.55,
        x + lean + sway,
        h - height,
      );
      ctx.stroke();
      if (i % 2 === 0) {
        ctx.lineWidth *= 0.65;
        ctx.beginPath();
        ctx.moveTo(x + 2, h + 4);
        ctx.quadraticCurveTo(
          x + lean * 0.1,
          h - height * 0.42,
          x + lean * 0.55 - sway,
          h - height * 0.78,
        );
        ctx.stroke();
      }
    }
  }
  ctx.restore();

  // Faint heat shimmer band above the asphalt.
  const shimmer = ctx.createLinearGradient(0, this.nearY - h * 0.05, 0, this.nearY + h * 0.02);
  shimmer.addColorStop(0, 'rgba(255,214,160,0)');
  shimmer.addColorStop(0.55, `rgba(255,214,160,${menu ? 0.025 : 0.045})`);
  shimmer.addColorStop(1, 'rgba(255,214,160,0)');
  ctx.fillStyle = shimmer;
  ctx.fillRect(0, this.nearY - h * 0.05, w, h * 0.07);
};

Game.prototype.drawScreenAtmosphere = function drawScreenAtmosphere(palette, menu) {
  const ctx = this.ctx;
  const w = this.w;
  const h = this.h;
  const min = Math.min(w, h);

  const vignette = ctx.createRadialGradient(w * 0.5, h * 0.46, min * 0.3, w * 0.5, h * 0.52, Math.max(w, h) * 0.78);
  vignette.addColorStop(0, 'rgba(4,7,7,0)');
  vignette.addColorStop(0.68, 'rgba(4,7,7,0.08)');
  vignette.addColorStop(1, 'rgba(3,5,5,0.58)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);

  if (!menu && this.nitroActive) {
    const boost = ctx.createRadialGradient(w * 0.5, h * 0.55, min * 0.18, w * 0.5, h * 0.55, Math.max(w, h) * 0.62);
    boost.addColorStop(0, 'rgba(103,232,237,0)');
    boost.addColorStop(0.7, 'rgba(103,232,237,0.04)');
    boost.addColorStop(1, 'rgba(255,179,31,0.09)');
    ctx.fillStyle = boost;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(103,232,237,0.05)';
    ctx.fillRect(0, 0, w, h * 0.08);
    ctx.fillRect(0, h * 0.92, w, h * 0.08);
  }

  if (!menu && this.hitFlash > 0) {
    const hit = clamp01(this.hitFlash / 0.25);
    const flash = ctx.createRadialGradient(w * 0.5, h * 0.56, min * 0.1, w * 0.5, h * 0.56, Math.max(w, h) * 0.66);
    flash.addColorStop(0, 'rgba(255,60,36,0)');
    flash.addColorStop(0.55, `rgba(255,60,36,${0.08 * hit})`);
    flash.addColorStop(1, `rgba(255,30,18,${0.32 * hit})`);
    ctx.fillStyle = flash;
    ctx.fillRect(0, 0, w, h);
  }

  if (!menu && this.state === 'playing' && this.health > 0 && this.health < 32) {
    const urgency = 1 - this.health / 32;
    const pulse = 0.55 + Math.sin(this.time * (4.5 + urgency * 4)) * 0.45;
    const warning = ctx.createRadialGradient(w * 0.5, h * 0.56, min * 0.24, w * 0.5, h * 0.56, Math.max(w, h) * 0.7);
    warning.addColorStop(0, 'rgba(255,45,30,0)');
    warning.addColorStop(0.72, `rgba(255,45,30,${0.03 * pulse})`);
    warning.addColorStop(1, `rgba(255,35,22,${0.2 * urgency * pulse})`);
    ctx.fillStyle = warning;
    ctx.fillRect(0, 0, w, h);
  }

  if (this.shield > 0 && !menu) {
    const pulse = 0.5 + Math.sin(this.time * 6.4) * 0.2;
    const edge = ctx.createRadialGradient(w * 0.5, h * 0.55, min * 0.3, w * 0.5, h * 0.55, Math.max(w, h) * 0.7);
    edge.addColorStop(0, 'rgba(103,232,237,0)');
    edge.addColorStop(1, `rgba(103,232,237,${0.12 * pulse})`);
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  }

  if (this.state === 'dying' || this.state === 'gameover') {
    const fade = this.state === 'dying' ? clamp01(1.45 - this.dyingTimer) : 1;
    const red = ctx.createRadialGradient(w * 0.5, h * 0.54, min * 0.16, w * 0.5, h * 0.54, Math.max(w, h) * 0.72);
    red.addColorStop(0, 'rgba(120,12,8,0)');
    red.addColorStop(0.6, `rgba(120,12,8,${0.12 * fade})`);
    red.addColorStop(1, `rgba(92,6,4,${0.4 * fade})`);
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, w, h);
  }

  // Horizon dust haze keeps distant geometry anchored.
  const haze = ctx.createLinearGradient(0, this.horizonY - h * 0.03, 0, this.horizonY + h * 0.11);
  haze.addColorStop(0, rgba(palette.haze, 0));
  haze.addColorStop(0.5, rgba(palette.haze, menu ? 0.05 : 0.07));
  haze.addColorStop(1, rgba(palette.haze, 0));
  ctx.fillStyle = haze;
  ctx.fillRect(0, this.horizonY - h * 0.03, w, h * 0.14);
};

/* ═══════════════════════════════════════════════════════════════════════
   Bootstrap
   ═══════════════════════════════════════════════════════════════════════ */
function resetHudCache() {
  for (const key of Object.keys(hudCache)) hudCache[key] = '';
  if (ui.statusEffects) ui.statusEffects.innerHTML = '';
  ui.comboBadge.classList.remove('visible');
  ui.toast.classList.remove('visible');
}

function toggleMute() {
  sound.ensure();
  settings.muted = !settings.muted;
  sound.setMuted(settings.muted);
  saveSettings();
  updateSoundButton();
  showToast(
    settings.muted ? 'AUDIO MUTED' : 'AUDIO ONLINE',
    settings.muted ? 'Press M to bring it back' : 'Engine noise restored',
    '',
  );
}

function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      const request = document.documentElement.requestFullscreen;
      if (request) request.call(document.documentElement).catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  } catch (error) {
    // Fullscreen can be blocked by the browser; keep playing either way.
  }
}

function bindInterface() {
  $('btnPlay')?.addEventListener('click', startNewRun);
  $('btnInstructions')?.addEventListener('click', () => openModal('instructions'));
  $('btnSettings')?.addEventListener('click', () => openModal('settings'));
  $('btnMenuSound')?.addEventListener('click', () => openModal('settings'));
  $('btnPause')?.addEventListener('click', pauseRun);
  $('btnResume')?.addEventListener('click', resumeRun);
  $('btnPauseSettings')?.addEventListener('click', () => openModal('settings'));
  $('btnRestart')?.addEventListener('click', restartRun);
  $('btnQuit')?.addEventListener('click', quitToMenu);
  $('btnRetry')?.addEventListener('click', restartRun);
  $('btnGameoverMenu')?.addEventListener('click', quitToMenu);
  $('btnHudSound')?.addEventListener('click', toggleMute);
  $('btnFullscreen')?.addEventListener('click', toggleFullscreen);

  document.querySelectorAll('[data-close-modal]').forEach((button) => {
    button.addEventListener('click', closeModal);
  });
  ui.modalLayer?.addEventListener('pointerdown', (event) => {
    if (event.target === ui.modalLayer) closeModal();
  });

  ui.musicToggle?.addEventListener('change', () => {
    settings.musicOn = ui.musicToggle.checked;
    sound.ensure();
    sound.setMusicEnabled(settings.musicOn);
    saveSettings();
  });
  ui.sfxToggle?.addEventListener('change', () => {
    settings.sfxOn = ui.sfxToggle.checked;
    sound.ensure();
    sound.setSfxEnabled(settings.sfxOn);
    saveSettings();
    if (settings.sfxOn) sound.sfx('ui');
  });
  ui.shakeToggle?.addEventListener('change', () => {
    settings.shake = ui.shakeToggle.checked;
    saveSettings();
  });
  ui.musicVolume?.addEventListener('input', () => {
    const value = Number(ui.musicVolume.value) / 100;
    settings.musicVol = value;
    sound.setMusicVolume(value);
    ui.musicVolLabel.textContent = `${Math.round(value * 100)}%`;
    ui.musicVolume.style.setProperty('--range', `${value * 100}%`);
    saveSettings();
  });
  ui.sfxVolume?.addEventListener('input', () => {
    const value = Number(ui.sfxVolume.value) / 100;
    settings.sfxVol = value;
    sound.setSfxVolume(value);
    ui.sfxVolLabel.textContent = `${Math.round(value * 100)}%`;
    ui.sfxVolume.style.setProperty('--range', `${value * 100}%`);
    saveSettings();
  });
}

function boot() {
  sound.setMuted(settings.muted);
  sound.setMusicEnabled(settings.musicOn);
  sound.setSfxEnabled(settings.sfxOn);
  sound.setMusicVolume(settings.musicVol);
  sound.setSfxVolume(settings.sfxVol);

  game = new Game(canvas, sound, {
    onHud: updateHud,
    onCountdown: showCountdown,
    onToast: showToast,
    onDamage: (amount) => flashDamage(clamp(amount / 24, 0.45, 1.15)),
    onDying: () => showToast('CRITICAL FAILURE', 'Systems offline', 'warn', 1100),
    onGameOver: handleGameOver,
    onStart: resetHudCache,
  });

  bindInterface();
  bindTouchControls();
  applySettingsToUI();
  refreshMenuStats();
  showScreen('menu');
  sound.setScene('menu');
  updateSoundButton();

  let resizeFrame = 0;
  const scheduleResize = () => {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      game?.resize();
    });
  };
  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game && game.state === 'playing') pauseRun();
  });

  let lastTime = performance.now();
  const frame = (now) => {
    const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (game.state === 'playing') game.update(dt);
    else if (game.state === 'dying') game.updateDying(dt);
    else if (game.state === 'menu') game.updateMenu(dt);
    else if (game.state === 'gameover') game.updateIdle(dt);
    sound.update(game.speed, game.state);
    game.render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame((now) => {
    lastTime = now;
    requestAnimationFrame(frame);
  });
}

boot();
