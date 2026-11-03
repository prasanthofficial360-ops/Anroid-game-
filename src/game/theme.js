import * as THREE from 'three'
import { color, rand } from './core.js'
import { buildTrack } from './track.js'

/** Applies a world palette to the scene, materials and track. */
export function applyTheme(game, theme) {
  if (!theme || (game.theme && game.theme.name === theme.name)) return

  game.theme = theme
  const fog = color(theme.fog)
  const white = new THREE.Color('#ffffff')
  const black = new THREE.Color('#000000')

  game.scene.fog.color = fog
  game.scene.fog.near = 44
  game.scene.fog.far = 168
  game.renderer?.setClearColor(fog)

  game.skyMat.uniforms.topColor.value = color(theme.sky[0])
  game.skyMat.uniforms.bottomColor.value = color(theme.sky[1])

  game.sunSprite.material.color = color(theme.accent)
  game.apron.material.color = fog.clone().multiplyScalar(0.62)
  game.clouds.forEach((cloud) => (cloud.material.color = color(theme.sky[1])))

  game.hemi.color = color(theme.sky[1]).lerp(white, 0.35)
  game.hemi.groundColor = color(theme.stoneDark).lerp(black, 0.2)
  game.hemi.intensity = theme.light
  game.sunLight.color = color(theme.accent).lerp(white, 0.65)
  game.sunLight.intensity = theme.sun
  game.accentLight.color = color(theme.accent)
  game.rimLight.color = color(theme.accent2)

  const M = game.materials
  M.floor.color = color(theme.stone)
  M.stone.color = color(theme.stone).offsetHSL(0, -0.02, 0.03)
  M.stoneDark.color = color(theme.stoneDark)
  M.gold.color = color(theme.accent)
  M.gold.emissive = color(theme.accent2).multiplyScalar(0.16)
  M.wood.color = color(theme.stoneDark).offsetHSL(0.02, 0.05, -0.04)
  M.foliage.color = color(theme.foliage)
  M.foliage2.color = color(theme.foliage).offsetHSL(0, 0, -0.05)
  M.banner.color = color(theme.accent2)
  M.flame.color = color(theme.flame)
  M.glow.color = color(theme.flame)
  M.glow.needsUpdate = true

  if (M.floor.map) M.floor.map.dispose()
  M.floor.map = makeStoneTexture(theme)
  M.floor.needsUpdate = true

  const silhouette = fog.clone().lerp(color(theme.sky[0]), 0.28)
  game.bgMats.forEach((material, i) => {
    material.color = silhouette.clone().offsetHSL(0, 0, -0.05 * (i % 3))
  })

  game.coinMat.emissive = color(theme.accent)
  game.coinMat.color = color(theme.accent).lerp(new THREE.Color('#fff6c9'), 0.45)
  game.magnetMat.color = color(theme.accent2)
  game.magnetMat.emissive = color(theme.accent2).multiplyScalar(0.7)

  buildTrack(game)
}

function makeStoneTexture(theme) {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')
  const base = color(theme.stone)
  const dark = color(theme.stoneDark)
  const moss = color(theme.foliage)

  ctx.fillStyle = `#${base.getHexString()}`
  ctx.fillRect(0, 0, size, size)

  const cols = 4
  const rows = 8
  const blockW = size / cols
  const blockH = size / rows
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const shaded = base.clone().offsetHSL(0, 0, rand(-0.1, 0.12))
      ctx.fillStyle = `#${shaded.getHexString()}`
      ctx.fillRect(x * blockW + 3, y * blockH + 3, blockW - 6, blockH - 6)

      ctx.strokeStyle = `rgba(255,255,255,${rand(0.03, 0.09)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x * blockW + 4, y * blockH + blockH - 4)
      ctx.lineTo(x * blockW + 4, y * blockH + 4)
      ctx.lineTo(x * blockW + blockW - 4, y * blockH + 4)
      ctx.stroke()
    }
  }

  ctx.strokeStyle = `#${dark.getHexString()}`
  ctx.globalAlpha = 0.55
  ctx.lineWidth = 5
  for (let y = 0; y <= rows; y++) {
    ctx.beginPath()
    ctx.moveTo(0, y * blockH)
    ctx.lineTo(size, y * blockH)
    ctx.stroke()
  }
  for (let x = 0; x <= cols; x++) {
    ctx.beginPath()
    ctx.moveTo(x * blockW, 0)
    ctx.lineTo(x * blockW, size)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  for (let i = 0; i < 2600; i++) {
    const light = Math.random() > 0.5
    ctx.fillStyle = light
      ? `rgba(255,255,255,${Math.random() * 0.07})`
      : `rgba(0,0,0,${Math.random() * 0.12})`
    const radius = Math.random() * 2.4
    ctx.fillRect(Math.random() * size, Math.random() * size, radius, radius)
  }

  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = `rgba(0,0,0,${rand(0.12, 0.28)})`
    ctx.lineWidth = rand(1, 2.5)
    let x = Math.random() * size
    let y = Math.random() * size
    ctx.beginPath()
    ctx.moveTo(x, y)
    for (let s = 0; s < 6; s++) {
      x += rand(-26, 26)
      y += rand(12, 34)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  ctx.fillStyle = `#${moss.getHexString()}`
  for (let i = 0; i < 90; i++) {
    ctx.globalAlpha = rand(0.05, 0.22)
    ctx.beginPath()
    ctx.arc(
      Math.random() < 0.5 ? rand(0, 50) : rand(size - 50, size),
      Math.random() * size,
      rand(4, 22),
      0,
      Math.PI * 2,
    )
    ctx.fill()
  }
  ctx.globalAlpha = 1

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(2, 5)
  texture.anisotropy = 4
  return texture
}
