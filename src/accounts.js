// Local, on-device runner profiles.
//
// There is no server in this project, so accounts live in localStorage.
// The optional 4–6 digit PIN is a convenience lock for shared devices, not
// real security — everything is stored in this browser only.

const ACCOUNTS_KEY = 'temple-run-3d.accounts.v1'
const SESSION_KEY = 'temple-run-3d.session.v1'

export const AVATARS = ['🦊', '🐯', '🦅', '🐍', '🐆', '🦁', '🐘', '🦂', '🐊', '🦉', '🐺', '🐢']

function readAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (!Array.isArray(list)) return []
    return list.filter((a) => a && typeof a.id === 'string' && typeof a.name === 'string')
  } catch {
    return []
  }
}

function writeAccounts(list) {
  try {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list))
  } catch {
    /* storage can be unavailable in private modes — the session still works */
  }
}

function pinHash(pin, salt) {
  // FNV-1a with a per-account salt. Deliberately lightweight: this only stops
  // someone casually opening the profile picker, not a determined attacker.
  let h = 2166136261
  const input = `${salt}:${pin}`
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0).toString(36)
}

export function listAccounts() {
  return readAccounts().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
}

export function getAccount(id) {
  if (!id) return null
  return readAccounts().find((a) => a.id === id) || null
}

export function getSession() {
  try {
    return localStorage.getItem(SESSION_KEY) || null
  } catch {
    return null
  }
}

export function setSession(id) {
  try {
    if (id) localStorage.setItem(SESSION_KEY, id)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    /* ignore */
  }
}

export function clearSession() {
  setSession(null)
}

export function touchAccount(id) {
  const list = readAccounts()
  const account = list.find((a) => a.id === id)
  if (!account) return null
  account.lastSeen = Date.now()
  writeAccounts(list)
  return account
}

export function validatePin(pin) {
  if (!pin) return { ok: true }
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'PIN must be 4 to 6 digits.' }
  return { ok: true }
}

export function createAccount({ name, pin = '', avatar } = {}) {
  const clean = String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
  if (clean.length < 2) return { ok: false, error: 'Enter a runner name with at least 2 characters.' }
  if (clean.length > 16) return { ok: false, error: 'Keep the runner name to 16 characters or fewer.' }

  const list = readAccounts()
  if (list.some((a) => a.name.toLowerCase() === clean.toLowerCase())) {
    return { ok: false, error: `A runner called “${clean}” already exists.` }
  }

  const pinCheck = validatePin(pin)
  if (!pinCheck.ok) return { ok: false, error: pinCheck.error }

  const id = `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`
  const account = {
    id,
    name: clean,
    avatar: AVATARS.includes(avatar) ? avatar : AVATARS[list.length % AVATARS.length],
    pinHash: pin ? pinHash(pin, id) : null,
    createdAt: Date.now(),
    lastSeen: Date.now(),
  }
  list.push(account)
  writeAccounts(list)
  setSession(id)
  return { ok: true, account }
}

export function signIn(id, pin = '') {
  const account = getAccount(id)
  if (!account) return { ok: false, error: 'That runner profile no longer exists.' }
  if (account.pinHash) {
    if (!/^\d{4,6}$/.test(String(pin || ''))) {
      return { ok: false, error: 'Enter the 4–6 digit PIN for this runner.' }
    }
    if (pinHash(String(pin), account.id) !== account.pinHash) {
      return { ok: false, error: 'That PIN is not right. Try again.' }
    }
  }
  return { ok: true, account: touchAccount(account.id) || account }
}

export function deleteAccount(id) {
  const list = readAccounts()
  const next = list.filter((a) => a.id !== id)
  writeAccounts(next)
  if (getSession() === id) clearSession()
  return next.length !== list.length
}
