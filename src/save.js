import { STAGES_PER_WORLD, getStageConfig, stageKey, WORLDS } from './levels.js'

const BASE_KEY = 'temple-run-3d.profile.v1'

// Every local account gets its own profile slot. `null` means the guest slot,
// which keeps using the original key so pre-login progress is never lost.
let activeSlot = null

export const UPGRADES = {
  magnet: {
    name: 'Relic Magnet',
    icon: 'magnet',
    desc: 'Forge stronger lodestones. Each rank adds +2s to magnet pickups.',
    max: 5,
    costs: [120, 240, 420, 680, 1000],
    effect: (lvl) => `+${lvl * 2}s magnet`,
  },
  heart: {
    name: 'Jade Heart',
    icon: 'heart',
    desc: 'An extra heart lets you survive one more mistake in the ruins.',
    max: 3,
    costs: [200, 420, 760],
    effect: (lvl) => `+${lvl} heart${lvl > 1 ? 's' : ''}`,
  },
  value: {
    name: 'Gilded Touch',
    icon: 'coin',
    desc: 'Every coin you touch is worth a little more. Pure alchemy.',
    max: 5,
    costs: [150, 300, 520, 800, 1200],
    effect: (lvl) => `+${lvl * 8}% coin value`,
  },
}

function defaults() {
  return {
    coins: 0,
    totalCoins: 0,
    next: { world: 1, stage: 1 },
    stars: {},
    bests: {},
    upgrades: { magnet: 0, heart: 0, value: 0 },
    settings: { sound: true, music: true, quality: 'high', guide: true },
    stats: { runs: 0, cleared: 0, distance: 0, coinsRun: 0 },
    tutorialSeen: false,
    createdAt: Date.now(),
  }
}

let cache = null

function keyForSlot(slot) {
  return slot ? `${BASE_KEY}.${slot}` : BASE_KEY
}

function parseProfile(raw) {
  const base = defaults()
  if (!raw) return base
  try {
    const parsed = JSON.parse(raw)
    return {
      ...base,
      ...parsed,
      next: { ...base.next, ...(parsed.next || {}) },
      upgrades: { ...base.upgrades, ...(parsed.upgrades || {}) },
      settings: { ...base.settings, ...(parsed.settings || {}) },
      stats: { ...base.stats, ...(parsed.stats || {}) },
      stars: parsed.stars || {},
      bests: parsed.bests || {},
    }
  } catch {
    return base
  }
}

export function loadProfile() {
  if (cache) return cache
  cache = parseProfile(localStorage.getItem(keyForSlot(activeSlot)))
  return cache
}

export function saveProfile(profile = cache) {
  cache = profile
  try {
    localStorage.setItem(keyForSlot(activeSlot), JSON.stringify(profile))
  } catch {
    /* storage might be unavailable — the run still works */
  }
}

export function resetProfile() {
  cache = defaults()
  saveProfile(cache)
  return cache
}

/** Switch the save slot used by loadProfile/saveProfile. */
export function useProfileSlot(slot, { claimLegacy = false } = {}) {
  activeSlot = slot || null
  cache = null
  try {
    if (claimLegacy && activeSlot) {
      const slotKey = keyForSlot(activeSlot)
      const legacy = localStorage.getItem(BASE_KEY)
      if (!localStorage.getItem(slotKey) && legacy) {
        localStorage.setItem(slotKey, legacy)
        localStorage.removeItem(BASE_KEY)
      }
    }
  } catch {
    /* ignore storage failures */
  }
  return loadProfile()
}

export function activeProfileSlot() {
  return activeSlot
}

/** Read a profile without switching slots — used by the login screen. */
export function readProfileSlot(slot) {
  try {
    return parseProfile(localStorage.getItem(keyForSlot(slot)))
  } catch {
    return defaults()
  }
}

export function deleteProfileSlot(slot) {
  try {
    localStorage.removeItem(keyForSlot(slot))
  } catch {
    /* ignore */
  }
  if ((slot || null) === activeSlot) cache = null
}

export function hasLegacyProfile() {
  try {
    const raw = localStorage.getItem(BASE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw)
    return !!(
      parsed &&
      (Object.keys(parsed.stars || {}).length > 0 ||
        (parsed.stats && (parsed.stats.cleared > 0 || parsed.stats.runs > 0)) ||
        (parsed.totalCoins || 0) > 0)
    )
  } catch {
    return false
  }
}

export function isStageUnlocked(profile, world, stage) {
  if (profile.stars[stageKey(world, stage)] > 0) return true
  return profile.next.world === world && profile.next.stage === stage
}

export function isWorldUnlocked(profile, world) {
  if (world <= profile.next.world) return true
  for (let s = 1; s <= STAGES_PER_WORLD; s++) {
    if (profile.stars[stageKey(world, s)]) return true
  }
  return false
}

export function stageBest(profile, world, stage) {
  return profile.bests[stageKey(world, stage)] || null
}

export function advanceProgress(profile, world, stage) {
  if (world !== profile.next.world || stage !== profile.next.stage) return
  let nWorld = world
  let nStage = stage + 1
  if (nStage > STAGES_PER_WORLD) {
    nWorld = world + 1
    nStage = 1
  }
  if (nWorld > WORLDS.length) {
    profile.next = { world: WORLDS.length, stage: STAGES_PER_WORLD }
    profile.complete = true
  } else {
    profile.next = { world: nWorld, stage: nStage }
  }
}

export function recordRun(profile, { world, stage, distance, coins, score, hits, stars, cleared, time }) {
  const key = stageKey(world, stage)
  const cfg = getStageConfig(world, stage)

  profile.stats.runs += 1
  profile.stats.distance += Math.round(distance)
  profile.stats.coinsRun += coins
  profile.coins += coins
  profile.totalCoins += coins

  const prevBest = profile.bests[key]
  if (!prevBest || score > prevBest.score) {
    profile.bests[key] = { score, distance: Math.round(distance), coins, stars }
  }

  if (cleared) {
    const prevStars = profile.stars[key] || 0
    if (stars > prevStars) profile.stars[key] = stars
    if (prevStars === 0) profile.stats.cleared += 1
    advanceProgress(profile, world, stage)
    profile.lastStage = { world, stage }
  }

  saveProfile(profile)
  return { best: profile.bests[key], newBest: !prevBest || score > prevBest.score, reward: cleared ? cfg.reward : 0 }
}

export function addCoins(profile, amount) {
  profile.coins += amount
  saveProfile(profile)
}

export function totalUpgradeLevel(profile) {
  return Object.values(profile.upgrades).reduce((a, b) => a + b, 0)
}

export function upgradeCost(type, level) {
  const def = UPGRADES[type]
  if (!def || level >= def.max) return Infinity
  return def.costs[level]
}

export function buyUpgrade(profile, type) {
  const def = UPGRADES[type]
  if (!def) return { ok: false, reason: 'unknown' }
  const level = profile.upgrades[type] || 0
  if (level >= def.max) return { ok: false, reason: 'max' }
  const cost = upgradeCost(type, level)
  if (profile.coins < cost) return { ok: false, reason: 'coins' }
  profile.coins -= cost
  profile.upgrades[type] = level + 1
  saveProfile(profile)
  return { ok: true, cost, level: level + 1 }
}

/** Loadout the run should use, derived from the player's profile. */
export function loadout(profile, cfg) {
  return {
    hearts: cfg.hearts + (profile.upgrades.heart || 0),
    magnetTime: cfg.magnetTime + (profile.upgrades.magnet || 0) * 2,
    coinValue: 1 + (profile.upgrades.value || 0) * 0.08,
  }
}

export function nextStageInfo(profile) {
  const { world, stage } = profile.next
  const cfg = getStageConfig(world, stage)
  return {
    ...cfg,
    worldName: WORLDS[world - 1]?.name || 'The Unknown',
    theme: WORLDS[world - 1],
    done: !!profile.complete,
  }
}
