import * as THREE from 'three'
import { CHUNK_COUNT, CHUNK_LEN, START_Z, rand } from './core.js'

/** Creates the reusable geometry, the chunk groups and the first track. */
export function initTrack(game) {
  game.floorGeo = new THREE.BoxGeometry(10.6, 0.7, CHUNK_LEN)
  game.sideGeo = new THREE.BoxGeometry(3.2, 0.5, CHUNK_LEN)
  game.laneGeo = new THREE.BoxGeometry(0.05, 0.02, CHUNK_LEN)
  game.pillarGeo = new THREE.CylinderGeometry(0.42, 0.54, 1, 7)
  game.capGeo = new THREE.BoxGeometry(1.2, 0.26, 1.2)
  game.postGeo = new THREE.CylinderGeometry(0.09, 0.12, 1, 6)
  game.trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 1, 6)
  game.leafGeo = new THREE.ConeGeometry(1, 1, 6)

  for (let i = 0; i < CHUNK_COUNT; i++) {
    const group = new THREE.Group()
    group.userData.index = i
    game.staticGroup.add(group)
    game.chunks.push(group)
  }
  buildTrack(game)
}

export function buildTrack(game) {
  game.flames.length = 0
  game.chunks.forEach((group, i) => {
    group.clear()
    group.position.set(0, 0, START_Z - i * CHUNK_LEN)
    buildChunk(game, group, i)
  })
}

function buildChunk(game, group, index) {
  const M = game.materials

  const floor = new THREE.Mesh(game.floorGeo, M.floor)
  floor.position.y = -0.35
  floor.receiveShadow = true
  group.add(floor)

  for (const x of [-6.8, 6.8]) {
    const ledge = new THREE.Mesh(game.sideGeo, M.stoneDark)
    ledge.position.set(x, -0.5, 0)
    ledge.receiveShadow = true
    group.add(ledge)
  }

  const curbGeo = new THREE.BoxGeometry(0.24, 0.16, CHUNK_LEN)
  for (const x of [-5.15, 5.15]) {
    const curb = new THREE.Mesh(curbGeo, M.gold)
    curb.position.set(x, 0.08, 0)
    curb.receiveShadow = true
    group.add(curb)
  }

  for (const x of [-1.175, 1.175]) {
    const lane = new THREE.Mesh(game.laneGeo, M.stoneDark)
    lane.position.set(x, 0.005, 0)
    group.add(lane)
  }

  buildPillars(game, group, index)
  buildArch(game, group, index)
  buildFoliage(game, group)
  buildRubble(game, group)
}

function buildPillars(game, group, index) {
  const M = game.materials
  const dashPattern = [1, 1, 0, 1, 0, 1, 1, 0]

  for (let s = 0; s < 4; s++) {
    const z = -CHUNK_LEN / 2 + 4 + s * 8
    for (const side of [-1, 1]) {
      if (dashPattern[(s + index + (side > 0 ? 3 : 0)) % dashPattern.length] === 0) continue

      const broken = Math.random() < 0.22
      const height = broken ? rand(1.2, 2.4) : rand(4.2, 6.4)
      const x = side * rand(6.3, 7.1)
      const pillar = new THREE.Mesh(game.pillarGeo, M.stone)
      pillar.scale.y = height
      pillar.position.set(x, height / 2 - 0.2, z + rand(-0.5, 0.5))
      pillar.rotation.y = rand(0, Math.PI)
      pillar.castShadow = true
      pillar.receiveShadow = true
      group.add(pillar)

      const cap = new THREE.Mesh(game.capGeo, M.stoneDark)
      cap.position.set(x, height - 0.2, pillar.position.z)
      cap.rotation.y = pillar.rotation.y
      cap.scale.setScalar(rand(0.85, 1.2))
      cap.castShadow = true
      group.add(cap)

      if (!broken && (s + index) % 2 === 0) buildTorch(game, group, x, pillar.position.z, side)
    }
  }
}

function buildTorch(game, group, x, z, side) {
  const M = game.materials
  const post = new THREE.Mesh(game.postGeo, M.wood)
  post.scale.y = 0.9
  post.position.set(x - side * 0.75, 2.2, z)
  group.add(post)

  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.14, 0.24, 8), M.gold)
  bowl.position.set(post.position.x, 2.72, post.position.z)
  group.add(bowl)

  const flame = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 0), M.flame)
  flame.position.set(post.position.x, 2.98, post.position.z)
  flame.scale.set(1, 1.5, 1)
  flame.userData.phase = rand(0, 10)
  group.add(flame)
  game.flames.push(flame)

  const glow = new THREE.Sprite(M.glow.clone())
  glow.position.set(flame.position.x, 3.02, flame.position.z)
  glow.scale.set(2.6, 2.6, 1)
  group.add(glow)
}

function buildArch(game, group, index) {
  if (index % 3 !== 1 && Math.random() >= 0.25) return

  const M = game.materials
  const z = -CHUNK_LEN / 2 + rand(8, 24)
  const height = 6.4

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(game.pillarGeo, M.stoneDark)
    pillar.scale.y = height
    pillar.position.set(side * 5.6, height / 2 - 0.2, z)
    pillar.castShadow = true
    group.add(pillar)
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(12.4, 0.8, 1.1), M.stone)
  lintel.position.set(0, height - 0.2, z)
  lintel.castShadow = true
  group.add(lintel)

  const trim = new THREE.Mesh(new THREE.BoxGeometry(12.6, 0.14, 1.24), M.gold)
  trim.position.set(0, height - 0.66, z)
  group.add(trim)

  for (let v = 0; v < 4; v++) {
    if (Math.random() < 0.5) continue
    const length = rand(0.8, 2.6)
    const vine = new THREE.Mesh(new THREE.BoxGeometry(0.06, length, 0.06), M.foliage2)
    vine.position.set(rand(-4.6, 4.6), height - 0.6 - length / 2, z + 0.2)
    group.add(vine)
  }

  const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.4), M.banner)
  banner.position.set(rand(-3.6, 3.6), height - 1.9, z + 0.5)
  group.add(banner)
}

function buildFoliage(game, group) {
  const M = game.materials
  for (let t = 0; t < 3; t++) {
    const side = Math.random() < 0.5 ? -1 : 1
    const x = side * rand(8.6, 13.5)
    const z = rand(-CHUNK_LEN / 2 + 2, CHUNK_LEN / 2 - 2)
    const trunkHeight = rand(2.4, 4.6)

    const trunk = new THREE.Mesh(game.trunkGeo, M.wood)
    trunk.scale.y = trunkHeight
    trunk.position.set(x, trunkHeight / 2 - 1.2, z)
    trunk.castShadow = true
    group.add(trunk)

    const leaves = new THREE.Mesh(game.leafGeo, Math.random() < 0.5 ? M.foliage : M.foliage2)
    leaves.scale.set(rand(1.4, 2.4), rand(2.4, 4.2), rand(1.4, 2.4))
    leaves.position.set(x + rand(-0.4, 0.4), trunkHeight - 0.4, z)
    leaves.rotation.y = rand(0, Math.PI)
    leaves.castShadow = true
    group.add(leaves)
  }
}

function buildRubble(game, group) {
  for (let r = 0; r < 4; r++) {
    const rubble = new THREE.Mesh(
      new THREE.BoxGeometry(rand(0.3, 0.8), rand(0.2, 0.5), rand(0.3, 0.9)),
      game.materials.stoneDark,
    )
    const side = Math.random() < 0.5 ? -1 : 1
    rubble.position.set(side * rand(6.1, 9.6), 0.05, rand(-14, 14))
    rubble.rotation.y = rand(0, Math.PI)
    rubble.castShadow = true
    group.add(rubble)
  }
}

/** Finish gate — built once and reused for every stage. */
export function buildGate(game) {
  const group = new THREE.Group()
  const M = game.materials

  const pillarGeo = new THREE.BoxGeometry(0.9, 7.2, 0.9)
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, M.stone)
    pillar.position.set(side * 4.5, 3.2, 0)
    pillar.castShadow = true
    group.add(pillar)

    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 1.2), M.gold)
    cap.position.set(side * 4.5, 6.9, 0)
    group.add(cap)

    const base = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.4), M.stoneDark)
    base.position.set(side * 4.5, 0.15, 0)
    group.add(base)
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.4, 1.1, 1.1), M.stoneDark)
  lintel.position.y = 7.4
  lintel.castShadow = true
  group.add(lintel)

  const trim = new THREE.Mesh(new THREE.BoxGeometry(10.6, 0.2, 1.3), M.gold)
  trim.position.y = 8.05
  group.add(trim)

  const crest = new THREE.Mesh(new THREE.ConeGeometry(1.1, 1.2, 4), M.gold)
  crest.position.y = 8.7
  crest.rotation.y = Math.PI / 4
  group.add(crest)

  game.gatePortal = new THREE.Mesh(
    new THREE.PlaneGeometry(8.2, 6.6),
    new THREE.MeshBasicMaterial({
      color: 0xffd36b,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  game.gatePortal.position.y = 3.6
  group.add(game.gatePortal)

  game.gateRing = new THREE.Mesh(
    new THREE.TorusGeometry(2.4, 0.06, 6, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffe8a8,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  )
  game.gateRing.position.y = 3.6
  group.add(game.gateRing)

  const glow = new THREE.Sprite(M.glow.clone())
  glow.position.set(0, 4, 0)
  glow.scale.set(18, 18, 1)
  group.add(glow)

  group.visible = false
  game.gate = group
  game.dynamicGroup.add(group)
}
