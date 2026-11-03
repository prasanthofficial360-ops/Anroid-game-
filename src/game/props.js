import * as THREE from 'three'

/** Every pooled pickup / obstacle mesh, keyed by kind. */
const FACTORIES = {
  coin: buildCoin,
  hurdle: buildHurdle,
  beam: buildBeam,
  blocker: buildBlocker,
  magnet: buildMagnet,
  shield: buildShield,
}

export function createPropMesh(game, kind) {
  return (FACTORIES[kind] || buildShield)(game)
}

function glowSprite(game, color, opacity, size) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: game.glowTex,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  sprite.scale.set(size, size, 1)
  return sprite
}

function buildCoin(game) {
  const group = new THREE.Group()

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.08, 18), game.coinMat)
  disc.rotation.x = Math.PI / 2
  disc.castShadow = true
  group.add(disc)

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.045, 6, 18), game.coinMat)
  group.add(ring)
  group.add(glowSprite(game, 0xffc94d, 0.5, 1.5))
  return group
}

function buildHurdle(game) {
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.78, 0.72), game.materials.stoneDark)
  base.position.y = 0.39
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const top = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.14, 0.82), game.materials.gold)
  top.position.y = 0.85
  top.castShadow = true
  group.add(top)

  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.9), game.materials.stone)
    foot.position.set(side * 0.6, 0.09, 0)
    group.add(foot)
  }

  group.userData.collider = { hx: 0.95, hz: 0.42, y0: 0, y1: 0.94 }
  return group
}

function buildBeam(game) {
  const group = new THREE.Group()
  const beam = new THREE.Mesh(new THREE.BoxGeometry(1.98, 0.42, 0.5), game.materials.wood)
  beam.position.y = 1.72
  beam.castShadow = true
  group.add(beam)

  const trim = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.08, 0.58), game.materials.gold)
  trim.position.y = 1.95
  group.add(trim)

  for (let i = -1; i <= 1; i++) {
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.62), game.materials.banner)
    cloth.position.set(i * 0.58, 1.34, 0.02)
    cloth.rotation.x = 0.05
    group.add(cloth)
  }

  const rune = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.04), game.materials.gold)
  rune.position.set(0, 1.7, -0.28)
  group.add(rune)

  group.userData.collider = { hx: 1.0, hz: 0.32, y0: 1.35, y1: 2.1 }
  return group
}

function buildBlocker(game) {
  const group = new THREE.Group()
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 1.25), game.materials.stoneDark)
  base.position.y = 0.2
  base.castShadow = true
  base.receiveShadow = true
  group.add(base)

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.62, 2.0, 1.0), game.materials.stone)
  body.position.y = 1.4
  body.castShadow = true
  body.receiveShadow = true
  group.add(body)

  const chestTrim = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.16, 1.06), game.materials.gold)
  chestTrim.position.y = 1.42
  group.add(chestTrim)

  const head = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.6, 0.9), game.materials.stoneDark)
  head.position.y = 2.7
  head.castShadow = true
  group.add(head)

  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.5, 4), game.materials.gold)
  crown.position.y = 3.22
  crown.rotation.y = Math.PI / 4
  group.add(crown)

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.05), new THREE.MeshBasicMaterial({ color: 0xffb347 }))
    eye.position.set(side * 0.28, 2.72, -0.47)
    group.add(eye)
  }

  group.userData.collider = { hx: 0.95, hz: 0.62, y0: 0, y1: 2.9 }
  return group
}

function buildMagnet(game) {
  const group = new THREE.Group()

  const torus = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 8, 18, Math.PI * 1.25), game.magnetMat)
  torus.rotation.z = Math.PI * 0.87
  torus.castShadow = true
  group.add(torus)

  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.24, 8), game.materials.gold)
    tip.position.set(side * 0.29, 0.34, 0)
    group.add(tip)
  }

  group.add(glowSprite(game, 0xb07bff, 0.8, 2.2))
  return group
}

function buildShield(game) {
  const group = new THREE.Group()

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), game.shieldMat)
  core.castShadow = true
  group.add(core)

  const shell = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0x8ffbff, transparent: true, opacity: 0.22, wireframe: true }),
  )
  group.add(shell)
  group.add(glowSprite(game, 0x6ff2ff, 0.8, 2.4))
  return group
}
