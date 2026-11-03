// Tiny procedural sound engine — no audio assets required.
export class SoundEngine {
  constructor(settings) {
    this.settings = settings || { sound: true, music: true }
    this.ctx = null
    this.master = null
    this.musicGain = null
    this.sfxGain = null
    this.ambientStarted = false
    this.musicTimer = null
    this.step = 0
    this.ready = false
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume()
      return
    }
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    this.ctx = new AC()
    this.master = this.ctx.createGain()
    this.master.gain.value = 0.7
    this.master.connect(this.ctx.destination)

    this.sfxGain = this.ctx.createGain()
    this.sfxGain.gain.value = this.settings.sound ? 0.85 : 0
    this.sfxGain.connect(this.master)

    this.musicGain = this.ctx.createGain()
    this.musicGain.gain.value = this.settings.music ? 0.16 : 0
    this.musicGain.connect(this.master)

    this.ready = true
    this.startAmbience()
  }

  setSound(on) {
    this.settings.sound = on
    if (this.sfxGain) this.sfxGain.gain.setTargetAtTime(on ? 0.85 : 0, this.ctx.currentTime, 0.05)
  }

  setMusic(on) {
    this.settings.music = on
    if (this.musicGain) this.musicGain.gain.setTargetAtTime(on ? 0.16 : 0, this.ctx.currentTime, 0.2)
  }

  tone(freq, dur = 0.14, type = 'sine', vol = 0.25, slideTo = null, delay = 0) {
    if (!this.ready || !this.settings.sound) return
    const t0 = this.ctx.currentTime + delay
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur)
    gain.gain.setValueAtTime(0.0001, t0)
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    osc.connect(gain)
    gain.connect(this.sfxGain)
    osc.start(t0)
    osc.stop(t0 + dur + 0.05)
  }

  noise(dur = 0.2, vol = 0.18, freq = 1200, q = 0.8, delay = 0) {
    if (!this.ready || !this.settings.sound) return
    const t0 = this.ctx.currentTime + delay
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur))
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(vol, t0)
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.sfxGain)
    src.start(t0)
  }

  click() {
    this.tone(660, 0.07, 'triangle', 0.14, 880)
  }

  coin(streak = 0) {
    const base = 880 + Math.min(streak, 12) * 28
    this.tone(base, 0.09, 'triangle', 0.13, base * 1.5)
    this.tone(base * 2, 0.06, 'sine', 0.06, base * 2.2, 0.02)
  }

  jump() {
    this.tone(300, 0.18, 'sine', 0.16, 720)
    this.noise(0.12, 0.05, 900, 0.7)
  }

  land() {
    this.noise(0.08, 0.09, 220, 0.9)
    this.tone(110, 0.09, 'sine', 0.12, 70)
  }

  slide() {
    this.noise(0.34, 0.14, 700, 0.55)
    this.tone(240, 0.22, 'sawtooth', 0.04, 110)
  }

  hit() {
    this.tone(140, 0.4, 'sawtooth', 0.18, 45)
    this.noise(0.3, 0.2, 240, 0.6)
    this.tone(90, 0.5, 'sine', 0.22, 30)
  }

  shieldBreak() {
    this.tone(700, 0.25, 'square', 0.09, 180)
    this.noise(0.3, 0.14, 2200, 1.2)
  }

  power() {
    ;[523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.1, f, i * 0.06))
  }

  star(i = 0) {
    this.tone(660 * Math.pow(1.26, i), 0.5, 'triangle', 0.16, 660 * Math.pow(1.26, i))
    this.tone(990 * Math.pow(1.26, i), 0.4, 'sine', 0.08, null, 0.04)
  }

  complete() {
    ;[523, 659, 784, 1046, 1318].forEach((f, i) => {
      this.tone(f, 0.5, 'triangle', 0.14, f, i * 0.1)
      this.tone(f / 2, 0.5, 'sine', 0.06, f / 2, i * 0.1)
    })
  }

  fail() {
    ;[392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.5, 'triangle', 0.13, f * 0.98, i * 0.14))
  }

  whoosh() {
    this.noise(0.2, 0.07, 500, 0.5)
  }

  // ── ambient bed: low drone + sparse pentatonic flute ──
  startAmbience() {
    if (this.ambientStarted || !this.ctx) return
    this.ambientStarted = true

    const droneGain = this.ctx.createGain()
    droneGain.gain.value = 0.25
    droneGain.connect(this.musicGain)

    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 320
    filter.Q.value = 2
    filter.connect(droneGain)

    ;[55, 82.5, 110].forEach((f, i) => {
      const osc = this.ctx.createOscillator()
      osc.type = i === 2 ? 'triangle' : 'sine'
      osc.frequency.value = f
      osc.detune.value = i * 4 - 4
      const g = this.ctx.createGain()
      g.gain.value = 0.16 / (i + 1)
      osc.connect(g)
      g.connect(filter)
      osc.start()
    })

    // soft wind
    const len = this.ctx.sampleRate * 4
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * 0.5
    const src = this.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    const windFilter = this.ctx.createBiquadFilter()
    windFilter.type = 'bandpass'
    windFilter.frequency.value = 500
    windFilter.Q.value = 0.6
    const windGain = this.ctx.createGain()
    windGain.gain.value = 0.035
    src.connect(windFilter)
    windFilter.connect(windGain)
    windGain.connect(this.musicGain)
    src.start()

    // sparse flute notes every few seconds
    const scale = [392, 440, 523, 587, 659, 784]
    const notes = [0, 2, 4, 5, 4, 2, 1, 3]
    this.musicTimer = setInterval(() => {
      if (!this.settings.music || !this.ctx || this.ctx.state !== 'running') return
      this.step = (this.step + 1) % notes.length
      const f = scale[notes[this.step]]
      const t0 = this.ctx.currentTime
      const osc = this.ctx.createOscillator()
      const g = this.ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      g.gain.setValueAtTime(0.0001, t0)
      g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.08)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.8)
      osc.connect(g)
      g.connect(this.musicGain)
      osc.start(t0)
      osc.stop(t0 + 2)
    }, 3400)
  }
}
