import * as THREE from 'three'
import { makeGlowTexture, rand } from './core.js'

/**
 * Builds the static world around the track: sky, sun, mountains, temple
 * silhouette, clouds, lights, dust and the two scene groups.
 */
export function buildScenery(game) {
  game.scene = new THREE.Scene()
  game.scene.fog = new THREE.Fog(0xc9a878, 46, 168)

  game.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900)
  game.camera.position.set(0, 4.7, 9.6)
  game.camera.lookAt(0, 1.7, -16)
  game.camX = 0
  game.camY = 4.7
  game.fov = 60
  game.shake = 0

  buildSky(game)
  buildBackground(game)
  buildClouds(game)
  buildLights(game)

  game.staticGroup = new THREE.Group()
  game.dynamicGroup = new THREE.Group()
  game.scene.add(game.staticGroup, game.dynamicGroup)
  buildDust(game)
}

function buildSky(game) {
  game.skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color('#1d4e74') },
      bottomColor: { value: new THREE.Color('#ffc46b') },
      sunDir: { value: new THREE.Vector3(0.5, 0.5, -0.7).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vPos;
      void main() {
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform vec3 sunDir;
      varying vec3 vPos;
      void main() {
        vec3 dir = normalize(vPos);
        float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
        vec3 c = mix(bottomColor, topColor, pow(h, 1.15));
        float glow = pow(max(dot(dir, normalize(sunDir)), 0.0), 8.0);
        c += vec3(1.0, 0.65, 0.3) * glow * 0.35;
        gl_FragColor = vec4(c, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })

  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 20), game.skyMat)
  sky.renderOrder = -10
  game.scene.add(sky)

  const glow = makeGlowTexture()
  game.sunSprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glow,
      color: 0xffd28a,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  )
  game.sunSprite.scale.set(150, 150, 1)
  game.sunSprite.position.set(130, 95, -330)
  game.scene.add(game.sunSprite)
  game.glowTex = glow

  game.apron = new THREE.Mesh(
    new THREE.PlaneGeometry(700, 700),
    new THREE.MeshStandardMaterial({ color: 0x6b573f, roughness: 1, metalness: 0 }),
  )
  game.apron.rotation.x = -Math.PI / 2
  game.apron.position.y = -1.6
  game.apron.receiveShadow = true
  game.scene.add(game.apron)
}

function buildBackground(game) {
  game.bgGroup = new THREE.Group()
  game.bgMats = []

  const mountainColors = [0x6f604d, 0x5a4d3d, 0x4a3f33]
  for (let i = 0; i < 16; i++) {
    const angle = (i / 16) * Math.PI * 2
    const radius = rand(330, 430)
    const height = rand(55, 130)
    const material = new THREE.MeshBasicMaterial({
      color: mountainColors[i % 3],
      fog: false,
      transparent: true,
      opacity: 0.85,
    })
    game.bgMats.push(material)

    const mountain = new THREE.Mesh(new THREE.ConeGeometry(rand(60, 100), height, 5), material)
    mountain.position.set(Math.cos(angle) * radius, height / 2 - 30, Math.sin(angle) * radius - 40)
    mountain.rotation.y = rand(0, Math.PI)
    game.bgGroup.add(mountain)
  }

  game.bgGroup.add(buildDistantTemple(game))
  game.scene.add(game.bgGroup)
}

function buildDistantTemple(game) {
  const material = new THREE.MeshBasicMaterial({ color: 0x3c3026, fog: false, transparent: true, opacity: 0.96 })
  game.bgMats.push(material)

  const temple = new THREE.Group()
  const steps = [
    [220, 26, 60],
    [176, 26, 52],
    [136, 26, 44],
    [100, 26, 36],
    [68, 26, 28],
    [40, 30, 24],
  ]

  let y = -34
  steps.forEach(([width, height, depth], i) => {
    const step = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material)
    step.position.y = y + height / 2
    y += height
    temple.add(step)

    if (i === steps.length - 1) {
      const cap = new THREE.Mesh(new THREE.ConeGeometry(width * 0.75, height * 1.6, 4), material)
      cap.position.y = y - 30 + height
      cap.rotation.y = Math.PI / 4
      temple.add(cap)
    }
  })

  const door = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 20),
    new THREE.MeshBasicMaterial({ color: 0xffc45c, fog: false, transparent: true, opacity: 0.55 }),
  )
  door.position.set(0, -34 + 25, 31)
  temple.add(door)
  temple.position.set(0, 0, -395)
  game.temple = temple
  return temple
}

function buildClouds(game) {
  game.clouds = []
  for (let i = 0; i < 7; i++) {
    const cloud = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: game.glowTex,
        color: 0xffffff,
        transparent: true,
        opacity: rand(0.05, 0.13),
        depthWrite: false,
        fog: false,
      }),
    )
    cloud.scale.set(rand(90, 190), rand(24, 44), 1)
    cloud.position.set(rand(-260, 260), rand(45, 105), rand(-380, -220))
    game.scene.add(cloud)
    game.clouds.push(cloud)
  }
}

function buildLights(game) {
  game.hemi = new THREE.HemisphereLight(0xbfe6ff, 0x5b4630, 1.05)
  game.scene.add(game.hemi)

  game.sunLight = new THREE.DirectionalLight(0xfff0cf, 2.4)
  game.sunLight.position.set(14, 24, 10)
  game.sunLight.castShadow = true
  game.sunLight.shadow.mapSize.set(2048, 2048)
  game.sunLight.shadow.camera.left = -20
  game.sunLight.shadow.camera.right = 20
  game.sunLight.shadow.camera.top = 24
  game.sunLight.shadow.camera.bottom = -10
  game.sunLight.shadow.camera.near = 1
  game.sunLight.shadow.camera.far = 80
  game.sunLight.shadow.bias = -0.0004
  game.sunLight.shadow.normalBias = 0.02
  game.sunLight.target.position.set(0, 0, -6)
  game.scene.add(game.sunLight, game.sunLight.target)

  game.accentLight = new THREE.PointLight(0xffc45c, 26, 42, 1.8)
  game.accentLight.position.set(0, 4.5, -8)
  game.scene.add(game.accentLight)

  game.rimLight = new THREE.DirectionalLight(0x9fd8ff, 0.7)
  game.rimLight.position.set(-10, 8, -18)
  game.scene.add(game.rimLight)
}

function buildDust(game) {
  const count = 260
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = rand(-20, 20)
    positions[i * 3 + 1] = rand(0.2, 12)
    positions[i * 3 + 2] = rand(-120, 12)
    seeds[i] = rand(0, Math.PI * 2)
  }
  game.dustSeeds = seeds

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  game.dust = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: 0xffe6b0,
      size: 0.16,
      map: game.glowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    }),
  )
  game.dust.frustumCulled = false
  game.scene.add(game.dust)
}
