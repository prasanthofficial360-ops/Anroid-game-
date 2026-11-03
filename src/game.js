import * as THREE from 'three'
import {
  CHUNK_COUNT,
  CHUNK_LEN,
  GRAVITY,
  JUMP_V,
  LANE_X,
  PLAYER_H,
  SLIDE_H,
  START_Z,
  clamp,
  damp,
  lerp,
  pick,
  rand,
  randInt,
  shuffle,
} from './game/core.js'
import { buildScenery } from './game/scenery.js'
import { buildGate, buildTrack, initTrack } from './game/track.js'
import { buildPlayer } from './game/player.js'
import { createPropMesh } from './game/props.js'
import { applyTheme } from './game/theme.js'

// ─────────────────────────────────────────────────────────────
//  TEMPLE RUN 3D — game engine
//  Three lanes, jump, slide, coins, relics, one chasing camera.
// ─────────────────────────────────────────────────────────────

export class TempleGame {
  constructor(canvas, callbacks = {}) {
    this.canvas = canvas
    this.cb = callbacks
    this.state = 'attract'
    this.theme = null
    this.time = 0
    this.lastHud = 0
    this.active = []
    this.pool = { coin: [], hurdle: [], beam: [], blocker: [], magnet: [], shield: [] }
    this.chunks = []
    this.flames = []
    this.gate = null
    this.resultSent = false
    this.guide = null

    this.initRenderer()
    buildScenery(this)
    this.initMaterials()
    initTrack(this)
    buildPlayer(this)
    this.bindInput()

    this.loop = this.loop.bind(this)
    this.clock = new THREE.Clock()
    window.addEventListener('resize', () => this.resize())
    this.resize()
    requestAnimationFrame(this.loop)
  }

  initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.02
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.quality = 'high'
  }

  initMaterials() {
    this.materials = {
      floor: new THREE.MeshStandardMaterial({ color: 0xa9835b, roughness: 0.94, metalness: 0.06 }),
      stone: new THREE.MeshStandardMaterial({ color: 0x9a7a55, roughness: 0.9, metalness: 0.04 }),
      stoneDark: new THREE.MeshStandardMaterial({ color: 0x6b4f34, roughness: 0.95, metalness: 0.03 }),
      gold: new THREE.MeshStandardMaterial({
        color: 0xffc94d,
        roughness: 0.34,
        metalness: 0.85,
        emissive: 0x4a2c00,
        emissiveIntensity: 0.5,
      }),
      wood: new THREE.MeshStandardMaterial({ color: 0x4d3520, roughness: 0.95 }),
      foliage: new THREE.MeshStandardMaterial({ color: 0x3f7d3a, roughness: 0.9 }),
      foliage2: new THREE.MeshStandardMaterial({ color: 0x2e5e2c, roughness: 0.9 }),
      banner: new THREE.MeshStandardMaterial({
        color: 0xff7a3c,
        roughness: 0.8,
        side: THREE.DoubleSide,
        emissive: 0x4a1200,
        emissiveIntensity: 0.25,
      }),
      flame: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
      glow: new THREE.SpriteMaterial({
        map: this.glowTex,
        color: 0xffc45c,
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    }

    this.coinMat = new THREE.MeshStandardMaterial({
      color: 0xffcf4a,
      roughness: 0.24,
      metalness: 0.9,
      emissive: 0xff9a00,
      emissiveIntensity: 0.42,
    })
    this.magnetMat = new THREE.MeshStandardMaterial({
      color: 0xb07bff,
      roughness: 0.3,
      metalness: 0.6,
      emissive: 0x7a2bff,
      emissiveIntensity: 1.2,
    })
    this.shieldMat = new THREE.MeshStandardMaterial({
      color: 0x59f2ff,
      roughness: 0.2,
      metalness: 0.4,
      emissive: 0x0f9fb8,
      emissiveIntensity: 1.1,
      transparent: true,
      opacity: 0.9,
    })
  }

  setTheme(theme) {
    applyTheme(this, theme)
  }

  setQuality(quality) {
    this.quality = quality
    const ratio = quality === 'high' ? 1.75 : quality === 'low' ? 1 : 1.35
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, ratio))
    const shadows = quality !== 'low'
    this.renderer.shadowMap.enabled = shadows
    this.sunLight.castShadow = shadows
    if (shadows) {
      const size = quality === 'high' ? 2048 : 1024
      this.sunLight.shadow.mapSize.set(size, size)
      this.sunLight.shadow.map?.dispose()
      this.sunLight.shadow.map = null
    }
    this.materials.floor.needsUpdate = true
    this.resize()
  }

  // ── run lifecycle ──────────────────────────────────────────
  enterAttract(theme) {
    this.setTheme(theme)
    this.clearDynamic()
    this.resetTrackPosition()
    this.state = 'attract'
    this.speed = 4.2
    this.attractT = 0
    this.player.position.set(0, 0, 0)
    this.playerX = 0
    this.laneIndex = 1
    this.playerY = 0
    this.vy = 0
    this.grounded = true
    this.sliding = 0
    this.slideAmt = 0
    this.rig.rotation.set(0, 0, 0)
    this.shieldMesh.visible = false
    this.magnetRingGroup.visible = false
    this.magnetTime = 0
    this.shield = false
    this.finishGateZ = null
    this.guide = null
  }

  resetTrackPosition() {
    this.chunks.forEach((group, i) => {
      group.position.z = START_Z - i * CHUNK_LEN
    })
  }

  start({ theme, config, loadout, worldName }) {
    this.setTheme(theme)
    this.clearDynamic()
    this.resetTrackPosition()

    this.cfg = config
    this.worldName = worldName || ''
    this.state = 'ready'
    this.readyT = 0
    this.readyTime = 0.95
    this.distance = 0
    this.elapsed = 0
    this.coinScore = 0
    this.coinCount = 0
    this.hits = 0
    this.score = 0
    this.speed = config.startSpeed * 0.45
    this.targetSpeed = config.startSpeed
    this.finishGateZ = null
    this.gateSpawned = false
    this.resultSent = false

    this.maxHearts = loadout.hearts
    this.hearts = loadout.hearts
    this.magnetMax = loadout.magnetTime
    this.magnetTime = 0
    this.shield = false
    this.coinValue = loadout.coinValue || 1
    this.invuln = 0
    this.stumble = 0
    this.playerY = 0
    this.vy = 0
    this.grounded = true
    this.sliding = 0
    this.slideAmt = 0
    this.laneIndex = 1
    this.playerX = 0
    this.player.position.set(0, 0, 0)
    this.player.rotation.set(0, 0, 0)
    this.rig.rotation.set(0, 0, 0)
    this.rig.position.set(0, 0, 0)
    this.player.visible = true
    this.shake = 0
    this.camX = 0
    this.hitFlash = 0
    this.shieldMesh.visible = false
    this.magnetRingGroup.visible = false
    this.spawnClock = 0
    this.lastSpawnZ = -58
    this.rowCounter = 0
    this.laneCooldown = 0
    this.guide = null
    if (this.gate) this.gate.visible = false
    this.emitHud(true)
  }

  pause() {
    if (this.state === 'running' || this.state === 'ready') {
      this.prevState = this.state
      this.state = 'paused'
    }
  }

  resume() {
    if (this.state !== 'paused') return
    this.state = this.prevState || 'running'
    this.clock.getDelta()
  }

  quit() {
    this.state = 'attract'
    this.guide = null
    this.clearDynamic()
    this.resetTrackPosition()
  }

  clearDynamic() {
    for (const item of this.active) this.release(item)
    this.active.length = 0
    if (this.gate) this.gate.visible = false
    this.finishGateZ = null
  }

  release(item) {
    item.mesh.visible = false
    this.pool[item.kind]?.push(item.mesh)
  }

  // ── dynamic objects ────────────────────────────────────────
  acquire(kind) {
    let mesh = this.pool[kind].pop()
    if (!mesh) {
      mesh = createPropMesh(this, kind)
      this.dynamicGroup.add(mesh)
    }
    mesh.visible = true
    mesh.scale.setScalar(1)
    return mesh
  }

  spawnCoin(x, y, z, kind = 'coin') {
    const mesh = this.acquire(kind)
    mesh.position.set(x, y, z)
    mesh.rotation.set(0, rand(0, Math.PI), 0)
    this.active.push({
      kind,
      mesh,
      x,
      y,
      z,
      baseY: y,
      spin: rand(0.8, 1.6),
      phase: rand(0, Math.PI * 2),
      collected: false,
      isCoin: kind === 'coin',
    })
  }

  spawnObstacle(kind, lane, z) {
    const mesh = this.acquire(kind)
    mesh.position.set(LANE_X[lane], 0, z)
    this.active.push({
      kind,
      mesh,
      x: LANE_X[lane],
      y: 0,
      z,
      lane,
      hit: false,
      collider: mesh.userData.collider,
    })
  }

  spawnPowerup(kind, lane, z) {
    const mesh = this.acquire(kind)
    mesh.position.set(LANE_X[lane], 1.25, z)
    this.active.push({
      kind,
      mesh,
      x: LANE_X[lane],
      y: 1.25,
      z,
      spin: 1.9,
      phase: rand(0, Math.PI * 2),
      collected: false,
      isPowerup: true,
    })
  }

  coinRun(x, y, z, count, spacing, arc = 0) {
    for (let i = 0; i < count; i++) {
      const t = count > 1 ? i / (count - 1) : 0
      this.spawnCoin(x, y + Math.sin(t * Math.PI) * arc, z - i * spacing)
    }
  }

  spawnRow() {
    const z = this.lastSpawnZ
    const diff = this.cfg.difficulty
    const roll = Math.random()
    let type = 'coins'
    if (this.rowCounter >= 2) {
      if (roll < 0.34) type = 'hurdle'
      else if (roll < 0.6) type = 'beam'
      else if (roll < 0.87) type = 'blocker'
    }

    const lanes = [0, 1, 2]
    let blocked = []

    if (type === 'hurdle') {
      const count = Math.random() < 0.22 + diff * 0.45 ? 3 : Math.random() < 0.5 ? 2 : 1
      blocked = shuffle(lanes).slice(0, count)
      blocked.forEach((lane) => this.spawnObstacle('hurdle', lane, z))
      this.coinRun(LANE_X[blocked[0]], 1.05, z + 3.2, 5, 1.6, 1.15)

      if (Math.random() < 0.5) {
        const free = lanes.filter((lane) => !blocked.includes(lane))
        if (free.length) this.coinRun(LANE_X[pick(free)], 1.0, z + 5, 4, 1.8)
      }
    } else if (type === 'beam') {
      const count = Math.random() < 0.16 + diff * 0.35 ? 3 : Math.random() < 0.5 ? 2 : 1
      blocked = shuffle(lanes).slice(0, count)
      blocked.forEach((lane) => this.spawnObstacle('beam', lane, z))
      const free = lanes.filter((lane) => !blocked.includes(lane))
      this.coinRun(LANE_X[free.length ? pick(free) : pick(blocked)], 0.58, z + 5.2, 5, 1.5)
    } else if (type === 'blocker') {
      const count = diff > 0.3 && Math.random() < 0.3 + diff * 0.4 ? 2 : 1
      blocked = shuffle(lanes).slice(0, count)
      blocked.forEach((lane) => this.spawnObstacle('blocker', lane, z))
      const free = lanes.filter((lane) => !blocked.includes(lane))
      const lane = pick(free)
      this.coinRun(LANE_X[lane], 1.0, z + 6.4, 7, 1.7)

      if (free.length > 1 && Math.random() < 0.4) {
        const second = free.find((n) => n !== lane)
        this.coinRun(LANE_X[second], 1.0, z + 4, 4, 1.6)
      }
    } else {
      let lane = randInt(0, 2)
      for (let i = 0; i < 7; i++) {
        this.spawnCoin(LANE_X[lane], 1.0, z + 6 - i * 1.65)
        if (Math.random() < 0.24) lane = clamp(lane + pick([-1, 1]), 0, 2)
      }
    }

    if (Math.random() < 0.095) {
      const free = type === 'coins' ? lanes : lanes.filter((lane) => !blocked.includes(lane))
      this.spawnPowerup(Math.random() < 0.52 ? 'magnet' : 'shield', free.length ? pick(free) : 1, z - 3)
    }

    this.rowCounter++
  }

  // ── loop ───────────────────────────────────────────────────
  loop() {
    requestAnimationFrame(this.loop)
    const dt = Math.min(this.clock.getDelta(), 0.05)
    if (this.state === 'paused') {
      this.renderer.render(this.scene, this.camera)
      return
    }
    this.time += dt
    this.update(dt)
    this.renderer.render(this.scene, this.camera)
  }

  update(dt) {
    const state = this.state

    if (state === 'running') {
      this.elapsed += dt
      this.targetSpeed = Math.min(this.cfg.maxSpeed, this.cfg.startSpeed + this.elapsed * this.cfg.ramp * 0.55)
      if (this.stumble > 0) {
        this.stumble -= dt
        this.speed = damp(this.speed, this.targetSpeed * 0.55, 6, dt)
      } else {
        this.speed = damp(this.speed, this.targetSpeed, 2.2, dt)
      }
      this.distance += this.speed * dt
    } else if (state === 'attract') {
      this.attractT += dt
      this.speed = 4.2
    } else if (state === 'ready') {
      this.readyT += dt
      this.runPhase += dt * 8
      if (this.readyT >= this.readyTime) {
        this.state = 'running'
        this.cb.onGo?.()
      }
    } else if (state === 'dying' || state === 'finished') {
      this.speed = damp(this.speed, 2, 2, dt)
      if (state === 'dying') {
        this.deathT += dt
        this.rig.rotation.x += dt * 5
        this.rig.rotation.z += dt * 2
        if (this.deathT > 1.25) this.sendResult(false)
      } else {
        this.finishT += dt
        if (this.finishT > 0.7) this.sendResult(true)
      }
    }

    if (state !== 'ready' || this.readyT > 0.1) {
      const move = this.speed * dt
      for (const group of this.chunks) {
        group.position.z += move
        if (group.position.z > START_Z + CHUNK_LEN * 1.4) group.position.z -= CHUNK_LEN * CHUNK_COUNT
      }
    }

    this.updateDust(dt)
    this.updateFlames()
    this.updatePlayer(dt)
    this.updateCamera(dt)
    this.animateDecor(dt)

    if (state === 'running') {
      this.updateSpawning(dt)
      this.updateItems(dt)
      this.updateGuide()
      this.checkFinish()
      this.emitHud(false)
    } else if (state === 'attract') {
      this.guide = null
      this.updateItems(dt)
    } else {
      this.guide = null
    }
  }

  sendResult(cleared) {
    if (this.resultSent) return
    this.resultSent = true
    if (cleared) this.cb.onFinish?.(this.result())
    else this.cb.onFail?.(this.result())
  }

  updateDust(dt) {
    const positions = this.dust.geometry.attributes.position
    const move = this.speed * dt
    for (let i = 0; i < positions.count; i++) {
      let z = positions.getZ(i) + move * 0.85
      if (z > 12) z -= 132
      let x = positions.getX(i) + Math.sin(this.time * 0.5 + this.dustSeeds[i]) * dt * 0.35
      if (x > 22) x = -22
      if (x < -22) x = 22
      positions.setZ(i, z)
      positions.setX(i, x)
    }
    positions.needsUpdate = true
  }

  updateFlames() {
    for (const flame of this.flames) {
      if (!flame.parent?.visible) continue
      const scale = 1 + Math.sin(this.time * 12 + flame.userData.phase) * 0.18
      flame.scale.set(scale, 1.4 + scale * 0.15, scale)
    }
  }

  animateDecor(dt) {
    if (this.gate?.visible) {
      this.gatePortal.material.opacity = 0.35 + Math.sin(this.time * 3) * 0.12
      this.gate.rotation.z = Math.sin(this.time * 1.2) * 0.01
    }
    this.relic.rotation.y += dt * 1.8
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += dt * 0.8
      this.shieldMesh.material.opacity = 0.11 + Math.sin(this.time * 4) * 0.05
    }
    if (this.magnetRingGroup.visible) {
      this.magnetRingGroup.rotation.y += dt * 2.2
      this.magnetRingGroup.children.forEach((ring, i) => {
        ring.rotation.z = this.time * (0.8 + i * 0.2)
      })
    }
  }

  updatePlayer(dt) {
    const targetX = LANE_X[this.laneIndex]
    this.playerX = damp(this.playerX, targetX, 15, dt)
    this.lean = damp(this.lean, clamp((targetX - this.playerX) * 0.4, -0.32, 0.32), 10, dt)
    this.player.position.x = this.playerX

    if (this.state === 'running') this.runPhase += dt * (this.grounded ? 7.5 + this.speed * 0.34 : 3)
    else if (this.state === 'attract') this.runPhase += dt * 9.5

    this.player.visible = this.invuln <= 0 || Math.floor(this.time * 18) % 2 === 0

    if (this.state === 'running' || this.state === 'ready' || this.state === 'dying') {
      if (!this.grounded) {
        this.vy += GRAVITY * dt
        this.playerY += this.vy * dt
        if (this.playerY <= 0) {
          this.playerY = 0
          this.vy = 0
          this.grounded = true
          this.landPulse = 0.14
          this.cb.onLand?.()
        }
      }
      if (this.landPulse > 0) this.landPulse -= dt
    }

    if (this.state === 'finished') this.playerY = Math.abs(Math.sin(this.finishT * 3.6)) * 0.3

    if (this.sliding > 0) this.sliding = Math.max(0, this.sliding - dt)
    this.slideAmt = damp(this.slideAmt, this.sliding > 0 ? 1 : 0, 18, dt)

    this.player.position.y = this.playerY

    const slide = this.slideAmt
    const run = this.runPhase
    const grounded = this.grounded && this.state === 'running'
    const jumping = !this.grounded && (this.state === 'running' || this.state === 'ready')
    const idle = this.state === 'attract'
    const bob = grounded || idle ? Math.abs(Math.sin(run)) * 0.055 : 0
    const breathe = idle ? Math.sin(this.time * 2) * 0.01 : 0
    const legSwing = grounded ? Math.sin(run) * 0.92 : jumping ? 0.5 : 0
    const armSwing = grounded ? Math.sin(run + Math.PI) * 0.72 : jumping ? -1.5 : 0.1

    this.legs.forEach((leg, i) => {
      const dir = i === 0 ? 1 : -1
      const target = lerp(legSwing * dir, -1.35, slide)
      leg.rotation.x = damp(leg.rotation.x, target + (jumping ? -0.5 : 0), 18, dt)
      leg.rotation.z = damp(leg.rotation.z, slide * 0.06 * dir, 14, dt)
    })

    this.arms.forEach((arm, i) => {
      const dir = i === 0 ? 1 : -1
      const finishPose = -2.5 + Math.sin(this.finishT * 6 + i) * 0.12
      const target = this.state === 'finished' ? finishPose : lerp(armSwing * dir, 0.5, slide)
      arm.rotation.x = damp(arm.rotation.x, target + (jumping ? -0.6 : 0), 16, dt)
      arm.rotation.z = damp(arm.rotation.z, (i === 0 ? -1 : 1) * 0.1 + slide * 0.5, 12, dt)
    })

    this.rig.rotation.x = damp(this.rig.rotation.x, lerp(-0.13, 1.32, slide), 12, dt)
    this.rig.rotation.z = damp(
      this.rig.rotation.z,
      this.lean + (this.stumble > 0 ? Math.sin(this.time * 24) * 0.18 : 0),
      10,
      dt,
    )
    this.rig.rotation.y = damp(this.rig.rotation.y, -this.lean * 0.8, 8, dt)
    this.rig.position.y = damp(this.rig.position.y, bob + breathe - slide * 0.62, 20, dt)
    this.head.rotation.y = damp(this.head.rotation.y, -this.lean * 0.4, 8, dt)

    this.scarfLinks.forEach((link, i) => {
      link.rotation.x = -0.12 - i * 0.06 + Math.sin(run * 0.9 + i * 0.7) * 0.16
      link.position.x = Math.sin(run * 0.8 + i * 0.6) * 0.04 * (i + 1)
    })

    this.blob.position.set(this.playerX, 0.03, 0)
    const heightFactor = clamp(1 - this.playerY / 4, 0.2, 1)
    this.blob.material.opacity = 0.45 * heightFactor
    this.blob.scale.setScalar(lerp(1, 0.7, 1 - heightFactor))

    this.shieldMesh.visible = this.shield
    this.magnetRingGroup.visible = this.magnetTime > 0
    if (this.shield) this.shieldMesh.rotation.x = this.time * 0.4

    if (this.state === 'running') {
      this.magnetTime = Math.max(0, this.magnetTime - dt)
      this.invuln = Math.max(0, this.invuln - dt)
    }
  }

  updateCamera(dt) {
    const state = this.state

    if (state === 'attract') {
      const t = this.attractT
      this.camX = Math.sin(t * 0.18) * 2.6
      this.camera.position.set(this.camX, 4.6 + Math.sin(t * 0.24) * 0.35, 10.4 + Math.sin(t * 0.15) * 0.6)
      this.camera.lookAt(Math.sin(t * 0.1) * 0.6, 2.1, -18)
      return
    }

    this.shake = this.shake > 0.001 ? this.shake * Math.exp(-dt * 5.5) : 0
    const shakeX = (Math.random() - 0.5) * this.shake * 0.5
    const shakeY = (Math.random() - 0.5) * this.shake * 0.4

    if (state === 'dying') {
      this.camX = damp(this.camX, this.playerX * 0.4, 3, dt)
      this.camera.position.set(
        this.camX + shakeX,
        damp(this.camera.position.y, 5.6, 2, dt) + shakeY,
        damp(this.camera.position.z, 11.5, 2, dt),
      )
      this.camera.lookAt(this.playerX, 0.9, 0)
      return
    }

    if (state === 'finished') {
      const t = this.finishT
      this.camera.position.set(Math.sin(t * 0.8) * 4.2, 3.1 + Math.sin(t * 1.4) * 0.1, 5.2)
      this.camera.lookAt(0, 1.4, 0)
      return
    }

    this.camX = damp(this.camX, this.playerX * 0.55, 7, dt)
    this.camY = damp(this.camY, 4.55 + this.playerY * 0.2, 6, dt)
    const speedT = clamp((this.speed - (this.cfg?.startSpeed || 15)) / 10, 0, 1)
    this.camera.position.set(
      this.camX + shakeX,
      this.camY + shakeY,
      damp(this.camera.position.z, 9.3 + speedT * 0.7, 4, dt),
    )
    this.camera.lookAt(this.playerX * 0.38, 1.7 + this.playerY * 0.35, -17)

    this.fov = damp(this.fov, 59 + speedT * 5 + (this.magnetTime > 0 ? 1.5 : 0), 3, dt)
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
    this.rig.rotation.z += this.shake * 0.001
  }

  updateSpawning(dt) {
    if (this.gateSpawned) return
    this.lastSpawnZ += this.speed * dt
    const gapBase = Math.max(9.5, this.speed * (0.86 - this.cfg.difficulty * 0.26))
    while (this.lastSpawnZ > -150) {
      this.spawnRow()
      this.lastSpawnZ -= gapBase + rand(-1.2, 2.8)
    }
    if (this.distance >= this.cfg.distance - 45) this.spawnGate()
  }

  updateItems(dt) {
    const move = this.speed * dt
    const magnet = this.magnetTime > 0
    const playerX = this.playerX
    const playerY = this.playerY + (this.slideAmt > 0.5 ? 0.5 : 1.0)
    const magnetRange = this.state === 'running' ? 8 : 0

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]
      item.z += move
      item.mesh.position.z = item.z

      if (item.kind === 'coin') {
        item.mesh.rotation.y += dt * item.spin * 2
        item.mesh.position.y = item.baseY + Math.sin(this.time * 3 + item.phase) * 0.055

        if (magnet && this.state === 'running' && !item.collected) {
          const dx = playerX - item.mesh.position.x
          const dy = playerY - item.mesh.position.y
          const d2 = dx * dx + dy * dy + item.z * item.z
          if (d2 < magnetRange * magnetRange) {
            const pull = 1 - Math.exp(-dt * 7)
            item.mesh.position.x += dx * pull
            item.mesh.position.y += dy * pull
            item.z -= item.z * pull
            item.mesh.position.z = item.z
          }
        }

        if (
          !item.collected &&
          Math.abs(item.z) < 1.1 &&
          Math.abs(playerX - item.mesh.position.x) < 0.95 &&
          Math.abs(playerY - item.mesh.position.y) < 1.15
        ) {
          this.collectCoin(item)
          item.collected = true
        }
      } else if (item.isPowerup) {
        item.mesh.rotation.y += dt * item.spin
        item.mesh.position.y = item.y + Math.sin(this.time * 2.4 + item.phase) * 0.16
        if (
          !item.collected &&
          this.state === 'running' &&
          Math.abs(item.z) < 1.25 &&
          Math.abs(playerX - item.mesh.position.x) < 1.15 &&
          Math.abs(playerY - item.mesh.position.y) < 1.35
        ) {
          this.collectPowerup(item)
          item.collected = true
        }
      } else if (!item.hit && this.state === 'running' && Math.abs(item.z) < 1.05 && this.invuln <= 0) {
        const collider = item.collider
        if (Math.abs(playerX - item.x) < collider.hx + 0.32 && item.z > -0.85 && item.z < 0.9) {
          const playerTop = playerY - (this.slideAmt > 0.5 ? 0.5 : 1.0) + (this.slideAmt > 0.5 ? SLIDE_H : PLAYER_H)
          const overlap =
            item.kind === 'hurdle'
              ? this.playerY < collider.y1 - 0.06
              : item.kind === 'beam'
                ? playerTop > collider.y0 + 0.02
                : true
          if (overlap) this.takeHit(item)
        }
      }

      if (item.collected || item.z > 16) {
        this.release(item)
        this.active.splice(i, 1)
      }
    }

    if (this.gate?.visible) {
      this.finishGateZ += move
      this.gate.position.z = this.finishGateZ
    }
  }

  // ── guidance ───────────────────────────────────────────────
  laneBlocked(lane, z) {
    for (const item of this.active) {
      if (item.isCoin || item.isPowerup || item.hit) continue
      if (item.lane !== lane) continue
      if (Math.abs(item.z - z) < 2.4) return true
    }
    return false
  }

  coinDensity(lane, z) {
    let score = 0
    for (const item of this.active) {
      if (!item.isCoin || item.collected) continue
      if (item.z > z + 2 || item.z < z - 12) continue
      if (Math.abs(item.mesh.position.x - LANE_X[lane]) < 0.75) score++
    }
    return score
  }

  updateGuide() {
    let nearest = null
    for (const item of this.active) {
      if (item.isCoin || item.isPowerup || item.hit) continue
      if (item.z > -1.2 || item.z < -34) continue
      if (!nearest || item.z > nearest.z) nearest = item
    }
    if (!nearest) {
      this.guide = null
      return
    }

    const distance = Math.max(1, Math.round(-nearest.z))
    if (nearest.lane !== this.laneIndex) {
      this.guide = null
      return
    }

    let guide = null
    if (nearest.kind === 'hurdle') {
      guide = { action: 'jump', dir: 'up', label: 'JUMP', hint: 'Low hurdle ahead' }
    } else if (nearest.kind === 'beam') {
      guide = { action: 'slide', dir: 'down', label: 'SLIDE', hint: 'Duck under the beam' }
    } else {
      const candidates = [this.laneIndex - 1, this.laneIndex + 1].filter((lane) => lane >= 0 && lane <= 2)
      const free = candidates.filter((lane) => !this.laneBlocked(lane, nearest.z))
      if (!free.length) {
        this.guide = null
        return
      }
      free.sort((a, b) => this.coinDensity(b, nearest.z) - this.coinDensity(a, nearest.z))
      const target = free[0]
      const left = target < this.laneIndex
      guide = {
        action: left ? 'left' : 'right',
        dir: left ? 'left' : 'right',
        label: left ? 'MOVE LEFT' : 'MOVE RIGHT',
        hint: 'Blocked lane — dodge across',
      }
    }

    guide.distance = distance
    guide.urgent = distance <= 7
    guide.lane = nearest.lane
    this.guide = guide
  }

  collectCoin(item) {
    this.coinCount++
    this.coinScore += this.coinValue
    this.cb.onCoin?.({ count: this.coinCount, value: this.coinScore })
  }

  collectPowerup(item) {
    if (item.kind === 'magnet') {
      this.magnetTime = this.magnetMax
      this.cb.onPowerup?.('magnet')
    } else {
      this.shield = true
      this.cb.onPowerup?.('shield')
    }
    this.cb.onPickupSound?.(item.kind)
  }

  takeHit(item) {
    item.hit = true
    if (this.shield) {
      this.shield = false
      this.invuln = 1.15
      this.shake = 0.55
      this.cb.onShieldBreak?.()
      this.cb.onHit?.({ shield: true })
      return
    }

    this.hearts -= 1
    this.hits += 1
    this.shake = 1
    this.stumble = 1.1
    this.invuln = 1.45
    this.magnetTime = 0
    this.cb.onHit?.({ shield: false, hearts: this.hearts })

    if (this.hearts <= 0) {
      this.state = 'dying'
      this.deathT = 0
      this.resultSent = false
      this.vy = Math.max(this.vy, 8)
      this.grounded = false
    }
  }

  checkFinish() {
    if (this.finishGateZ !== null && this.finishGateZ > 0.8) this.finish()
  }

  finish() {
    if (this.state !== 'running') return
    this.state = 'finished'
    this.finishT = 0
    this.resultSent = false
    this.cb.onFinishSound?.()
    this.cb.onFinishCue?.()
  }

  result() {
    const stars = this.computeStars()
    this.score = Math.floor(this.distance) * 10 + Math.floor(this.coinScore) * 25 + stars * 250
    return {
      cleared: this.state === 'finished',
      distance: Math.floor(this.distance),
      target: this.cfg.distance,
      coins: Math.floor(this.coinScore),
      coinCount: this.coinCount,
      coinGoal: this.cfg.coinGoal,
      hearts: Math.max(0, this.hearts),
      maxHearts: this.maxHearts,
      hits: this.hits,
      stars,
      score: this.score,
      time: this.elapsed,
      config: this.cfg,
      magnetTime: this.magnetTime,
    }
  }

  computeStars() {
    if (this.state !== 'finished') return 0
    let stars = 1
    if (Math.floor(this.coinScore) >= this.cfg.coinGoal) stars++
    if (this.hits === 0) stars++
    return stars
  }

  emitHud(force) {
    if (!force && this.time - this.lastHud < 0.055) return
    this.lastHud = this.time
    this.cb.onHud?.({
      state: this.state,
      distance: Math.floor(this.distance || 0),
      target: this.cfg?.distance || 0,
      coins: Math.floor(this.coinScore || 0),
      coinCount: this.coinCount || 0,
      coinGoal: this.cfg?.coinGoal || 0,
      hearts: Math.max(0, this.hearts ?? 0),
      maxHearts: this.maxHearts || 2,
      hits: this.hits || 0,
      speed: this.speed || 0,
      magnet: this.magnetTime || 0,
      magnetMax: this.magnetMax || 0,
      shield: !!this.shield,
      lane: this.laneIndex,
      guide: this.guide,
      time: this.elapsed || 0,
      score: this.score || 0,
      starHints: {
        cleared: this.state === 'finished',
        coins: (this.coinScore || 0) >= (this.cfg?.coinGoal || 0),
        clean: (this.hits || 0) === 0,
      },
    })
  }

  // ── finish gate ────────────────────────────────────────────
  spawnGate() {
    if (!this.gate) buildGate(this)
    this.gate.visible = true
    this.finishGateZ = -42
    this.gate.position.z = this.finishGateZ
    this.gateSpawned = true

    for (let i = this.active.length - 1; i >= 0; i--) {
      const item = this.active[i]
      if (!item.isCoin && !item.isPowerup && item.z < this.finishGateZ - 3) {
        this.release(item)
        this.active.splice(i, 1)
      }
    }
  }

  // ── input ──────────────────────────────────────────────────
  bindInput() {
    this.onKey = (event) => {
      if (this.state !== 'running' && this.state !== 'ready') return
      const key = event.key.toLowerCase()
      const actions = {
        arrowleft: () => this.moveLane(-1),
        a: () => this.moveLane(-1),
        arrowright: () => this.moveLane(1),
        d: () => this.moveLane(1),
        arrowup: () => this.jump(),
        w: () => this.jump(),
        ' ': () => this.jump(),
        arrowdown: () => this.slide(),
        s: () => this.slide(),
      }
      const action = actions[key]
      if (action) {
        action()
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', this.onKey)
  }

  moveLane(dir) {
    if (this.state !== 'running' && this.state !== 'ready') return
    const next = clamp(this.laneIndex + dir, 0, 2)
    if (next === this.laneIndex) {
      this.cb.onEdge?.()
      return
    }
    this.laneIndex = next
    this.cb.onLane?.()
  }

  jump() {
    if (this.state !== 'running' && this.state !== 'ready') return
    if (this.sliding > 0) this.sliding = 0
    if (!this.grounded) return
    this.vy = JUMP_V
    this.grounded = false
    this.playerY = 0.01
    this.cb.onJump?.()
  }

  slide() {
    if (this.state !== 'running' && this.state !== 'ready') return
    if (this.grounded) {
      this.sliding = 0.62
    } else {
      this.vy = Math.min(this.vy, -24)
    }
    this.cb.onSlide?.()
  }

  resize() {
    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    window.removeEventListener('keydown', this.onKey)
    this.renderer.dispose()
  }
}
