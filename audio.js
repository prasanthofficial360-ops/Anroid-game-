/* ═══════════════════════════════════════════════════════════════════════
   ZOMBIE ROAD RUSH — procedural audio engine
   No samples. No downloads. Pure Web Audio.
   ═══════════════════════════════════════════════════════════════════════ */

const TAU = Math.PI * 2;

export class AudioEngine {
  constructor(settings = {}) {
    this.settings = settings;
    this.ctx = null;
    this.master = null;
    this.musicBus = null;
    this.sfxBus = null;
    this.engineGain = null;
    this.engineOscA = null;
    this.engineOscB = null;
    this.engineFilter = null;
    this.roadGain = null;
    this.noiseBuffer = null;
    this.musicOn = settings.musicOn !== false;
    this.sfxOn = settings.sfxOn !== false;
    this.musicVolume = settings.musicVol ?? 0.55;
    this.sfxVolume = settings.sfxVol ?? 0.75;
    this.muted = false;
    this.scene = 'menu';
    this.step = 0;
    this.nextStep = 0;
    this.lastUpdate = 0;
    this.started = false;
    this.available = typeof window !== 'undefined' && !!(window.AudioContext || window.webkitAudioContext);
  }

  ensure() {
    if (!this.available) return false;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);

      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = this.musicOn ? this.musicVolume * 0.32 : 0;
      this.musicBus.connect(this.master);

      this.sfxBus = this.ctx.createGain();
      this.sfxBus.gain.value = this.sfxOn ? this.sfxVolume : 0;
      this.sfxBus.connect(this.master);

      this.noiseBuffer = this.makeNoise(1.2);
      this.setupEngine();
      this.nextStep = this.ctx.currentTime + 0.15;
      this.started = true;
    } catch (error) {
      this.available = false;
      return false;
    }
    return true;
  }

  makeNoise(seconds) {
    const rate = this.ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const buffer = this.ctx.createBuffer(1, length, rate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = last * 0.82 + white * 0.18;
      data[i] = last;
    }
    return buffer;
  }

  setupEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 340;
    this.engineFilter.Q.value = 2.2;

    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;

    this.engineOscA = ctx.createOscillator();
    this.engineOscA.type = 'sawtooth';
    this.engineOscA.frequency.value = 46;
    const gainA = ctx.createGain();
    gainA.gain.value = 0.34;

    this.engineOscB = ctx.createOscillator();
    this.engineOscB.type = 'square';
    this.engineOscB.frequency.value = 69;
    const gainB = ctx.createGain();
    gainB.gain.value = 0.12;

    this.engineOscA.connect(gainA).connect(this.engineFilter);
    this.engineOscB.connect(gainB).connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain).connect(this.sfxBus);
    this.engineOscA.start();
    this.engineOscB.start();

    const road = ctx.createBufferSource();
    road.buffer = this.noiseBuffer;
    road.loop = true;
    const roadFilter = ctx.createBiquadFilter();
    roadFilter.type = 'lowpass';
    roadFilter.frequency.value = 900;
    this.roadGain = ctx.createGain();
    this.roadGain.gain.value = 0;
    road.connect(roadFilter).connect(this.roadGain).connect(this.sfxBus);
    road.start();
  }

  setMuted(muted) {
    this.muted = muted;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(muted ? 0 : 0.9, now, 0.04);
  }

  setMusicEnabled(enabled) {
    this.musicOn = enabled;
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(enabled ? this.musicVolume * 0.32 : 0, now, 0.08);
    if (enabled) this.nextStep = Math.max(this.nextStep, now + 0.08);
  }

  setSfxEnabled(enabled) {
    this.sfxOn = enabled;
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(enabled ? this.sfxVolume : 0, this.ctx.currentTime, 0.05);
  }

  setMusicVolume(value) {
    this.musicVolume = Math.max(0, Math.min(1, value));
    if (!this.ctx) return;
    this.musicBus.gain.setTargetAtTime(this.musicOn ? this.musicVolume * 0.32 : 0, this.ctx.currentTime, 0.05);
  }

  setSfxVolume(value) {
    this.sfxVolume = Math.max(0, Math.min(1, value));
    if (!this.ctx) return;
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? this.sfxVolume : 0, this.ctx.currentTime, 0.05);
  }

  setScene(scene) {
    if (this.scene !== scene) {
      this.scene = scene;
      if (this.ctx) this.nextStep = Math.max(this.nextStep, this.ctx.currentTime + 0.05);
    }
  }

  update(speed = 0, state = 'menu') {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastUpdate < 0.028) return;
    this.lastUpdate = now;

    const loud = state === 'playing' || state === 'dying';
    const idle = state === 'paused';
    const engineLevel = loud ? 0.022 + Math.min(speed, 340) / 340 * 0.018 : idle ? 0.006 : 0;
    const freq = 42 + Math.min(speed, 340) * 0.28;
    this.engineOscA.frequency.setTargetAtTime(freq, now, 0.09);
    this.engineOscB.frequency.setTargetAtTime(freq * 1.497, now, 0.09);
    this.engineFilter.frequency.setTargetAtTime(260 + Math.min(speed, 340) * 8.5, now, 0.1);
    this.engineGain.gain.setTargetAtTime(engineLevel, now, 0.1);
    this.roadGain.gain.setTargetAtTime(loud ? 0.01 + Math.min(speed, 340) / 340 * 0.014 : 0, now, 0.16);

    this.scheduleMusic(now, state);
  }

  scheduleMusic(now, state) {
    if (!this.musicOn) return;
    if (this.nextStep < now - 0.75) this.nextStep = now + 0.08;
    const tempo = state === 'playing' ? 124 : state === 'paused' ? 94 : 104;
    const stepDur = 60 / tempo / 2;
    let guard = 0;
    while (this.nextStep < now + 0.18 && guard++ < 18) {
      this.playMusicStep(this.step, this.nextStep, state);
      this.step = (this.step + 1) % 32;
      this.nextStep += stepDur;
    }
  }

  playMusicStep(step, when, state) {
    const ctx = this.ctx;
    if (!ctx) return;
    const bar = Math.floor(step / 8) % 4;
    const roots = [55, 55, 43.65, 49];
    const root = roots[bar];
    const busy = state === 'playing';
    const menu = state === 'menu' || state === 'gameover';

    if (busy && (step % 4 === 0 || step === 6 || step === 22)) {
      this.kick(when, busy ? 0.12 : 0.06);
    }
    if (busy && (step === 8 || step === 24)) this.snare(when, 0.055);
    if ((step % 2 === 1) && !menu) this.hat(when, busy ? 0.024 : 0.013);

    if (step % 2 === 0) {
      const pattern = [0, 0, 12, 0, 7, 0, 10, 0, 0, 0, 12, 7, 0, 10, 7, 5];
      const midi = pattern[step % 16];
      const freq = root * Math.pow(2, midi / 12);
      this.musicTone(freq, 0.34, 'sawtooth', menu ? 0.027 : 0.035, when, 700);
    }

    if (step % 8 === 0) {
      const chord = bar === 2 ? [130.81, 155.56, 196] : [110, 130.81, 164.81];
      for (let i = 0; i < chord.length; i++) {
        this.musicTone(chord[i], 2.2, 'triangle', 0.013, when + i * 0.015, 1200);
      }
    }

    if (busy && step % 2 === 0 && step % 8 !== 0) {
      const arp = [440, 523.25, 659.25, 587.33, 783.99, 659.25, 587.33, 523.25];
      const f = arp[(step + bar * 3) % arp.length] * (bar === 2 ? 0.92 : 1);
      this.musicTone(f, 0.18, 'square', 0.008, when, 2800);
    }
  }

  musicTone(freq, duration, type, volume, when, cutoff = 2000) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(filter).connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + duration + 0.04);
  }

  kick(when, volume = 0.1) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(132, when);
    osc.frequency.exponentialRampToValueAtTime(42, when + 0.13);
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);
    osc.connect(gain).connect(this.musicBus);
    osc.start(when);
    osc.stop(when + 0.24);
  }

  snare(when, volume = 0.05) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.13);
    src.connect(filter).connect(gain).connect(this.musicBus);
    src.start(when);
    src.stop(when + 0.15);
  }

  hat(when, volume = 0.02) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 6200;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, when);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.045);
    src.connect(filter).connect(gain).connect(this.musicBus);
    src.start(when);
    src.stop(when + 0.06);
  }

  tone(freq, endFreq, duration, type, volume, when = this.ctx?.currentTime ?? 0, destination = null) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freq), when);
    if (endFreq && endFreq !== freq) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), when + duration);
    }
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(gain).connect(destination || this.sfxBus);
    osc.start(when);
    osc.stop(when + duration + 0.03);
  }

  noise(duration, volume, when, filterType = 'lowpass', startFreq = 1600, endFreq = startFreq, q = 0.7) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(startFreq, when);
    if (endFreq !== startFreq) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), when + duration);
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.linearRampToValueAtTime(volume, when + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start(when);
    src.stop(when + duration + 0.05);
  }

  sfx(name) {
    if (!this.ctx || !this.sfxOn || this.muted) return;
    const t = this.ctx.currentTime + 0.002;
    switch (name) {
      case 'shoot':
        this.tone(610, 120, 0.085, 'square', 0.11, t);
        this.noise(0.075, 0.085, t, 'bandpass', 2700, 900, 0.9);
        break;
      case 'empty':
        this.tone(180, 120, 0.035, 'square', 0.025, t);
        break;
      case 'hit':
        this.noise(0.09, 0.08, t, 'bandpass', 1600, 500, 1.4);
        this.tone(120, 50, 0.1, 'sine', 0.06, t);
        break;
      case 'explosion':
        this.noise(0.62, 0.24, t, 'lowpass', 1100, 70, 0.8);
        this.tone(74, 27, 0.5, 'sine', 0.15, t);
        this.tone(46, 24, 0.65, 'triangle', 0.1, t + 0.02);
        break;
      case 'crash':
        this.noise(0.3, 0.17, t, 'lowpass', 2100, 250, 0.7);
        this.tone(90, 35, 0.25, 'sawtooth', 0.075, t);
        break;
      case 'pickup':
        this.tone(420, 620, 0.1, 'triangle', 0.07, t);
        this.tone(660, 880, 0.14, 'triangle', 0.055, t + 0.08);
        break;
      case 'coin':
        this.tone(1100, 1450, 0.07, 'triangle', 0.05, t);
        this.tone(1450, 1750, 0.08, 'sine', 0.025, t + 0.055);
        break;
      case 'ammo':
        this.tone(300, 450, 0.09, 'square', 0.04, t);
        this.noise(0.12, 0.03, t, 'bandpass', 1200, 700, 1.2);
        break;
      case 'repair':
        this.tone(300, 460, 0.13, 'sine', 0.08, t);
        this.tone(460, 690, 0.16, 'sine', 0.06, t + 0.1);
        break;
      case 'nitro':
        this.noise(0.65, 0.09, t, 'bandpass', 400, 3200, 0.9);
        this.tone(80, 240, 0.6, 'sawtooth', 0.04, t);
        break;
      case 'shield':
        this.tone(440, 880, 0.18, 'triangle', 0.065, t);
        this.tone(880, 1320, 0.25, 'sine', 0.04, t + 0.12);
        break;
      case 'zombie':
        this.tone(135, 72, 0.48, 'sawtooth', 0.04, t);
        this.tone(95, 60, 0.5, 'square', 0.012, t + 0.05);
        break;
      case 'combo':
        this.tone(660, 990, 0.07, 'square', 0.025, t);
        this.tone(990, 1320, 0.11, 'triangle', 0.02, t + 0.06);
        break;
      case 'damage':
        this.noise(0.2, 0.13, t, 'lowpass', 700, 120, 0.9);
        this.tone(74, 40, 0.22, 'sawtooth', 0.075, t);
        break;
      case 'level':
        [392, 523.25, 659.25, 783.99].forEach((f, i) => this.tone(f, f, 0.16, 'triangle', 0.04, t + i * 0.075));
        break;
      case 'ui':
        this.tone(300, 380, 0.045, 'square', 0.025, t);
        break;
      case 'gameover':
        this.tone(220, 110, 0.65, 'sawtooth', 0.06, t);
        this.tone(110, 55, 1.2, 'triangle', 0.07, t + 0.22);
        this.noise(1.4, 0.06, t, 'lowpass', 500, 60, 0.7);
        break;
      case 'horde':
        this.tone(92, 58, 0.85, 'sawtooth', 0.055, t);
        this.tone(138, 92, 0.7, 'square', 0.02, t + 0.1);
        this.noise(0.75, 0.04, t, 'lowpass', 800, 200, 0.7);
        break;
      default:
        break;
    }
  }
}
