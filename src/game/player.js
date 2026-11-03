import * as THREE from 'three'
import { makeGlowTexture } from './core.js'

const material = (color, roughness = 0.85, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra })

/** Builds the runner, scarf, satchel relic, blob shadow and pickup FX. */
export function buildPlayer(game) {
  const skin = material(0xd39a67, 0.75)
  const shirt = material(0x25786c, 0.8)
  const shirtDark = material(0x185a51, 0.85)
  const pants = material(0x57432f, 0.9)
  const leather = material(0x7a4b26, 0.85)
  const scarf = material(0xe0512f, 0.8)
  const hair = material(0x27170e, 0.95)
  const boot = material(0x342417, 0.95)
  const eye = new THREE.MeshBasicMaterial({ color: 0x1b1108 })
  const M = { skin, shirt, shirtDark, pants, leather, scarf, hair, boot, gold: game.materials.gold }

  game.player = new THREE.Group()
  game.player.position.set(0, 0, 0)
  game.scene.add(game.player)

  const rig = new THREE.Group()
  game.player.add(rig)
  game.rig = rig

  buildTorso(game, rig, M)
  buildHead(game, rig, M, eye)
  buildScarf(game, rig, scarf)
  buildSatchel(game, rig, leather)
  game.arms = [-1, 1].map((side) => buildArm(rig, side, M))
  game.legs = [-1, 1].map((side) => buildLeg(rig, side, M))
  buildPlayerEffects(game)
}

function buildTorso(game, rig, M) {
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.42, 4, 12), M.shirt)
  torso.position.y = 1.13
  torso.castShadow = true
  rig.add(torso)

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.11, 12), M.leather)
  belt.position.y = 0.86
  rig.add(belt)

  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.11, 0.05), M.gold)
  buckle.position.set(0, 0.86, -0.29)
  rig.add(buckle)

  const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.28, 12), M.shirtDark)
  chest.position.y = 1.34
  rig.add(chest)
}

function buildHead(game, rig, M, eye) {
  game.head = new THREE.Group()
  game.head.position.y = 1.62
  rig.add(game.head)

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.225, 16, 12), M.skin)
  skull.castShadow = true
  game.head.add(skull)

  const hairCap = new THREE.Mesh(
    new THREE.SphereGeometry(0.235, 16, 9, 0, Math.PI * 2, 0, Math.PI * 0.58),
    M.hair,
  )
  hairCap.position.y = 0.03
  hairCap.rotation.x = -0.18
  game.head.add(hairCap)

  const band = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.032, 8, 20), M.scarf)
  band.rotation.x = Math.PI / 2
  band.position.y = 0.055
  game.head.add(band)

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.11, 6), M.skin)
  nose.rotation.x = -Math.PI / 2
  nose.position.set(0, -0.02, -0.22)
  game.head.add(nose)

  for (const side of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 8), eye)
    e.position.set(side * 0.078, 0.02, -0.2)
    game.head.add(e)
  }
}

function buildScarf(game, rig, scarf) {
  game.scarfGroup = new THREE.Group()
  game.scarfGroup.position.set(0, 1.45, 0.16)
  rig.add(game.scarfGroup)

  game.scarfLinks = []
  for (let i = 0; i < 4; i++) {
    const link = new THREE.Mesh(new THREE.BoxGeometry(0.16 - i * 0.022, 0.05, 0.2), scarf)
    link.position.set(0, -i * 0.035, 0.12 + i * 0.17)
    link.rotation.x = -0.1 * i
    game.scarfGroup.add(link)
    game.scarfLinks.push(link)
  }
}

function buildSatchel(game, rig, leather) {
  const bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.44, 0.24), leather)
  bag.position.set(0, 1.16, 0.29)
  bag.rotation.x = 0.08
  bag.castShadow = true
  rig.add(bag)

  const strap = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.5, 0.06), game.materials.gold)
  strap.position.set(0.16, 1.28, 0.06)
  strap.rotation.z = 0.5
  rig.add(strap)

  game.relic = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), game.materials.gold)
  game.relic.position.set(0, 1.44, 0.33)
  rig.add(game.relic)
}

function buildArm(rig, side, M) {
  const group = new THREE.Group()
  group.position.set(side * 0.34, 1.38, 0)
  rig.add(group)

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.3, 4, 8), M.shirt)
  upper.position.y = -0.19
  upper.castShadow = true
  group.add(upper)

  const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.24, 4, 8), M.skin)
  fore.position.y = -0.47
  group.add(fore)

  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), M.skin)
  hand.position.y = -0.63
  group.add(hand)

  const wristband = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.05, 8), M.scarf)
  wristband.position.y = -0.55
  group.add(wristband)
  return group
}

function buildLeg(rig, side, M) {
  const group = new THREE.Group()
  group.position.set(side * 0.15, 0.82, 0)
  rig.add(group)

  const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 4, 8), M.pants)
  thigh.position.y = -0.24
  thigh.castShadow = true
  group.add(thigh)

  const shin = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), M.pants)
  shin.position.y = -0.55
  group.add(shin)

  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.13, 0.32), M.boot)
  foot.position.set(0, -0.74, -0.06)
  foot.castShadow = true
  group.add(foot)

  const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.07, 8), M.scarf)
  wrap.position.y = -0.66
  group.add(wrap)
  return group
}

function buildPlayerEffects(game) {
  const blobTex = makeGlowTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)')
  game.blob = new THREE.Mesh(
    new THREE.PlaneGeometry(1.5, 1.5),
    new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.5, depthWrite: false }),
  )
  game.blob.rotation.x = -Math.PI / 2
  game.blob.position.y = 0.02
  game.scene.add(game.blob)

  game.shieldMesh = new THREE.Mesh(
    new THREE.SphereGeometry(1.05, 20, 14),
    new THREE.MeshBasicMaterial({
      color: 0x69f6ff,
      transparent: true,
      opacity: 0.15,
      wireframe: true,
      depthWrite: false,
    }),
  )
  game.shieldMesh.position.y = 1.05
  game.shieldMesh.visible = false
  game.player.add(game.shieldMesh)

  game.magnetRingGroup = new THREE.Group()
  game.magnetRingGroup.position.y = 1.05
  game.magnetRingGroup.visible = false
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.0 + i * 0.12, 0.02, 6, 40),
      new THREE.MeshBasicMaterial({
        color: 0xc084ff,
        transparent: true,
        opacity: 0.65 - i * 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    )
    ring.rotation.x = Math.PI / 2 + i * 0.12
    ring.rotation.y = i * 0.7
    game.magnetRingGroup.add(ring)
  }
  game.player.add(game.magnetRingGroup)

  Object.assign(game, {
    playerY: 0,
    vy: 0,
    grounded: true,
    slideAmt: 0,
    sliding: 0,
    runPhase: 0,
    laneIndex: 1,
    playerX: 0,
    lean: 0,
    stumble: 0,
    invuln: 0,
  })
  game.player.position.y = 0
}
