import * as THREE from 'three'

// ─────────────────────────────────────────────────────────────
//  Shared constants and helpers for the temple run engine.
// ─────────────────────────────────────────────────────────────

export const LANE_X = [-2.35, 0, 2.35]
export const CHUNK_LEN = 32
export const CHUNK_COUNT = 7
export const START_Z = 20
export const PLAYER_H = 1.92
export const SLIDE_H = 0.8
export const GRAVITY = -58
export const JUMP_V = 16.6

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
export const lerp = (a, b, t) => a + (b - a) * t
export const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt))
export const rand = (a, b) => a + Math.random() * (b - a)
export const randInt = (a, b) => Math.floor(rand(a, b + 1))
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
export const shuffle = (arr) => [...arr].sort(() => Math.random() - 0.5)
export const color = (hex) => new THREE.Color(hex)

/** Soft radial sprite used for glows, dust and blob shadows. */
export function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(64, 64, 2, 64, 64, 62)
  gradient.addColorStop(0, inner)
  gradient.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  gradient.addColorStop(1, outer)
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 128, 128)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}
