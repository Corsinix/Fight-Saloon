// Musique chiptune 8/16 bits (compositions originales façon western spaghetti, sons NES / SNES) + bruitages, en WebAudio.
// Si public/music contient les fichiers listés dans CUSTOM_TRACKS (ou menu.mp3 / game.mp3), ils s'intercalent entre les morceaux synthétisés.

let ac = null, master, musicBus, sfxBus, echoIn, noiseBuf, nesNoise;
// musique dynamique : musicBus -> hushG (ambiance) -> duckG (effets ponctuels) -> moodLP -> master ; stingBus = effets hors atténuation
let hushG, duckG, moodLP, stingBus;
// sfxSlap : écho de canyon des coups de feu ; driveR / driveL : amplis saturés (riffs / solos) du Doom-like
let sfxSlap, driveR, driveL;
const WAVES = {};
const settings = { music: 0.55, sfx: 0.8, muted: false };
try { Object.assign(settings, JSON.parse(localStorage.getItem('bs-audio') || '{}')); } catch {}

function persist() {
  try { localStorage.setItem('bs-audio', JSON.stringify(settings)); } catch {}
}

function applyVolumes() {
  if (!ac) return;
  master.gain.value = settings.muted ? 0 : 1;
  musicBus.gain.value = settings.music;
  stingBus.gain.value = settings.music;
  sfxBus.gain.value = settings.sfx;
}

// formes d'onde "console" : pulse 12,5 / 25 / 50 % et triangle 4 bits du NES
function buildWaves() {
  const N = 48;
  const pulse = (duty) => {
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let n = 1; n < N; n++) re[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    return ac.createPeriodicWave(re, im);
  };
  WAVES.p12 = pulse(0.125);
  WAVES.p25 = pulse(0.25);
  WAVES.p50 = pulse(0.5);
  const S = 1024, tri = new Float32Array(S);
  for (let i = 0; i < S; i++) {
    const step = Math.floor((i / S) * 32);
    const lvl = step < 16 ? 15 - step : step - 16;
    tri[i] = lvl / 7.5 - 1;
  }
  const re = new Float32Array(N), im = new Float32Array(N);
  for (let n = 1; n < N; n++) {
    let a = 0, b = 0;
    for (let i = 0; i < S; i++) {
      const ph = (2 * Math.PI * n * i) / S;
      a += tri[i] * Math.cos(ph);
      b += tri[i] * Math.sin(ph);
    }
    re[n] = (2 * a) / S;
    im[n] = (2 * b) / S;
  }
  WAVES.tri4 = ac.createPeriodicWave(re, im);
}

export function initAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  // 'playback' : tampon de 20 ms au lieu de 10 (Chrome sous Windows) ; la musique ne crépite plus au moindre pic de calcul,
  // et 10 ms de plus sur les bruitages ne s'entendent pas
  try { ac = new AC({ latencyHint: 'playback' }); } catch { ac = new AC(); }
  master = ac.createGain();
  master.connect(ac.destination);
  musicBus = ac.createGain();
  sfxBus = ac.createGain();
  hushG = ac.createGain();
  duckG = ac.createGain();
  moodLP = ac.createBiquadFilter();
  moodLP.type = 'lowpass';
  moodLP.frequency.value = 18000;
  musicBus.connect(hushG).connect(duckG).connect(moodLP).connect(master);
  stingBus = ac.createGain();
  stingBus.connect(master);
  sfxBus.connect(master);
  // écho "canyon" (sert surtout au son 16 bits, façon DSP de la SNES)
  echoIn = ac.createGain();
  const delay = ac.createDelay(1);
  delay.delayTime.value = 0.27;
  const fb = ac.createGain();
  fb.gain.value = 0.32;
  const wet = ac.createGain();
  wet.gain.value = 0.35;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  echoIn.connect(delay);
  delay.connect(lp);
  lp.connect(fb);
  fb.connect(delay);
  lp.connect(wet);
  wet.connect(musicBus);
  // la détonation revient des façades et des collines, un peu plus sourde à chaque fois
  sfxSlap = ac.createGain();
  const sd = ac.createDelay(1);
  sd.delayTime.value = 0.23;
  const sfb = ac.createGain();
  sfb.gain.value = 0.38;
  const slp = ac.createBiquadFilter();
  slp.type = 'lowpass';
  slp.frequency.value = 1400;
  const sw = ac.createGain();
  sw.gain.value = 0.45;
  sfxSlap.connect(sd).connect(slp).connect(sfb).connect(sd);
  slp.connect(sw).connect(sfxBus);
  // guitares saturées : toutes les notes passent dans la même saturation, comme dans un vrai ampli
  driveR = driveChain(7, 2600, 0.09, 0);
  driveL = driveChain(5, 3400, 0.07, 0.3);
  noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // bruit 1 bit à registre à décalage (LFSR 15 bits), comme le canal noise du NES
  nesNoise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
  const nd = nesNoise.getChannelData(0);
  let reg = 1, out = 1;
  for (let i = 0; i < nd.length; i++) {
    if (i % 3 === 0) {
      const bit = (reg ^ (reg >> 1)) & 1;
      reg = (reg >> 1) | (bit << 14);
      out = reg & 1 ? 1 : -1;
    }
    nd[i] = out;
  }
  buildWaves();
  applyVolumes();
  loadCrusher();
  loadCustomMusic();
  loadSamples();
  setInterval(layers, 100);
  applyMood();
}

export const audioSettings = settings;
export function setVolume(kind, v) { settings[kind] = v; applyVolumes(); persist(); }
export function toggleMute() { settings.muted = !settings.muted; applyVolumes(); persist(); return settings.muted; }

// ------------------------------------------------------------------ instruments
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function noteNum(name) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(name);
  if (!m) return null;
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const freq = (name) => mtof(noteNum(name));

function osc(wave, f, t) {
  const o = ac.createOscillator();
  if (WAVES[wave]) o.setPeriodicWave(WAVES[wave]);
  else o.type = wave;
  o.frequency.setValueAtTime(f, t);
  return o;
}

function env(g, t, a, peak, d, end) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, Math.max(t + a, end - d));
  g.gain.linearRampToValueAtTime(0.0001, end);
}

function vibrato(o, t, d, cents, rate = 5.5, delay = 0.18) {
  if (d <= delay + 0.05) return null;
  const lfo = ac.createOscillator();
  lfo.frequency.value = rate;
  const lg = ac.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.setValueAtTime(0, t + delay);
  lg.gain.linearRampToValueAtTime(cents, t + Math.min(d, delay + 0.25));
  lfo.connect(lg).connect(o.detune);
  lfo.start(t);
  lfo.stop(t + d + 0.1);
  return lfo;
}

// slap : le son part aussi dans l'écho de canyon
function noise(t, dur, { type = 'lowpass', f = 1000, f2 = null, q = 1, gain = 0.3, dest = sfxBus, decay = true, buf = noiseBuf, slap = false } = {}) {
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const flt = ac.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + dur);
  flt.Q.value = q;
  const g = ac.createGain();
  g.gain.setValueAtTime(gain, t);
  if (decay) g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  else g.gain.setValueAtTime(0, t + dur);
  src.connect(flt).connect(g).connect(dest);
  if (slap) g.connect(sfxSlap);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

function tone(t, f, dur, { type = 'sine', gain = 0.2, f2 = null, dest = sfxBus, attack = 0.005, slap = false } = {}) {
  const o = osc(type, f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  if (slap) g.connect(sfxSlap);
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Corde pincée économique, pour les accords (une note par corde, plusieurs fois par mesure) :
// un corps en triangle et une attaque brillante qui ne vit que 0,12 s, sans filtre ni vibrato.
// Chaque filtre balayé ou vibrato coûte cher au thread audio ; multipliés par les cordes d'un accord,
// ils le saturaient (crépitements). bright : forme d'onde de l'attaque, snap : sa part dans le son.
function pluck(f, t, len, peak, { bright = 'p25', snap = 0.5, atkLen = 0.12, dest = musicBus, echo = true } = {}) {
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(peak * 0.3, t + Math.min(len, 0.2));
  g.gain.exponentialRampToValueAtTime(0.001, t + len);
  const body = osc('triangle', f, t);
  body.connect(g);
  body.start(t);
  body.stop(t + len + 0.02);
  const atk = Math.min(len, atkLen);
  const o = osc(bright, f, t);
  const og = ac.createGain();
  og.gain.setValueAtTime(snap, t);
  og.gain.exponentialRampToValueAtTime(0.01, t + atk);
  o.connect(og).connect(g);
  o.start(t);
  o.stop(t + atk + 0.02);
  g.connect(dest);
  if (echo) g.connect(echoIn);
}

// note "8 bits" : enveloppe en paliers comme les registres de volume du NES
function chipNote(wave, f, t, d, vol, { gate = 0.9, vib = 0, dest = musicBus, echo = false } = {}) {
  const o = osc(wave, f, t);
  const end = t + Math.max(0.04, d * gate);
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.setValueAtTime(vol * 0.8, t + 0.05);
  g.gain.setValueAtTime(vol * 0.65, t + 0.12);
  g.gain.setValueAtTime(0, end);
  const lfo = vib ? vibrato(o, t, d, vib) : null;
  o.connect(g).connect(dest);
  if (echo) g.connect(echoIn);
  o.start(t);
  o.stop(end + 0.02);
  if (lfo) lfo.stop(end + 0.02);
}

const INST = {
  // ---- 8 bits (NES : 2 pulses, 1 triangle, 1 bruit)
  lead8(m, t, d, v = 1) { chipNote('p25', mtof(m), t, d, 0.075 * v, { vib: 22 }); },
  lead8b(m, t, d, v = 1) { chipNote('p50', mtof(m), t, d, 0.06 * v, { vib: 18 }); },
  echo8(m, t, d, v = 1) { chipNote('p12', mtof(m), t, d, 0.03 * v, { vib: 15 }); },
  bass8(m, t, d, v = 1) {
    const o = osc('tri4', mtof(m), t);
    const end = t + Math.max(0.05, d * 0.85);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.3 * v, t);
    g.gain.setValueAtTime(0, end);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(end + 0.02);
  },
  // accord = arpège ultra-rapide sur une seule voix pulse (l'astuce des musiques NES)
  comp8(notes, t, d, v = 1) {
    const o = osc('p12', mtof(notes[0]), t);
    const end = t + Math.max(0.05, d * 0.8);
    for (let x = t, i = 0; x < end; x += 1 / 30, i++) o.frequency.setValueAtTime(mtof(notes[i % notes.length]), x);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.04 * v, t);
    g.gain.setValueAtTime(0.028 * v, t + 0.06);
    g.gain.setValueAtTime(0, end);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(end + 0.02);
  },
  K8(t) {
    const o = osc('tri4', 180, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.4, t);
    g.gain.setValueAtTime(0, t + 0.11);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(t + 0.13);
    noise(t, 0.03, { f: 1200, gain: 0.12, dest: musicBus, buf: nesNoise });
  },
  S8(t) { noise(t, 0.13, { type: 'highpass', f: 900, gain: 0.16, dest: musicBus, buf: nesNoise }); },
  H8(t) { noise(t, 0.03, { type: 'highpass', f: 6500, gain: 0.07, dest: musicBus, buf: nesNoise, decay: false }); },
  O8(t) { noise(t, 0.16, { type: 'highpass', f: 6000, gain: 0.06, dest: musicBus, buf: nesNoise }); },

  // ---- 16 bits (SNES : échantillons filtrés + écho)
  flute(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.95);
    const g = ac.createGain();
    env(g, t, 0.05, 0.13 * v, 0.07, end);
    const o = osc('sine', f, t), o2 = osc('triangle', f * 2, t);
    const g2 = ac.createGain();
    g2.gain.value = 0.18;
    const lfo = vibrato(o, t, d, 14, 5.2);
    if (lfo) vibrato(o2, t, d, 14, 5.2);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    for (const x of [o, o2]) { x.start(t); x.stop(end + 0.03); }
    noise(t, 0.06, { type: 'bandpass', f: f * 2, q: 2, gain: 0.025 * v, dest: musicBus });
  },
  harmonica(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.93);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2400;
    flt.Q.value = 2;
    const g = ac.createGain();
    env(g, t, 0.03, 0.05 * v, 0.06, end);
    for (const [w, det] of [['p50', -6], ['sawtooth', 6]]) {
      const o = osc(w, f, t);
      o.detune.value = det;
      vibrato(o, t, d, 20, 6);
      o.connect(flt);
      o.start(t);
      o.stop(end + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // piano de saloon légèrement désaccordé
  piano(m, t, d, v = 1) {
    const f = mtof(m);
    const len = Math.min(1.6, d + 0.35);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(Math.min(9000, f * 9), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(300, f * 2), t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.11 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.035 * v, t + 0.18);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    for (const [w, det, lvl] of [['triangle', -9, 1], ['p25', 9, 0.35]]) {
      const o = osc(w, f, t);
      o.detune.value = det;
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(t + len + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // accords de piano : cordes pincées économiques (voir pluck)
  comp16(notes, t, d, v = 1) { for (const n of notes) pluck(mtof(n), t, Math.min(1, d + 0.3), 0.045 * v, { snap: 0.35 }); },
  harp(m, t, d, v = 1) {
    const f = mtof(m);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.07 * v, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.1);
    const o = osc('triangle', f, t), o2 = osc('sine', f * 2, t);
    const g2 = ac.createGain();
    g2.gain.value = 0.3;
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    for (const x of [o, o2]) { x.start(t); x.stop(t + 1.15); }
  },
  strings(notes, t, d, v = 1) {
    const end = t + d;
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 1500;
    const g = ac.createGain();
    env(g, t, Math.min(0.3, d / 3), 0.018 * v, Math.min(0.3, d / 3), end);
    for (const n of notes) {
      for (const det of [-8, 8]) {
        const o = osc('sawtooth', mtof(n), t);
        o.detune.value = det;
        o.connect(flt);
        o.start(t);
        o.stop(end + 0.03);
      }
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  bass16(m, t, d, v = 1) {
    pluck(mtof(m), t, Math.max(0.12, d * 0.9), 0.3 * v, { bright: 'p50', snap: 0.25, atkLen: 0.08, echo: false });
  },
  K16(t) { tone(t, 130, 0.18, { f2: 42, gain: 0.42, dest: musicBus }); },
  S16(t) {
    noise(t, 0.12, { type: 'bandpass', f: 2000, q: 1.2, gain: 0.25, dest: musicBus });
    tone(t, 190, 0.07, { type: 'triangle', gain: 0.08, dest: musicBus });
  },
  H16(t) { noise(t, 0.035, { type: 'highpass', f: 8000, gain: 0.06, dest: musicBus }); },
  O16(t) { noise(t, 0.2, { type: 'highpass', f: 7000, gain: 0.045, dest: musicBus }); },

  // ---- couleurs western
  // sifflement de cowboy : sinus qui "glisse" sur la note, gros vibrato, souffle
  whistle(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.1, d * 0.95);
    const o = osc('sine', f * 0.96, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    vibrato(o, t, d, 28, 6.2, 0.12);
    const g = ac.createGain();
    env(g, t, 0.04, 0.15 * v, 0.08, end);
    o.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    o.start(t);
    o.stop(end + 0.03);
    noise(t, Math.min(0.25, d), { type: 'bandpass', f: f * 1.5, q: 6, gain: 0.02 * v, dest: musicBus });
  },
  // trompette mariachi : deux dents de scie, filtre qui s'ouvre à l'attaque
  trumpet(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.92);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 3;
    flt.frequency.setValueAtTime(500, t);
    flt.frequency.exponentialRampToValueAtTime(3200, t + 0.05);
    flt.frequency.exponentialRampToValueAtTime(1900, t + 0.25);
    const g = ac.createGain();
    env(g, t, 0.03, 0.055 * v, 0.06, end);
    for (const det of [-7, 7]) {
      const o = osc('sawtooth', f, t);
      o.detune.value = det;
      vibrato(o, t, d, 18, 5.8, 0.22);
      o.connect(flt);
      o.start(t);
      o.stop(end + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // guitare baryton "twang" (16 bits) : attaque pincée, filtre qui se referme, écho
  twang16(m, t, d, v = 1) {
    const f = mtof(m);
    const len = Math.min(1.4, d + 0.4);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.Q.value = 4;
    flt.frequency.setValueAtTime(4200, t);
    flt.frequency.exponentialRampToValueAtTime(700, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.1 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.03 * v, t + 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    for (const [w, lvl] of [['p25', 0.7], ['triangle', 1]]) {
      const o = osc(w, f * 1.012, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      vibrato(o, t, d, 16, 5, 0.3);
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(t + len + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // guitare "twang" 8 bits : pulse avec volume qui décroît par paliers
  twang8(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.06, d * 0.95);
    const o = osc('p25', f * 1.02, t);
    o.frequency.setValueAtTime(f, t + 0.03);
    const lfo = vibrato(o, t, d, 30, 6, 0.25);
    const g = ac.createGain();
    const steps = [1, 0.75, 0.6, 0.5, 0.42, 0.36];
    steps.forEach((k, i) => g.gain.setValueAtTime(0.08 * v * k, t + i * 0.06));
    g.gain.setValueAtTime(0, end);
    o.connect(g).connect(musicBus);
    o.start(t);
    o.stop(end + 0.02);
    if (lfo) lfo.stop(end + 0.02);
  },
  // sabots de cheval (noix de coco), fouet, cloche d'église / enclume
  C8(t) { tone(t, 900, 0.045, { type: 'tri4', f2: 480, gain: 0.16, dest: musicBus }); },
  C16(t) {
    tone(t, 1100, 0.05, { type: 'sine', f2: 600, gain: 0.12, dest: musicBus });
    noise(t, 0.03, { type: 'bandpass', f: 2500, q: 3, gain: 0.08, dest: musicBus });
  },
  W8(t) {
    noise(t, 0.07, { type: 'bandpass', f: 900, f2: 5000, q: 2, gain: 0.05, dest: musicBus, buf: nesNoise, decay: false });
    noise(t + 0.07, 0.06, { type: 'highpass', f: 3000, gain: 0.3, dest: musicBus, buf: nesNoise });
  },
  W16(t) {
    noise(t, 0.07, { type: 'bandpass', f: 900, f2: 6000, q: 2, gain: 0.06, dest: musicBus, decay: false });
    noise(t + 0.07, 0.08, { type: 'highpass', f: 2500, gain: 0.35, dest: musicBus });
  },
  B8(t) { bell(t, 'p12', 0.05); },
  B16(t) { bell(t, 'sine', 0.09); },

  // ---- sonorités des grands westerns : voix, chœur, ocarina, guitare saturée, guimbarde, boîte à musique…
  // voix de soprano sans paroles : glisse sur la note, large vibrato qui arrive après l'attaque
  soprano(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.12, d * 0.97);
    const o = osc('sine', f * 0.985, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.09);
    const o2 = osc('triangle', f * 2, t);
    for (const x of [o, o2]) vibrato(x, t, d, 32, 5.6, 0.2);
    const g2 = ac.createGain();
    g2.gain.value = 0.12;
    const g = ac.createGain();
    env(g, t, 0.09, 0.14 * v, 0.12, end);
    o.connect(g);
    o2.connect(g2).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    for (const x of [o, o2]) { x.start(t); x.stop(end + 0.05); }
  },
  // chœur « aah » : dents de scie désaccordées passées dans deux formants de voyelle
  choir(notes, t, d, v = 1) {
    const end = t + d;
    const g = ac.createGain();
    env(g, t, Math.min(0.35, d / 3), 0.035 * v, Math.min(0.4, d / 3), end);
    const mix = ac.createGain();
    for (const [fq, q] of [[720, 5], [1180, 6]]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = fq;
      bp.Q.value = q;
      mix.connect(bp).connect(g);
    }
    for (const n of notes) {
      for (const det of [-10, 10]) {
        const o = osc('sawtooth', mtof(n), t);
        o.detune.value = det;
        vibrato(o, t, d, 10, 5, 0.3);
        o.connect(mix);
        o.start(t);
        o.stop(end + 0.05);
      }
    }
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // chant d'hommes en coup de poing (« hé ! ») : un chœur court sur la note et sa quinte
  chant(m, t, d, v = 1) { INST.choir([m, m + 7, m + 12], t, Math.min(d, 0.5), 4.5 * v); },
  // ocarina : sinus rond, un soupçon de souffle et de troisième harmonique
  ocarina(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.94);
    const o = osc('sine', f, t), o3 = osc('sine', f * 3, t);
    vibrato(o, t, d, 12, 5, 0.25);
    const g3 = ac.createGain();
    g3.gain.value = 0.06;
    const g = ac.createGain();
    env(g, t, 0.03, 0.15 * v, 0.06, end);
    o.connect(g);
    o3.connect(g3).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    for (const x of [o, o3]) { x.start(t); x.stop(end + 0.03); }
    noise(t, 0.05, { type: 'bandpass', f: f * 2, q: 3, gain: 0.03 * v, dest: musicBus });
  },
  // guitare électrique saturée (fuzz) : saturation douce, filtre, tremolo
  fuzz(m, t, d, v = 1) {
    const f = mtof(m);
    const len = Math.min(1.6, d + 0.25);
    const sh = ac.createWaveShaper();
    sh.curve = fuzzCurve();
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(3000, t);
    flt.frequency.exponentialRampToValueAtTime(1200, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.045 * v, t + 0.01);
    g.gain.setValueAtTime(0.045 * v, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    const pre = ac.createGain();
    pre.gain.value = 0.7;
    for (const [w, det] of [['sawtooth', -5], ['p50', 5]]) {
      const o = osc(w, f, t);
      o.detune.value = det;
      vibrato(o, t, d, 14, 5.5, 0.3);
      o.connect(pre);
      o.start(t);
      o.stop(t + len + 0.03);
    }
    pre.connect(sh).connect(flt).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // guimbarde : « boïng » obtenu en balayant un filtre étroit sur les harmoniques
  jawharp(m, t, d, v = 1) {
    const f = mtof(m);
    const len = Math.min(1.1, Math.max(0.25, d));
    const o = osc('sawtooth', f, t);
    const flt = ac.createBiquadFilter();
    flt.type = 'bandpass';
    flt.Q.value = 6;
    flt.frequency.setValueAtTime(f * 3, t);
    flt.frequency.exponentialRampToValueAtTime(f * 10, t + len * 0.35);
    flt.frequency.exponentialRampToValueAtTime(f * 4, t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9 * v, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(flt).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    o.start(t);
    o.stop(t + len + 0.03);
  },
  // boîte à musique (montre à gousset) : lames métalliques aiguës, extinction rapide
  musicbox(m, t, d, v = 1) {
    const f = mtof(m);
    for (const [k, lvl, len] of [[1, 1, 1.2], [2, 0.25, 0.7], [4, 0.16, 0.35]]) {
      const o = osc('sine', f * k, t);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.18 * v * lvl, t + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0005, t + len);
      o.connect(g);
      g.connect(musicBus);
      g.connect(echoIn);
      o.start(t);
      o.stop(t + len + 0.02);
    }
  },
  // guitare espagnole (cordes nylon) : note pincée, filtre qui se referme
  nylon(m, t, d, v = 1) {
    const f = mtof(m);
    const len = Math.min(1.3, d + 0.35);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.setValueAtTime(Math.min(6000, f * 8), t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(400, f * 1.5), t + len);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.22 * v, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.075 * v, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    for (const [w, lvl] of [['triangle', 1], ['p50', 0.18]]) {
      const o = osc(w, f, t);
      vibrato(o, t, d, 10, 5, 0.35);
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(t + len + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // accord gratté (cordes nylon) : les cordes partent l'une après l'autre
  strum(notes, t, d, v = 1) {
    [notes[0] - 12, ...notes].forEach((n, i) => pluck(mtof(n), t + i * 0.016, Math.min(0.85, d + 0.3), 0.045 * v, { bright: 'p50', snap: 0.3 }));
  },
  // cri « aah-ii-ah » d'un coyote (chœur d'hommes qui monte à la quinte puis retombe), sur la note du morceau
  Yh8(m, t) { howl(t, 'p25', 0.045, false, mtof(m)); },
  Yh16(m, t) { howl(t, 'sawtooth', 0.11, true, mtof(m)); },
  // tambourin, enclume
  T8(t) { noise(t, 0.06, { type: 'highpass', f: 7000, gain: 0.06, dest: musicBus, buf: nesNoise }); },
  T16(t) { for (let i = 0; i < 3; i++) noise(t + i * 0.012, 0.09, { type: 'bandpass', f: 6500 + i * 1200, q: 4, gain: 0.07, dest: musicBus }); },
  A8(t) { tone(t, 1760, 0.12, { type: 'square', gain: 0.025, dest: musicBus }); tone(t, 2640, 0.08, { type: 'square', gain: 0.015, dest: musicBus }); },
  A16(t) {
    for (const [f, lvl, len] of [[1180, 1, 0.5], [1870, 0.6, 0.35], [3150, 0.35, 0.2]]) tone(t, f, len, { gain: 0.06 * lvl, dest: musicBus });
    noise(t, 0.02, { type: 'highpass', f: 4000, gain: 0.12, dest: musicBus });
  },

  // ---- instruments de la prairie : banjo, violon (fiddle), accordéon, sifflet de locomotive
  // banjo : corde métallique pincée sur une peau tendue, très brillante, s'éteint vite
  banjo(m, t, d, v = 1) {
    pluck(mtof(m), t, Math.min(0.55, d + 0.2), 0.1 * v, { snap: 0.9, atkLen: 0.09 });
    noise(t, 0.012, { type: 'highpass', f: 3500, gain: 0.04 * v, dest: musicBus });
  },
  // roulement de banjo : l'accord égrené en doubles croches (pouce, index, majeur, aigu)
  roll(notes, t, d, v = 1) {
    [notes[0], notes[1], notes[2], notes[0] + 12].forEach((n, i) => pluck(mtof(n), t + (i * d) / 4, Math.min(0.45, d / 4 + 0.2), 0.05 * v, { snap: 0.8 }));
  },
  // violon de bal : deux dents de scie qui glissent sur la note, vibrato, bruit d'archet
  fiddle(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.96);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 3200;
    const hp = ac.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    const g = ac.createGain();
    const fast = d < 0.25;
    env(g, t, Math.min(0.06, d / 4), (fast ? 0.085 : 0.06) * v, 0.06, end);
    for (const det of fast ? [0] : [-6, 6]) {
      const o = osc('sawtooth', f * 0.98, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.05);
      o.detune.value = det;
      vibrato(o, t, d, 18, 6, 0.15);
      o.connect(flt);
      o.start(t);
      o.stop(end + 0.05);
    }
    flt.connect(hp).connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
    if (!fast) noise(t, Math.min(d, 0.25), { type: 'bandpass', f: Math.min(8000, f * 4), q: 2, gain: 0.012 * v, dest: musicBus });
  },
  // accordéon de cantina : deux anches désaccordées (le « musette » qui ondule) et une anche grave
  accordion(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.9);
    const flt = ac.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = 2600;
    const g = ac.createGain();
    env(g, t, 0.025, 0.035 * v, 0.05, end);
    for (const [w, k, det, lvl] of [['p50', 1, -12, 1], ['p50', 1, 12, 1], ['p25', 0.5, 0, 0.5]]) {
      const o = osc(w, f * k, t);
      o.detune.value = det;
      const og = ac.createGain();
      og.gain.value = lvl;
      o.connect(og).connect(flt);
      o.start(t);
      o.stop(end + 0.03);
    }
    flt.connect(g);
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // accords d'accordéon piqués (le « pah » de la polka)
  squeeze(notes, t, d, v = 1) { for (const n of notes) INST.accordion(n, t, Math.min(d, 0.22), 0.45 * v); },
  // sifflet de locomotive 8 bits : trois pulses en accord mineur
  horn8(m, t, d, v = 1) { for (const k of [0, 3, 7]) chipNote('p12', mtof(m + k), t, d, 0.03 * v, { vib: 12 }); },
  // feu de camp qui crépite, grillons dans la nuit
  F16(t) {
    for (let i = 0; i < 3; i++) {
      if (Math.random() < 0.3) continue;
      noise(t + Math.random() * 0.4, 0.008 + Math.random() * 0.012, { type: 'highpass', f: 1500 + Math.random() * 3500, gain: 0.05 + Math.random() * 0.07, dest: musicBus });
    }
  },
  Q16(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.045, 4300, 0.03, { gain: 0.03, dest: musicBus }); },

  // ---- western métal (Doom-like) : guitares saturées, orgue du diable, cymbale, gong
  // accord de puissance (fondamentale + quinte) dans l'ampli saturé : étouffé de la paume sur les notes courtes,
  // laissé sonner sur les longues
  chug(m, t, d, v = 1) {
    const open = d >= 0.3;
    const len = open ? Math.min(1.6, d * 0.95) : Math.min(0.16, d * 0.95);
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = open ? 3000 : 1000;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.7 * v, t + 0.003);
    if (open) g.gain.setValueAtTime(0.7 * v, t + len * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    for (const k of [0, 7]) {
      const o = osc('sawtooth', mtof(m + k), t);
      o.connect(lp);
      o.start(t);
      o.stop(t + len + 0.02);
    }
    lp.connect(g).connect(driveR);
  },
  // guitare solo qui hurle : les notes longues partent un ton en dessous et montent (bend), large vibrato
  wail(m, t, d, v = 1) {
    const f = mtof(m);
    const end = t + Math.max(0.08, d * 0.95);
    const bend = d > 0.4;
    const o = osc('sawtooth', bend ? f * 0.891 : f, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(f, t + 0.12);
    vibrato(o, t, d, 38, 6, 0.3);
    const g = ac.createGain();
    env(g, t, 0.01, 0.45 * v, 0.06, end);
    o.connect(g).connect(driveL);
    o.start(t);
    o.stop(end + 0.03);
  },
  // orgue d'église (tirettes 16', 8', 4') avec un tremolo lent : la messe noire d'El Diablo
  organ(notes, t, d, v = 1) {
    const end = t + d;
    const g = ac.createGain();
    env(g, t, 0.06, 0.022 * v, 0.12, end);
    const lfo = ac.createOscillator();
    lfo.frequency.value = 5.5;
    const lg = ac.createGain();
    lg.gain.value = 0.006 * v;
    lfo.connect(lg).connect(g.gain);
    lfo.start(t);
    lfo.stop(end + 0.05);
    for (const n of notes) {
      for (const [k, lvl] of [[0.5, 0.7], [1, 1], [2, 0.45]]) {
        const o = osc('sine', mtof(n) * k, t);
        const og = ac.createGain();
        og.gain.value = lvl;
        o.connect(og).connect(g);
        o.start(t);
        o.stop(end + 0.05);
      }
    }
    g.connect(musicBus);
    g.connect(echoIn);
  },
  // cymbale crash, gong (tam-tam) qui gronde longtemps
  X8(t) { noise(t, 0.8, { type: 'highpass', f: 5000, gain: 0.08, dest: musicBus, buf: nesNoise }); },
  X16(t) {
    noise(t, 1.2, { type: 'highpass', f: 4500, gain: 0.1, dest: musicBus });
    noise(t, 0.3, { type: 'bandpass', f: 3000, q: 1, gain: 0.08, dest: musicBus });
  },
  G8(t) { tone(t, 110, 1.5, { type: 'tri4', f2: 98, gain: 0.2, dest: musicBus }); noise(t, 0.8, { f: 800, f2: 200, gain: 0.1, dest: musicBus, buf: nesNoise }); },
  G16(t) {
    for (const [f, lvl, len] of [[73, 1, 3.2], [104, 0.7, 2.8], [151, 0.5, 2.3], [217, 0.35, 1.8], [347, 0.2, 1.2]]) {
      tone(t, f, len, { f2: f * 0.98, gain: 0.09 * lvl, dest: musicBus, attack: 0.03 });
    }
    noise(t, 2, { type: 'bandpass', f: 700, f2: 250, q: 1, gain: 0.1, dest: musicBus });
  },
};

const CURVES = {};
function driveCurve(k) {
  if (CURVES[k]) return CURVES[k];
  const c = (CURVES[k] = new Float32Array(1024));
  for (let i = 0; i < 1024; i++) c[i] = Math.tanh(((i / 1023) * 2 - 1) * k);
  return c;
}
const fuzzCurve = () => driveCurve(4);

// ampli saturé partagé : saturation -> coupe-bas -> baffle (passe-bas) -> bus musique (+ écho pour les solos)
function driveChain(k, lpF, out, echo) {
  const inp = ac.createGain();
  const sh = ac.createWaveShaper();
  sh.curve = driveCurve(k);
  sh.oversample = '2x';
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 90;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lpF;
  lp.Q.value = 1.2;
  const g = ac.createGain();
  g.gain.value = out;
  inp.connect(sh).connect(hp).connect(lp).connect(g).connect(musicBus);
  if (echo) {
    const s = ac.createGain();
    s.gain.value = echo;
    g.connect(s).connect(echoIn);
  }
  return inp;
}

// cri de coyote : la hauteur monte d'une quinte puis redescend ; en 16 bits, les formants passent de « a » à « i »
function howl(t, wave, gain, formant, f) {
  const o = osc(wave, f, t);
  o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.25);
  o.frequency.setValueAtTime(f * 1.5, t + 0.45);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.8);
  vibrato(o, t, 0.95, 25, 6, 0.1);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.05);
  g.gain.setValueAtTime(gain, t + 0.7);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
  if (formant) {
    for (const [a, b, q] of [[700, 330, 5], [1100, 2300, 6]]) {
      const bp = ac.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      bp.frequency.setValueAtTime(a, t);
      bp.frequency.exponentialRampToValueAtTime(b, t + 0.3);
      bp.frequency.setValueAtTime(b, t + 0.45);
      bp.frequency.exponentialRampToValueAtTime(a, t + 0.8);
      o.connect(bp).connect(g);
    }
  } else o.connect(g);
  g.connect(musicBus);
  g.connect(echoIn);
  o.start(t);
  o.stop(t + 1);
}

// cloche : partiels inharmoniques qui s'éteignent lentement
function bell(t, wave, gain) {
  const f = 440;
  for (const [k, lvl, len] of [[1, 1, 1.8], [2.76, 0.5, 1.1], [5.4, 0.25, 0.6]]) {
    const o = osc(wave, f * k, t);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain * lvl, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + len);
    o.connect(g).connect(musicBus);
    g.connect(echoIn);
    o.start(t);
    o.stop(t + len + 0.02);
  }
}

// ------------------------------------------------------------------ partitions
// Mélodie : "Note:durée" (durée en pas, Note = E5, F#4, Bb3…), "-" = silence, "|" ignoré.
// Grille d'accords : un accord par mesure, "C.G7" = deux accords sur la mesure.
// Motifs (répétés à chaque mesure) : basse R/3/5/8 ; accomp c (accord) ou 1/3/5/7/8 ; batterie K/S/H/O.
const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], m7: [0, 3, 7, 10], dim: [0, 3, 6], maj7: [0, 4, 7, 11] };
function parseChord(name) {
  const m = /^([A-G])(#|b)?(.*)$/.exec(name);
  const pc = (PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
  return { pc, iv: QUAL[m[3]] };
}
const toks = (str) => str.split(/\s+/).filter((x) => x && x !== '|').map((tok) => {
  const [n, l] = tok.split(':');
  return [n, l === undefined ? 1 : +l];
});

const STYLE = {
  '8bit': { lead: 'lead8', echo: 'echo8', bass: 'bass8', comp: 'comp8', tone: 'lead8b', drum: '8' },
  '16bit': { lead: 'flute', bass: 'bass16', comp: 'comp16', tone: 'harp', pad: 'strings', drum: '16' },
};

// Compile un morceau en une liste d'événements triés { s: pas, d: durée, fn, arg, v, when }
function compile(song) {
  const st = { ...STYLE[song.style], ...song.inst };
  const bar = song.bar;
  const chords = song.chords.trim().split(/\s+/).map((b) => b.split('.').map(parseChord));
  const total = chords.length * bar;
  const ev = [];
  const chordAt = (s) => {
    const segs = chords[Math.floor(s / bar)];
    return segs[Math.floor(((s % bar) / bar) * segs.length)];
  };
  const bassNote = (c) => 40 + ((c.pc - 4 + 12) % 12);
  const compRoot = (c) => 55 + ((c.pc - 7 + 12) % 12);
  const deg = (c, k) => ({ R: 0, 1: 0, 3: c.iv[1], 5: c.iv[2], 7: c.iv[3] ?? 10, 8: 12 }[k]);

  let s = 0;
  for (const [n, l] of toks(song.melody)) {
    if (n !== '-') {
      const m = noteNum(n) + (song.transpose || 0);
      ev.push({ s, d: l, fn: st.lead, arg: m, when: song.altLead ? 'even' : 'all' });
      if (song.altLead) ev.push({ s, d: l, fn: st.lead, arg: m + song.altLead, when: 'odd' });
      if (st.echo) ev.push({ s: s + (song.echoDelay || 2), d: l, fn: st.echo, arg: m, when: 'odd' });
    }
    s += l;
  }
  if (s !== total) throw new Error(`${song.title}: mélodie ${s} pas ≠ ${total}`);

  // voix supplémentaires (contre-chant, riff, chœur) : { inst, melody, v }
  for (const vc of song.voices || []) {
    let s2 = 0;
    for (const [n, l] of toks(vc.melody)) {
      if (n !== '-') ev.push({ s: s2, d: l, fn: vc.inst, arg: noteNum(n) + (song.transpose || 0), v: vc.v ?? 1 });
      s2 += l;
    }
    if (s2 !== total) throw new Error(`${song.title}: voix ${vc.inst} ${s2} pas ≠ ${total}`);
  }

  // only : ne jouer le motif que sur certaines mesures (drumsB = mesures impaires)
  const pattern = (str, fn, only = null) => {
    const p = toks(str);
    const len = p.reduce((a, [, l]) => a + l, 0);
    if (len !== bar) throw new Error(`${song.title}: motif "${str}" ${len} ≠ ${bar}`);
    for (let b = 0; b < chords.length; b++) {
      if (only && !only(b)) continue;
      let o = 0;
      for (const [k, l] of p) {
        const at = b * bar + o;
        if (k !== '-') fn(k, at, l, chordAt(at));
        o += l;
      }
    }
  };
  if (song.bass) pattern(song.bass, (k, at, l, c) => ev.push({ s: at, d: l, fn: st.bass, arg: bassNote(c) + deg(c, k) }));
  if (song.comp) {
    pattern(song.comp, (k, at, l, c) => {
      const r = compRoot(c);
      if (k === 'c') ev.push({ s: at, d: l, fn: st.comp, arg: c.iv.map((i) => r + i) });
      else ev.push({ s: at, d: l, fn: st.tone, arg: r + deg(c, k), v: 0.8 });
    });
  }
  if (st.pad && song.pad !== false) {
    chords.forEach((segs, b) => segs.forEach((c, i) => {
      const r = compRoot(c);
      ev.push({ s: b * bar + (i * bar) / segs.length, d: bar / segs.length, fn: st.pad, arg: c.iv.slice(0, 3).map((x) => r + x) });
    }));
  }
  // Y = cri de coyote, sur la note song.howl
  const drum = (k, at) => ev.push(k === 'Y' ? { s: at, d: 1, fn: 'Yh' + st.drum, arg: noteNum(song.howl || 'A4') } : { s: at, d: 0, fn: k + st.drum, role: 'KSWABXG'.includes(k) ? 'loud' : null });
  if (song.drums) pattern(song.drums, drum, song.drumsB ? (b) => b % 2 === 0 : null);
  if (song.drumsB) pattern(song.drumsB, drum, (b) => b % 2 === 1);
  // couche de tension (jouée seulement quand ça chauffe) : grosse caisse sur le temps, tambourin à contretemps,
  // roulement de caisse claire toutes les 4 mesures
  for (let b = 0; b < chords.length; b++) {
    const at = b * bar;
    ev.push({ s: at, d: 0, fn: 'K' + st.drum, role: 'boost' });
    for (let o = 2; o < bar; o += 4) ev.push({ s: at + o, d: 0, fn: 'T' + st.drum, role: 'boost' });
    if (b % 4 === 3) for (let k = 4; k >= 1; k--) ev.push({ s: at + bar - k, d: 0, fn: 'S' + st.drum, role: 'boost' });
  }
  ev.sort((a, b) => a.s - b.s);
  return { ...song, total, ev };
}

// Ligne d'accompagnement (riff, guimbarde, chant) : une mesure par accord, tirée d'un dictionnaire accord → mesure
const riff = (chords, shapes) => chords.trim().split(/\s+/).map((c) => shapes[c]).join(' | ');

// Compositions originales façon western spaghetti (mineur, cadence andalouse, galop, sifflement, trompette)
const SONGS = {
  // Menu : sifflement solitaire sur la plaine, sabots au pas
  poussiere: {
    title: "Poussière de l'Ouest", style: '16bit', bpm: 84, div: 4, bar: 16, loops: 2,
    inst: { lead: 'whistle' },
    melody:
      'E5:8 A5:4 B5:2 C6:2 | B5:6 A5:2 E5:8 | D5:4 G5:4 B5:4 A5:2 G5:2 | A5:12 -:4 |' +
      'C6:8 B5:2 A5:2 F5:4 | A5:6 G5:2 F5:8 | E5:4 G#5:4 B5:4 D6:4 | C6:2 B5:2 G#5:4 E5:8 |' +
      'A5:4 C6:4 E6:8 | D6:2 C6:2 G5:12 | B5:4 D6:4 B5:2 A5:2 G5:4 | G#5:8 -:4 E5:4 |' +
      'F5:4 A5:4 C6:6 B5:2 | D6:4 B5:4 G5:8 | A5:4 E5:4 G#5:4 B5:4 | A5:12 -:4',
    chords: 'Am Am G G F F E E Am C G E F G Am.E Am',
    bass: 'R:4 5:4 R:4 5:4',
    comp: '1:2 5:2 8:2 3:2 5:2 8:2 5:2 3:2',
    drums: 'K:4 C:2 C:2 K:4 C:2 C:2',
  },
  // Menu : trompette mariachi et guitare twang au saloon
  coyote: {
    title: 'Le Saloon du Coyote', style: '16bit', bpm: 96, div: 4, bar: 16, loops: 2,
    inst: { lead: 'trumpet', tone: 'twang16' }, pad: false,
    melody:
      'D5:2 -:2 A4:2 D5:2 F5:4 E5:2 D5:2 | A5:8 G5:2 F5:2 E5:4 | E5:2 -:2 C5:2 E5:2 G5:4 F5:2 E5:2 | G5:12 -:4 |' +
      'F5:2 -:2 D5:2 F5:2 Bb5:4 A5:2 G5:2 | F5:6 D5:2 Bb4:8 | A4:2 C#5:2 E5:2 A5:2 G5:2 F5:2 E5:2 C#5:2 | A5:12 -:4 |' +
      'D6:4 C6:2 A5:2 F5:4 A5:4 | D6:8 -:4 A5:4 | Bb5:4 A5:2 G5:2 D5:4 G5:4 | Bb5:8 A5:4 G5:4 |' +
      'F5:4 E5:2 D5:2 A5:8 | G5:2 F5:2 E5:2 C#5:2 E5:4 A4:4 | D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 E5:2 | D5:12 -:4',
    chords: 'Dm Dm C C Bb Bb A A Dm Dm Gm Gm Dm A Dm Dm',
    bass: 'R:4 5:2 5:2 R:4 5:2 5:2',
    comp: '1:4 c:4 5:4 c:4',
    drums: 'K:4 C:2 C:2 S:4 C:2 W:2',
  },
  // Partie : galop 8 bits, guitare twang, ça accélère à chaque tour
  duel: {
    title: 'Duel au Soleil', style: '8bit', bpm: 132, div: 4, bar: 16, loops: 4, accel: 1.05,
    inst: { lead: 'twang8' }, echoDelay: 3,
    melody:
      'E5:2 E5:1 E5:1 G5:2 B5:2 A5:4 G5:2 F#5:2 | E5:8 B4:4 E5:4 | G5:2 G5:1 G5:1 E5:2 G5:2 C6:4 B5:2 A5:2 | F#5:8 D5:4 A5:4 |' +
      'B5:2 B5:1 B5:1 A5:2 G5:2 F#5:2 G5:2 A5:4 | G5:2 F#5:2 E5:4 B4:8 | C5:2 E5:2 G5:2 C6:2 B5:2 G5:2 E5:4 | D#5:4 F#5:4 B5:8 |' +
      'A5:4 C6:4 B5:2 A5:2 E5:4 | C6:2 B5:2 A5:2 G5:2 A5:8 | B5:4 G5:4 E5:4 G5:4 | B5:12 -:4 |' +
      'C6:4 B5:2 A5:2 G5:4 E5:4 | D#6:4 B5:4 F#5:4 D#5:4 | E5:2 E5:1 E5:1 G5:2 B5:2 E6:8 | E6:4 -:4 E5:2 E5:1 E5:1 -:4',
    chords: 'Em Em C D Em Em C B Am Am Em Em C B Em Em',
    bass: 'R:2 R:1 R:1 5:2 5:1 5:1 R:2 R:1 R:1 8:2 5:1 5:1',
    comp: '-:4 c:2 -:2 -:4 c:2 -:2',
    drums: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 S:2 W:2',
  },
  // Partie : glas, trompette et cordes, la tension monte
  glas: {
    title: 'Le Glas de Boot Hill', style: '16bit', bpm: 112, div: 4, bar: 16, loops: 3, accel: 1.06,
    inst: { lead: 'trumpet', tone: 'twang16' },
    melody:
      'A4:4 C5:4 E5:4 A5:4 | G#5:2 A5:2 B5:4 A5:8 | A5:4 C6:4 A5:2 G5:2 F5:4 | C6:12 -:4 |' +
      'B5:4 D6:4 B5:2 A5:2 G5:4 | D6:8 B5:4 G5:4 | G#5:4 B5:4 E6:8 | D6:2 C6:2 B5:2 G#5:2 E5:8 |' +
      'E6:6 D6:2 C6:4 B5:4 | C6:4 B5:2 A5:2 E5:8 | F5:4 A5:4 D6:6 C6:2 | A5:12 -:4 |' +
      'C6:4 A5:4 F5:4 A5:4 | B5:4 D6:4 G6:8 | E6:2 D6:2 B5:2 G#5:2 E6:8 | E6:12 -:4',
    chords: 'Am Am F F G G E E Am Am Dm Dm F G E E',
    bass: 'R:2 R:2 5:2 R:2 8:2 R:2 5:2 R:2',
    comp: '1:2 c:2 5:2 c:2 8:2 c:2 5:2 c:2',
    drums: 'B:4 H:2 H:2 S:4 H:2 W:2',
  },

  // ---- compositions originales aux sonorités des grands westerns (voix, chœur, guitare saturée, guimbarde…)
  // Partie : une voix de soprano s'envole sur une harpe obstinée et un chœur ; les caisses claires montent
  collines: {
    title: "L'Or des Collines", style: '16bit', bpm: 104, div: 4, bar: 16, loops: 3, accel: 1.04,
    inst: { lead: 'soprano', tone: 'harp', pad: 'choir' },
    melody:
      'G5:6 Ab5:2 G5:4 Eb5:4 | C6:8 Bb5:4 G5:4 | Ab5:6 C6:2 Eb6:8 | D6:4 C6:4 Ab5:8 |' +
      'F5:6 Ab5:2 C6:4 F6:4 | Eb6:4 D6:2 C6:2 Ab5:8 | B5:8 D6:4 F6:4 | G6:12 -:4 |' +
      'Eb6:6 D6:2 C6:4 G5:4 | Ab5:4 G5:4 Eb5:8 | G5:6 Bb5:2 Eb6:8 | F6:4 Eb6:4 D6:4 Bb5:4 |' +
      'C6:6 Eb6:2 Ab6:8 | G6:4 F6:4 Eb6:4 C6:4 | D6:6 F6:2 B5:8 | G5:12 -:4',
    chords: 'Cm Cm Ab Ab Fm Fm G G Cm Cm Eb Eb Ab Fm G G',
    bass: 'R:4 R:2 5:2 R:4 8:2 5:2',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'K:4 H:2 H:2 S:4 H:2 S:1 S:1',
    drumsB: 'K:4 H:2 H:2 S:4 S:1 S:1 S:1 S:1',
  },
  // Partie : ocarina, cri de coyote, guitare saturée, sabots, tambourin et coups de fouet
  cri: {
    title: 'Le Cri du Coyote', style: '16bit', bpm: 116, div: 4, bar: 16, loops: 3, howl: 'A4',
    inst: { lead: 'ocarina', tone: 'twang16', pad: 'choir' },
    melody:
      'A4:2 D5:2 A5:8 -:4 | G5:2 F5:2 E5:2 D5:2 A4:8 | G4:2 C5:2 G5:8 -:4 | F5:2 E5:2 D5:2 C5:2 G4:8 |' +
      'F4:2 Bb4:2 F5:6 E5:2 D5:4 | C5:4 D5:4 Bb4:8 | A4:2 C#5:2 E5:2 A5:6 G5:2 F5:2 | E5:12 -:4 |' +
      'D6:6 C6:2 A5:4 F5:4 | G5:4 F5:2 E5:2 D5:8 | C6:6 A5:2 F5:4 C5:4 | D5:4 E5:2 F5:2 A5:8 |' +
      'Bb5:6 A5:2 G5:4 D5:4 | E5:4 F5:2 G5:2 A5:4 C#6:4 | D6:8 A5:4 F5:4 | D5:12 -:4',
    chords: 'Dm Dm C C Bb Bb A A Dm Dm F F Gm A Dm Dm',
    voices: [{
      inst: 'fuzz', v: 1.1,
      melody: riff('Dm Dm C C Bb Bb A A Dm Dm F F Gm A Dm Dm', {
        Dm: 'D3:2 -:1 D3:1 F3:2 G3:2 A3:4 -:4', C: 'C3:2 -:1 C3:1 E3:2 F3:2 G3:4 -:4',
        Bb: 'Bb2:2 -:1 Bb2:1 D3:2 Eb3:2 F3:4 -:4', A: 'A2:2 -:1 A2:1 C#3:2 D3:2 E3:4 -:4',
        F: 'F3:2 -:1 F3:1 A3:2 Bb3:2 C4:4 -:4', Gm: 'G3:2 -:1 G3:1 Bb3:2 C4:2 D4:4 -:4',
      }),
    }],
    bass: 'R:4 -:4 5:4 -:4',
    comp: '1:4 -:4 5:2 8:2 -:4',
    drums: 'C:2 C:1 C:1 C:2 C:1 C:1 T:2 C:1 C:1 W:2 C:2',
    drumsB: 'Y:8 C:2 C:1 C:1 T:2 C:2',
  },
  // Menu : valse de la montre à gousset (boîte à musique), guimbarde et sifflement qui répond
  montre: {
    title: 'La Montre à Gousset', style: '16bit', bpm: 80, div: 4, bar: 12, loops: 2,
    inst: { lead: 'musicbox' },
    melody:
      'D6:3 Bb5:3 G5:3 D5:3 | G5:2 A5:1 Bb5:3 D6:6 | C6:3 Eb6:3 G6:3 Eb6:3 | D6:2 C6:1 Bb5:3 G5:6 |' +
      'A5:3 C6:3 F#6:3 D6:3 | C6:2 Bb5:1 A5:3 F#5:6 | G5:3 Bb5:3 D6:6 | G6:9 -:3 |' +
      'G6:3 F6:3 Eb6:3 Bb5:3 | C6:2 Bb5:1 G5:3 Eb5:6 | F5:3 Bb5:3 D6:3 F6:3 | Eb6:2 D6:1 C6:3 Bb5:6 |' +
      'C6:3 Eb6:3 G6:6 | F#6:3 Eb6:3 C6:3 A5:3 | Bb5:3 A5:3 G5:3 D5:3 | G5:9 -:3',
    chords: 'Gm Gm Cm Cm D D Gm Gm Eb Eb Bb Bb Cm D Gm Gm',
    voices: [
      {
        inst: 'jawharp',
        melody: riff('Gm Gm Cm Cm D D Gm Gm Eb Eb Bb Bb Cm D Gm Gm', {
          Gm: 'G2:3 -:3 D3:3 -:3', Cm: 'C3:3 -:3 G2:3 -:3', D: 'D3:3 -:3 A2:3 -:3', Eb: 'Eb3:3 -:3 Bb2:3 -:3', Bb: 'Bb2:3 -:3 F3:3 -:3',
        }),
      },
      {
        inst: 'whistle', v: 0.8,
        melody: '-:12 | -:12 | -:12 | -:6 D5:3 Bb4:3 | -:12 | -:12 | -:12 | -:3 Bb4:3 D5:6 |' +
          '-:12 | -:12 | -:12 | -:6 F5:3 D5:3 | -:12 | -:12 | -:12 | -:3 D5:3 G4:6',
      },
    ],
    bass: 'R:6 5:6',
    drums: 'C:3 C:3 C:3 C:3',
    drumsB: 'B:3 C:3 C:3 C:3',
  },
  // Menu : ballade de cow-boy, guitare espagnole grattée, basse qui alterne, l'harmonica répond
  colt: {
    title: 'Le Colt du Shérif', style: '16bit', bpm: 100, div: 4, bar: 16, loops: 2,
    inst: { lead: 'nylon', comp: 'strum' }, pad: false,
    melody:
      'B4:4 E5:2 E5:2 E5:4 D5:2 E5:2 | G5:6 F#5:2 E5:8 | A4:4 C5:2 C5:2 C5:4 B4:2 C5:2 | E5:6 D5:2 C5:8 |' +
      'D5:2 F#5:2 A5:4 A5:4 G5:2 F#5:2 | E5:4 F#5:4 D5:8 | B4:2 D5:2 G5:6 F#5:2 E5:2 D5:2 | B4:12 -:4 |' +
      'E5:4 G5:2 G5:2 G5:4 F#5:2 E5:2 | E5:6 D5:2 C5:8 | C5:2 E5:2 A5:6 G5:2 E5:4 | C5:4 B4:4 A4:8 |' +
      'B4:2 D#5:2 F#5:4 A5:4 G5:2 F#5:2 | F#5:12 -:4 | E5:4 G5:2 B5:6 A5:2 G5:2 | E5:12 -:4',
    chords: 'Em Em Am Am D D G G C C Am Am B7 B7 Em Em',
    voices: [{
      inst: 'harmonica',
      melody: '-:16 | -:8 B4:4 G4:4 | -:16 | -:8 A4:4 E4:4 | -:16 | -:8 A4:4 F#4:4 | -:16 | -:4 D5:4 B4:4 G4:4 |' +
        '-:16 | -:8 G4:4 E4:4 | -:16 | -:8 E4:4 C5:4 | -:16 | -:4 A4:4 B4:4 D#5:4 | -:16 | -:4 B4:4 G4:4 E4:4',
    }],
    bass: 'R:4 5:4 R:4 5:4',
    comp: 'c:4 c:2 c:2 c:4 c:2 c:2',
    drums: 'K:4 H:2 H:2 S:4 H:2 H:2',
  },
  // Partie : sifflement sous le soleil, chant d'hommes en coups de poing, enclume, cloche et fouet au galop
  plomb: {
    title: 'Sous le Soleil de Plomb', style: '16bit', bpm: 124, div: 4, bar: 16, loops: 3, accel: 1.04,
    inst: { lead: 'whistle', tone: 'twang16' }, pad: false,
    melody:
      'F#5:4 B5:4 D6:2 C#6:2 B5:4 | F#5:8 -:4 B4:4 | G5:4 B5:4 D6:2 E6:2 D6:4 | B5:12 -:4 |' +
      'A5:4 C#6:4 E6:4 D6:2 C#6:2 | E6:8 C#6:4 A5:4 | F#5:2 A#5:2 C#6:2 F#6:6 E6:2 C#6:2 | C#6:12 -:4 |' +
      'B5:6 A5:2 F#5:4 D5:4 | E5:4 F#5:4 B4:8 | G5:6 F#5:2 E5:4 B4:4 | C6:4 B5:4 G5:8 |' +
      'D6:4 B5:4 G5:4 B5:4 | C#6:4 E6:4 A6:8 | F#6:6 E6:2 D6:4 C#6:4 | B5:12 -:4',
    chords: 'Bm Bm G G A A F# F# Bm Bm Em Em G A Bm Bm',
    voices: [{
      inst: 'chant',
      melody: riff('Bm Bm G G A A F# F# Bm Bm Em Em G A Bm Bm', {
        Bm: 'B3:4 -:4 B3:4 -:4', G: 'G3:4 -:4 G3:4 -:4', A: 'A3:4 -:4 A3:4 -:4', 'F#': 'F#3:4 -:4 F#3:4 -:4', Em: 'E3:4 -:4 E3:4 -:4',
      }),
    }],
    bass: 'R:2 R:2 5:2 R:2 R:2 R:2 5:2 8:2',
    comp: '1:4 5:4 8:4 5:4',
    drums: 'K:2 C:1 C:1 A:2 C:1 C:1 K:2 C:1 C:1 W:2 C:2',
    drumsB: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 B:4',
  },
  // Partie : chevauchée de nuit en 8 bits, guitare twang, guimbarde et galop qui accélère
  nocturne: {
    title: 'Chevauchée Nocturne', style: '8bit', bpm: 144, div: 4, bar: 16, loops: 4, accel: 1.05,
    inst: { lead: 'twang8' }, echoDelay: 3,
    melody:
      'G5:2 G5:1 G5:1 Bb5:2 D6:2 C6:2 Bb5:2 A5:2 G5:2 | D5:4 G5:4 Bb5:8 | Eb5:2 Eb5:1 Eb5:1 G5:2 Bb5:2 Eb6:4 D6:2 C6:2 | Bb5:8 G5:4 Eb5:4 |' +
      'F5:2 F5:1 F5:1 A5:2 C6:2 F6:4 Eb6:2 D6:2 | C6:8 A5:4 F5:4 | D5:2 F#5:2 A5:2 D6:2 C6:2 A5:2 F#5:4 | A5:12 -:4 |' +
      'Bb5:4 A5:2 G5:2 D6:8 | C6:2 Bb5:2 A5:2 G5:2 D5:8 | Eb6:4 D6:2 C6:2 G5:8 | Ab5:2 G5:2 F5:2 Eb5:2 C5:8 |' +
      'G5:4 Bb5:4 Eb6:8 | F6:4 Eb6:2 D6:2 C6:4 A5:4 | G6:6 F6:2 D6:4 Bb5:4 | G5:2 G5:1 G5:1 -:12',
    chords: 'Gm Gm Eb Eb F F D D Gm Gm Cm Cm Eb F Gm Gm',
    voices: [{
      inst: 'jawharp', v: 1,
      melody: riff('Gm Gm Eb Eb F F D D Gm Gm Cm Cm Eb F Gm Gm', {
        Gm: 'G3:4 -:4 G3:4 -:4', Eb: 'Eb3:4 -:4 Eb3:4 -:4', F: 'F3:4 -:4 F3:4 -:4', D: 'D3:4 -:4 D3:4 -:4', Cm: 'C3:4 -:4 C3:4 -:4',
      }),
    }],
    bass: 'R:2 R:1 R:1 5:2 5:1 5:1 R:2 R:1 R:1 8:2 5:1 5:1',
    comp: '-:4 c:2 -:2 -:4 c:2 -:2',
    drums: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 S:2 W:2',
    drumsB: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 W:2 O:2',
  },

  // ---- ambiances de la prairie : banjo, violon, accordéon, piano de saloon, feu de camp, grillons, train
  // Menu : valse au coin du feu, harmonica, guitare grattée, violon lointain, le bois crépite
  feu: {
    title: 'Le Feu de Camp', style: '16bit', bpm: 76, div: 4, bar: 12, loops: 2,
    inst: { lead: 'harmonica', tone: 'nylon', comp: 'strum' }, pad: false,
    melody:
      'D5:6 B4:3 D5:3 | G5:9 F#5:3 | E5:6 C5:3 E5:3 | D5:9 -:3 |' +
      'A4:3 D5:3 F#5:3 A5:3 | G5:6 F#5:3 E5:3 | D5:6 B4:3 G4:3 | G4:9 D5:3 |' +
      'E5:6 G5:3 E5:3 | C5:6 E5:3 G5:3 | B5:6 A5:3 G5:3 | E5:9 G5:3 |' +
      'A5:6 G5:3 E5:3 | F#5:6 E5:3 D5:3 | G5:6 D5:3 B4:3 | G4:9 -:3',
    chords: 'G G C G D D G G C C G Em Am D G G',
    voices: [{
      inst: 'fiddle', v: 0.6,
      melody: '-:12 | B4:12 | -:12 | G4:6 A4:6 | -:12 | C5:12 | -:12 | B4:6 D5:6 |' +
        '-:12 | G4:12 | -:12 | B4:12 | -:12 | C5:6 A4:6 | -:12 | B4:12',
    }],
    bass: 'R:4 -:8',
    comp: '-:4 c:4 c:4',
    drums: 'F:6 F:6',
  },
  // Menu : nuit sur le désert, ocarina sous les étoiles, harpe, chœur lointain, grillons et coyote
  desert: {
    title: 'Nuit sur le Désert', style: '16bit', bpm: 64, div: 4, bar: 16, loops: 2, howl: 'E4',
    inst: { lead: 'ocarina', pad: 'choir' },
    melody:
      'B4:8 E5:4 G5:4 | F#5:6 E5:2 B4:8 | C5:8 E5:4 G5:4 | B5:6 A5:2 G5:8 |' +
      'A5:8 C6:4 B5:4 | A5:6 E5:2 C5:8 | D#5:8 F#5:4 A5:4 | B5:12 -:4 |' +
      'G5:8 F#5:4 E5:4 | D5:6 B4:2 G4:8 | E5:8 G5:4 C6:4 | B5:8 D6:4 B5:4 |' +
      'C6:6 B5:2 A5:4 E5:4 | F#5:4 A5:4 D#5:8 | E5:8 G5:4 B4:4 | E5:12 -:4',
    chords: 'Em Em C C Am Am B7 B7 Em G C G Am B7 Em Em',
    bass: 'R:8 5:8',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'Q:8 Q:8',
    drumsB: 'Q:8 Y:8',
  },
  // Menu : piano bastringue du saloon, ragtime avec main gauche « oum-pah »
  piano: {
    title: 'Le Piano du Saloon', style: '16bit', bpm: 112, div: 4, bar: 16, loops: 2,
    inst: { lead: 'piano' }, pad: false,
    melody:
      'E5:2 G5:2 C6:3 G5:1 E5:2 G5:2 C6:4 | D6:3 C6:1 B5:2 C6:2 G5:8 | A5:2 C6:2 F6:3 C6:1 A5:2 C6:2 F6:4 | E6:3 D6:1 C6:2 A5:2 F5:8 |' +
      'G5:2 E5:2 C5:2 E5:2 G5:4 E5:4 | C#6:4 E6:2 C#6:2 A5:4 G5:4 | F#5:2 A5:2 D6:3 C6:1 A5:2 F#5:2 D5:4 | G5:2 B5:2 D6:2 F6:2 E6:2 D6:2 B5:4 |' +
      'E5:2 G5:2 C6:3 G5:1 E5:2 G5:2 C6:4 | D6:3 C6:1 B5:2 C6:2 E6:8 | F6:3 E6:1 D6:2 C6:2 A5:4 F5:4 | G#5:2 A5:2 C6:4 F6:8 |' +
      'E6:4 C6:4 C#6:4 E6:4 | D6:4 A5:4 B5:4 F6:4 | E6:2 D6:2 C6:2 G5:2 E5:2 G5:2 C6:4 | C6:4 G5:2 E5:2 C5:4 -:4',
    chords: 'C C F F C A7 D7 G7 C C F F C.A7 D7.G7 C C',
    bass: 'R:4 -:4 5:4 -:4',
    comp: '-:4 c:4 -:4 c:4',
  },
  // Menu : polka de cantina à l'accordéon, tambourin
  cantina: {
    title: 'La Cantina de Rosita', style: '16bit', bpm: 112, div: 4, bar: 16, loops: 2,
    inst: { lead: 'accordion', comp: 'squeeze' }, pad: false,
    melody:
      'F#5:2 G5:2 A5:4 A5:2 B5:2 A5:4 | F#5:2 A5:2 D6:4 C#6:2 B5:2 A5:4 | G5:2 F#5:2 E5:4 E5:2 F#5:2 G5:4 | A5:4 G5:2 E5:2 C#5:8 |' +
      'E5:2 F#5:2 G5:4 G5:2 A5:2 G5:4 | C#6:2 B5:2 A5:4 G5:2 E5:2 C#5:4 | D5:2 F#5:2 A5:4 D6:4 A5:4 | D6:8 -:4 A5:4 |' +
      'D6:2 C#6:2 D6:4 A5:2 F#5:2 A5:4 | B5:2 A5:2 F#5:4 D5:8 | B5:2 A5:2 B5:4 D6:4 B5:4 | G5:4 A5:2 B5:2 G5:8 |' +
      'A5:4 F#5:2 A5:2 D6:8 | C#6:4 B5:2 A5:2 G5:4 E5:4 | F#5:2 A5:2 D6:4 A5:2 F#5:2 D5:4 | D5:4 A4:4 D5:4 -:4',
    chords: 'D D A7 A7 A7 A7 D D D D G G D A7 D D',
    bass: 'R:4 -:4 5:4 -:4',
    comp: '-:4 c:4 -:4 c:4',
    drums: 'K:4 T:4 K:4 T:4',
  },
  // Partie : la diligence file, violon endiablé, roulements de banjo, sabots et fouet ; ça accélère
  diligence: {
    title: 'La Diligence', style: '16bit', bpm: 132, div: 4, bar: 16, loops: 3, accel: 1.04,
    inst: { lead: 'fiddle', comp: 'roll' }, pad: false,
    melody:
      'A5:2 B5:1 C6:1 B5:2 A5:2 E5:2 A5:2 C6:2 E6:2 | D6:2 C6:2 B5:2 A5:2 E5:4 A4:4 | G5:2 A5:1 B5:1 A5:2 G5:2 D5:2 G5:2 B5:2 D6:2 | C6:2 B5:2 A5:2 G5:2 D5:8 |' +
      'E5:2 A5:2 C6:2 A5:2 E6:2 C6:2 A5:2 C6:2 | B5:2 C6:2 D6:2 C6:2 A5:8 | G5:2 F#5:2 E5:2 B4:2 E5:2 G5:2 B5:4 | B5:4 A5:2 G5:2 E5:8 |' +
      'A5:4 C6:2 E6:2 A6:4 E6:4 | G6:2 E6:2 D6:2 C6:2 A5:8 | G5:4 C6:2 E6:2 G6:4 E6:4 | F6:2 E6:2 D6:2 C6:2 G5:8 |' +
      'D6:2 B5:2 G5:2 B5:2 D6:2 G6:2 D6:4 | B5:2 A5:2 G5:2 F#5:2 G5:4 B5:4 | C6:2 B5:2 A5:2 G5:2 E5:2 G5:2 A5:4 | A5:4 E5:2 E5:1 E5:1 A5:4 -:4',
    chords: 'Am Am G G Am Am Em Em Am Am C C G G Am Am',
    bass: 'R:4 5:4 R:4 5:4',
    comp: 'c:4 c:4 c:4 c:4',
    drums: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 S:2 C:1 C:1',
    drumsB: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 W:2 C:2',
  },
  // Partie : train de nuit en 8 bits, tchou-tchou des balais, sifflet de locomotive
  train: {
    title: 'Le Train de Minuit', style: '8bit', bpm: 150, div: 4, bar: 16, loops: 4, accel: 1.05,
    inst: { lead: 'lead8' }, echoDelay: 3,
    melody:
      'A4:2 C5:2 E5:2 A5:6 G5:2 E5:2 | G5:2 A5:2 E5:4 C5:4 A4:4 | A4:2 C5:2 E5:2 A5:6 B5:2 C6:2 | B5:2 A5:2 G5:2 E5:2 A5:8 |' +
      'C6:4 A5:2 F5:2 C6:4 D6:4 | C6:2 A5:2 F5:2 A5:2 C6:8 | B5:4 G#5:2 E5:2 B5:4 D6:4 | C6:2 B5:2 G#5:2 E5:2 B4:8 |' +
      'E5:2 E5:1 E5:1 A5:2 C6:2 E6:4 C6:4 | D6:2 C6:2 B5:2 A5:2 E5:8 | D5:2 D5:1 D5:1 F5:2 A5:2 D6:4 A5:4 | C6:2 A5:2 F5:2 A5:2 D6:8 |' +
      'C6:4 A5:4 F5:4 A5:4 | G#5:4 B5:4 E6:4 D6:4 | C6:2 B5:2 A5:2 E5:2 C5:2 E5:2 A5:4 | A5:4 -:4 A4:2 A4:1 A4:1 -:4',
    chords: 'Am Am Am Am F F E E Am Am Dm Dm F E Am Am',
    voices: [{
      inst: 'horn8',
      melody: '-:16 | -:16 | -:16 | -:8 A4:6 -:2 | -:16 | -:16 | -:16 | -:8 E4:3 -:1 E4:4 |' +
        '-:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:16 | -:8 A4:8',
    }],
    bass: 'R:2 -:2 5:2 -:2 R:2 -:2 5:2 -:2',
    comp: '-:2 c:2 -:2 c:2 -:2 c:2 -:2 c:2',
    drums: 'K:2 H:1 H:1 S:2 H:1 H:1 K:2 H:1 H:1 S:2 H:1 H:1',
    drumsB: 'K:2 H:1 H:1 S:2 H:1 H:1 K:2 H:1 H:1 S:1 S:1 S:1 S:1',
  },
  // Partie : les vautours tournent, violon qui s'étire, banjo qui égrène, cœur qui bat de plus en plus vite
  vautour: {
    title: 'Le Vautour', style: '16bit', bpm: 100, div: 4, bar: 16, loops: 3, accel: 1.05,
    inst: { lead: 'fiddle' },
    melody:
      'E5:12 F#5:2 G5:2 | B5:12 A5:2 G5:2 | F#5:12 G5:2 A5:2 | D5:16 |' +
      'E5:8 G5:4 C6:4 | B5:8 A5:4 G5:4 | F#5:8 A5:4 D#6:4 | B5:16 |' +
      'G5:8 B5:4 E6:4 | D#6:4 E6:4 B5:8 | D6:8 B5:4 G5:4 | A5:4 B5:4 D6:8 |' +
      'C6:8 E6:4 C6:4 | B5:8 A5:4 F#5:4 | G5:8 F#5:4 D#5:4 | E5:12 -:4',
    chords: 'Em Em D D C C B B Em Em G G Am B Em Em',
    voices: [{
      inst: 'banjo', v: 0.8,
      melody: riff('Em Em D D C C B B Em Em G G Am B Em Em', {
        Em: 'E4:2 B4:2 E5:2 B4:2 G4:2 B4:2 E5:2 B4:2', D: 'D4:2 A4:2 D5:2 A4:2 F#4:2 A4:2 D5:2 A4:2',
        C: 'C4:2 G4:2 C5:2 G4:2 E4:2 G4:2 C5:2 G4:2', B: 'B3:2 F#4:2 B4:2 F#4:2 D#4:2 F#4:2 B4:2 A4:2',
        G: 'G3:2 D4:2 G4:2 D4:2 B3:2 D4:2 G4:2 D4:2', Am: 'A3:2 E4:2 A4:2 E4:2 C4:2 E4:2 A4:2 E4:2',
      }),
    }],
    bass: 'R:8 5:8',
    drums: 'K:4 -:4 K:2 K:2 -:4',
    drumsB: 'K:4 -:4 K:2 K:2 B:4',
  },
};

// ---- un thème par mini-jeu (joué en premier), suivi de morceaux de la même couleur
Object.assign(SONGS, {
  // Fusillade : trompette, guitare saturée, galop, fouet et enclume
  fusillade: {
    title: 'Fusillade à Dodge City', style: '16bit', bpm: 140, div: 4, bar: 16, loops: 4, accel: 1.03,
    inst: { lead: 'trumpet', tone: 'twang16' }, pad: false,
    melody:
      'G5:2 -:1 G5:1 Bb5:2 D6:2 -:2 D6:2 C6:2 Bb5:2 | A5:2 Bb5:2 G5:4 D5:8 | Eb5:2 -:1 Eb5:1 G5:2 Bb5:2 -:2 Eb6:2 D6:2 C6:2 | D6:6 C6:2 A5:4 F#5:4 |' +
      'G5:2 -:1 G5:1 Bb5:2 D6:2 G6:4 F6:2 D6:2 | Eb6:2 D6:2 C6:2 Bb5:2 G5:8 | C6:4 Eb6:2 C6:2 G5:4 Eb5:4 | F#5:2 A5:2 D6:4 -:2 D5:1 D5:1 G5:4',
    chords: 'Gm Gm Eb D Gm Gm Cm D',
    voices: [{
      inst: 'fuzz', v: 1.1,
      melody: riff('Gm Gm Eb D Gm Gm Cm D', {
        Gm: 'G2:2 -:1 G2:1 Bb2:2 C3:2 D3:4 -:4', Eb: 'Eb2:2 -:1 Eb2:1 G2:2 Ab2:2 Bb2:4 -:4',
        D: 'D2:2 -:1 D2:1 F#2:2 G2:2 A2:4 -:4', Cm: 'C3:2 -:1 C3:1 Eb3:2 F3:2 G3:4 -:4',
      }),
    }],
    bass: 'R:2 R:1 R:1 5:2 5:1 5:1 R:2 R:1 R:1 8:2 5:1 5:1',
    drums: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 S:2 W:2',
    drumsB: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 A:2 A:2',
  },
  // Rodéo : violon de bal, roulements de banjo, sabots
  rodeo: {
    title: 'Rodéo au Ranch', style: '16bit', bpm: 140, div: 4, bar: 16, loops: 4,
    inst: { lead: 'fiddle', comp: 'roll' }, pad: false,
    melody:
      'D5:2 G5:2 B5:2 G5:2 D6:2 B5:2 G5:2 B5:2 | A5:2 B5:2 C6:2 B5:2 A5:2 G5:2 E5:2 D5:2 | E5:2 G5:2 C6:2 G5:2 E6:2 C6:2 G5:2 C6:2 | B5:2 C6:2 D6:2 C6:2 B5:2 A5:2 G5:4 |' +
      'G5:1 A5:1 B5:2 D6:2 B5:2 G5:1 A5:1 B5:2 D6:4 | E6:2 D6:2 B5:2 G5:2 E5:4 G5:4 | F#5:2 A5:2 D6:2 A5:2 F#5:2 A5:2 C6:2 A5:2 | B5:2 A5:2 F#5:2 D5:2 G5:4 -:4',
    chords: 'G G C C G Em D D',
    bass: 'R:4 5:4 R:4 5:4',
    comp: 'c:4 c:4 c:4 c:4',
    drums: 'K:2 C:1 C:1 H:2 C:1 C:1 K:2 C:1 C:1 H:2 C:1 C:1',
    drumsB: 'K:2 C:1 C:1 H:2 C:1 C:1 K:2 C:1 C:1 W:2 C:2',
  },
  // Duel : trompette solitaire à midi, cloche et tic-tac ; chaque tour est plus pressé
  midi: {
    title: 'Midi Pile', style: '16bit', bpm: 90, div: 4, bar: 16, loops: 4, accel: 1.06,
    inst: { lead: 'trumpet', tone: 'nylon' },
    melody:
      'E5:12 A5:2 C6:2 | B5:8 A5:4 E5:4 | F5:12 A5:2 D6:2 | C6:8 A5:4 F5:4 |' +
      'G#5:8 B5:4 D6:4 | E6:12 -:4 | C6:4 B5:4 A5:4 E5:4 | G#5:4 B5:4 E5:8',
    chords: 'Am Am Dm Dm E E Am E',
    bass: 'R:8 -:8',
    comp: '1:4 -:4 5:4 -:4',
    drums: 'B:4 H:4 H:4 H:4',
    drumsB: 'H:4 H:4 H:4 S:2 S:2',
  },
  // Où est Charlie : jour de marché, banjo sautillant et accordéon
  marche: {
    title: 'Jour de Marché', style: '16bit', bpm: 126, div: 4, bar: 16, loops: 4,
    inst: { lead: 'banjo', comp: 'squeeze' }, pad: false,
    melody:
      'C5:2 F5:2 A5:2 F5:2 C6:4 A5:4 | Bb5:2 A5:2 G5:2 F5:2 D5:4 F5:4 | E5:2 G5:2 Bb5:2 G5:2 C6:4 Bb5:4 | A5:4 G5:2 F5:2 C5:8 |' +
      'F5:1 G5:1 A5:2 C6:2 A5:2 F6:4 C6:4 | D6:2 C6:2 Bb5:2 A5:2 Bb5:4 D6:4 | C6:2 Bb5:2 G5:2 E5:2 G5:2 Bb5:2 E5:4 | F5:4 A5:2 C6:2 F5:4 -:4',
    chords: 'F Bb C7 F F Bb C7 F',
    bass: 'R:4 -:4 5:4 -:4',
    comp: '-:4 c:4 -:4 c:4',
    drums: 'K:4 H:2 H:2 K:4 T:4',
  },
  // Assaut du fort : clairon de la cavalerie, caisse claire de marche
  clairon: {
    title: 'Le Clairon du Fort', style: '16bit', bpm: 120, div: 4, bar: 16, loops: 4, accel: 1.03,
    inst: { lead: 'trumpet' },
    melody:
      'G4:2 -:1 G4:1 C5:2 E5:2 G5:4 E5:4 | C5:2 -:1 C5:1 E5:2 G5:2 C6:8 | D5:2 -:1 D5:1 G5:2 B5:2 D6:4 B5:4 | C6:4 G5:4 E5:4 C5:4 |' +
      'E5:2 G5:2 C6:2 E6:2 G6:4 E6:4 | F5:2 A5:2 C6:2 F6:2 C6:4 A5:4 | G5:2 B5:2 D6:2 G6:2 F6:2 D6:2 B5:2 G5:2 | C6:4 G5:2 -:1 G5:1 C6:4 -:4',
    chords: 'C C G C C F G C',
    bass: 'R:4 5:4 R:4 5:4',
    comp: '-:2 c:2 -:2 c:2 -:2 c:2 -:2 c:2',
    drums: 'K:2 S:1 S:1 S:2 S:2 K:2 S:1 S:1 S:2 S:2',
    drumsB: 'K:2 S:1 S:1 S:2 S:2 K:2 S:1 S:1 S:1 S:1 S:1 S:1',
  },
  // Roulotte : galop 8 bits sur la piste de Red Rock
  roulotte: {
    title: 'La Roulotte', style: '8bit', bpm: 156, div: 4, bar: 16, loops: 5, accel: 1.04,
    inst: { lead: 'twang8' }, echoDelay: 3,
    melody:
      'D5:2 D5:1 D5:1 F5:2 A5:2 D6:4 C6:2 A5:2 | Bb5:2 A5:2 G5:2 F5:2 E5:4 D5:4 | D5:2 F5:2 Bb5:4 A5:2 G5:2 F5:4 | E5:2 G5:2 C6:4 Bb5:2 A5:2 G5:4 |' +
      'A5:2 A5:1 A5:1 D6:2 F6:2 E6:2 D6:2 A5:4 | F5:2 G5:2 A5:2 F5:2 D5:8 | Bb5:4 D6:4 F6:4 D6:4 | C#6:2 A5:2 E5:2 C#5:2 A4:2 A4:1 A4:1 -:4',
    chords: 'Dm Dm Bb C Dm Dm Bb A',
    bass: 'R:2 R:1 R:1 5:2 5:1 5:1 R:2 R:1 R:1 8:2 5:1 5:1',
    comp: '-:4 c:2 -:2 -:4 c:2 -:2',
    drums: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 S:2 W:2',
    drumsB: 'K:2 C:1 C:1 S:2 C:1 C:1 K:2 C:1 C:1 W:2 O:2',
  },
  // La pinte : piano bastringue endiablé, la tournée du patron
  tournee: {
    title: 'Tournée Générale', style: '16bit', bpm: 132, div: 4, bar: 16, loops: 4, accel: 1.03,
    inst: { lead: 'piano' }, pad: false,
    melody:
      'B4:2 D5:2 G5:3 D5:1 B5:2 A5:2 G5:4 | G#5:2 B5:2 E6:3 D6:1 B5:2 G#5:2 E5:4 | A5:2 C#6:2 E6:3 C#6:1 G6:2 E6:2 C#6:4 | D6:3 C6:1 A5:2 F#5:2 D5:4 C6:4 |' +
      'B5:2 D6:2 G6:3 D6:1 B5:2 D6:2 G6:4 | G#6:2 E6:2 D6:2 B5:2 G#5:4 E5:4 | A5:2 C#6:2 E6:4 F#6:2 D6:2 C6:4 | B5:2 A5:2 G5:2 D5:2 G5:4 -:4',
    chords: 'G E7 A7 D7 G E7 A7.D7 G',
    bass: 'R:4 -:4 5:4 -:4',
    comp: '-:4 c:4 -:4 c:4',
    drums: 'K:4 H:2 H:2 S:4 H:2 H:2',
  },
  // La mine : guitare dans le noir, guimbarde, coups de pioche sur l'enclume
  filon: {
    title: 'Le Filon', style: '16bit', bpm: 120, div: 4, bar: 16, loops: 4, accel: 1.04,
    inst: { lead: 'twang16' },
    melody:
      'C5:2 Eb5:2 G5:4 F5:2 Eb5:2 D5:4 | Eb5:2 D5:2 C5:4 G4:8 | Ab4:2 C5:2 Eb5:4 Ab5:4 G5:4 | G5:4 F5:2 Eb5:2 D5:4 B4:4 |' +
      'C6:4 G5:2 Eb5:2 C6:4 D6:4 | Eb6:2 D6:2 C6:2 G5:2 Eb5:8 | F5:2 Ab5:2 C6:4 Ab5:2 F5:2 C5:4 | B4:2 D5:2 G5:4 F5:2 D5:2 B4:4',
    chords: 'Cm Cm Ab G Cm Cm Fm G',
    voices: [{
      inst: 'jawharp',
      melody: riff('Cm Cm Ab G Cm Cm Fm G', {
        Cm: 'C3:2 -:2 C3:2 G2:2 -:2 C3:2 -:4', Ab: 'Ab2:2 -:2 Ab2:2 Eb3:2 -:2 Ab2:2 -:4',
        G: 'G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:4', Fm: 'F2:2 -:2 F2:2 C3:2 -:2 F2:2 -:4',
      }),
    }],
    bass: 'R:4 -:4 R:4 5:4',
    drums: 'K:4 A:4 K:2 C:2 A:4',
    drumsB: 'K:4 A:4 K:2 C:2 C:2 C:2',
  },
  // Conquête de l'Ouest : grande chevauchée qui se construit, trompette, chœur, chant d'hommes
  ruee: {
    title: "La Ruée vers l'Or", style: '16bit', bpm: 108, div: 4, bar: 16, loops: 3,
    inst: { lead: 'trumpet', pad: 'choir' },
    melody:
      'D5:4 F5:4 A5:8 | G5:2 F5:2 E5:2 F5:2 D5:8 | D5:4 F5:4 Bb5:8 | A5:2 G5:2 F5:2 G5:2 D5:8 |' +
      'C5:4 F5:4 A5:4 C6:4 | Bb5:4 A5:4 F5:8 | E5:4 A5:4 C#6:8 | B5:2 C#6:2 D6:2 C#6:2 A5:8 |' +
      'D6:6 C6:2 A5:4 F5:4 | E5:4 F5:4 A5:8 | Bb5:6 A5:2 G5:4 D5:4 | G5:4 A5:4 Bb5:8 |' +
      'D6:6 C6:2 Bb5:4 F5:4 | E5:4 G5:4 C6:8 | D6:4 A5:4 F5:4 D5:4 | E5:4 A5:4 C#6:4 E6:4',
    chords: 'Dm Dm Bb Bb F F A A Dm Dm Gm Gm Bb C Dm A',
    voices: [{
      inst: 'chant', v: 0.8,
      melody: riff('Dm Dm Bb Bb F F A A Dm Dm Gm Gm Bb C Dm A', {
        Dm: 'D3:4 -:4 D3:4 -:4', Bb: 'Bb2:4 -:4 Bb2:4 -:4', F: 'F3:4 -:4 F3:4 -:4',
        A: 'A2:4 -:4 A2:4 -:4', Gm: 'G2:4 -:4 G2:4 -:4', C: 'C3:4 -:4 C3:4 -:4',
      }),
    }],
    bass: 'R:4 R:2 5:2 R:4 8:2 5:2',
    comp: '1:2 5:2 8:2 5:2 3:2 5:2 8:2 5:2',
    drums: 'K:4 H:2 H:2 S:4 H:2 H:2',
    drumsB: 'K:4 H:2 H:2 S:4 S:1 S:1 S:1 S:1',
  },
});

// ---- Doom-like : western métal (riffs saturés en doubles croches, trompette ou sifflement de Morricone par-dessus)
Object.assign(SONGS, {
  // Partie : chevauchée infernale, riff galopant sur la corde de mi grave, trompette mariachi
  enfer: {
    title: "L'Enfer de Tombstone", style: '16bit', bpm: 168, div: 4, bar: 16, loops: 3, accel: 1.03,
    inst: { lead: 'trumpet' }, pad: false,
    melody:
      'E5:6 B4:2 E5:4 G5:4 | F#5:2 G5:2 F#5:2 E5:2 B4:8 | C5:6 G4:2 C5:4 E5:4 | F#5:2 E5:2 D5:2 F#5:2 A5:8 |' +
      'B5:6 A5:2 G5:4 E5:4 | G5:2 A5:2 B5:4 E6:8 | E6:4 D6:2 C6:2 G5:4 E5:4 | D#5:2 F#5:2 A5:2 B5:2 D#6:8 |' +
      'E6:12 D6:2 B5:2 | G5:4 B5:4 E5:8 | C6:6 B5:2 G5:4 E5:4 | D6:4 C6:2 A5:2 F#5:8 |' +
      'E6:4 G6:4 E6:4 C6:4 | F#6:4 E6:2 D6:2 A5:8 | B5:4 A5:2 G5:2 F#5:4 D#5:4 | B4:8 -:8',
    chords: 'Em Em C D Em Em C B Em Em C D C D B B7',
    voices: [{
      inst: 'chug',
      melody: riff('Em Em C D Em Em C B Em Em C D C D B B7', {
        Em: 'E2:1 E2:1 E2:1 E2:1 G2:2 E2:1 E2:1 Bb2:2 E2:1 E2:1 A2:2 G2:2',
        C: 'C3:1 C3:1 C3:1 C3:1 E3:2 C3:1 C3:1 G3:2 C3:1 C3:1 F#3:2 E3:2',
        D: 'D3:1 D3:1 D3:1 D3:1 F#3:2 D3:1 D3:1 A3:2 D3:1 D3:1 G#3:2 F#3:2',
        B: 'B2:1 B2:1 B2:1 B2:1 D#3:2 B2:1 B2:1 F3:2 B2:1 B2:1 E3:2 D#3:2',
        B7: 'B2:2 -:2 B2:2 -:2 B2:4 -:4',
      }),
    }],
    bass: 'R:2 R:2 R:2 R:2 R:2 R:2 R:2 R:2',
    drums: 'K:1 K:1 H:2 S:2 K:1 K:1 K:1 K:1 H:2 S:2 K:2',
    drumsB: 'X:2 K:1 K:1 S:2 K:1 K:1 K:2 K:1 K:1 S:2 S:1 S:1',
  },
  // Partie : plateau rouge sous le soleil, sifflement solitaire sur un riff lourd et un chœur
  mesa: {
    title: 'Mesa Sanglante', style: '16bit', bpm: 138, div: 4, bar: 16, loops: 4, accel: 1.03,
    inst: { lead: 'whistle', pad: 'choir' },
    melody:
      'A5:8 D6:4 C6:2 A5:2 | F5:4 G5:2 A5:2 D5:8 | Bb5:6 A5:2 F5:4 D5:4 | E5:4 G5:4 C#6:8 |' +
      'D6:8 F6:4 E6:2 D6:2 | A5:4 C6:2 A5:2 F5:8 | G5:6 Bb5:2 D6:4 G5:4 | A5:8 -:4 C#5:2 E5:2',
    chords: 'Dm Dm Bb A Dm Dm Gm A',
    voices: [{
      inst: 'chug', v: 0.9,
      melody: riff('Dm Dm Bb A Dm Dm Gm A', {
        Dm: 'D3:2 D3:1 D3:1 -:2 D3:1 D3:1 F3:2 D3:1 D3:1 G#3:2 A3:2',
        Bb: 'Bb2:2 Bb2:1 Bb2:1 -:2 Bb2:1 Bb2:1 D3:2 Bb2:1 Bb2:1 E3:2 F3:2',
        A: 'A2:4 -:2 A2:1 A2:1 C#3:4 E3:2 G3:2',
        Gm: 'G2:2 G2:1 G2:1 -:2 G2:1 G2:1 Bb2:2 G2:1 G2:1 C#3:2 D3:2',
      }),
    }],
    bass: 'R:2 R:2 R:4 5:4 R:4',
    drums: 'K:4 H:2 K:2 S:4 H:2 H:2',
    drumsB: 'K:4 H:2 K:2 S:4 S:2 X:2',
  },
  // Boss : El Diablo sort de Boot Hill. Orgue, gong, accords qui sonnent, guitare qui hurle, chœur d'hommes
  diable: {
    title: 'Le Diable de Boot Hill', style: '16bit', bpm: 96, div: 4, bar: 16, loops: 4, accel: 1.03,
    inst: { lead: 'wail', pad: 'organ' },
    melody:
      'E5:12 F5:2 E5:2 | B5:8 Bb5:4 G5:4 | C6:12 B5:2 G5:2 | F#5:8 D#5:4 B4:4 |' +
      'E6:8 D6:4 B5:4 | G5:4 Bb5:4 B5:8 | A5:4 C6:4 F6:8 | D#6:4 C6:2 B5:2 F5:4 D#5:4',
    chords: 'Em Em C B Em Em F B',
    voices: [
      {
        inst: 'chug',
        melody: riff('Em Em C B Em Em F B', {
          Em: 'E2:4 E2:1 E2:1 E2:1 E2:1 Bb2:4 E2:1 E2:1 G2:2',
          C: 'C3:4 C3:1 C3:1 C3:1 C3:1 G3:4 C3:1 C3:1 B2:2',
          B: 'B2:4 B2:1 B2:1 B2:1 B2:1 F3:4 B2:1 B2:1 D#3:2',
          F: 'F2:4 F2:1 F2:1 F2:1 F2:1 B2:4 F2:1 F2:1 E2:2',
        }),
      },
      {
        inst: 'chant', v: 0.7,
        melody: riff('Em Em C B Em Em F B', { Em: 'E3:4 -:12', C: 'C3:4 -:12', B: 'B2:4 -:12', F: 'F3:4 -:12' }),
      },
    ],
    bass: 'R:4 R:4 R:4 R:4',
    drums: 'G:4 K:2 K:2 S:4 K:1 K:1 K:2',
    drumsB: 'K:1 K:1 K:1 K:1 S:4 K:1 K:1 K:1 K:1 S:2 S:1 S:1',
  },
});

const PLAYLISTS = {
  menu: ['poussiere', 'feu', 'coyote', 'desert', 'montre', 'piano', 'colt', 'cantina'],
  game: ['duel', 'diligence', 'glas', 'collines', 'train', 'cri', 'plomb', 'vautour', 'nocturne'],
  // mini-jeux : playMusic('mini-<kind>')
  'mini-shooter': ['fusillade', 'plomb', 'duel'],
  'mini-lasso': ['rodeo', 'diligence', 'coyote'],
  'mini-duel': ['midi', 'glas', 'cri'],
  'mini-charlie': ['marche', 'piano', 'cantina', 'montre'],
  'mini-fort': ['clairon', 'collines', 'nocturne'],
  'mini-wagon': ['roulotte', 'diligence', 'nocturne'],
  'mini-pinte': ['tournee', 'piano', 'cantina'],
  'mini-mine': ['filon', 'train', 'vautour'],
  'mini-course': ['rodeo', 'diligence', 'train'],
  'mini-rts': ['ruee', 'collines', 'cri', 'vautour', 'glas', 'plomb'],
  'mini-fps': ['enfer', 'mesa', 'fusillade', 'cri', 'nocturne'],
  'mini-fpsdm': ['mesa', 'enfer', 'cri', 'fusillade', 'nocturne'],
  // El Diablo est sur la carte (fps.js) : son thème tourne en boucle jusqu'à sa chute
  'mini-fps-boss': ['diable'],
};
const compiled = {};
const getSong = (id) => (compiled[id] ||= compile(SONGS[id]));

// Vraies musiques : fichiers à déposer dans public/music/ (mp3, ogg, m4a ou wav).
// Ceux qui sont présents s'intercalent dans la playlist synthétisée correspondante,
// passés dans un "crusher" pour sonner 8 bits (NES) ou 16 bits (SNES).
// Les fichiers des dossiers 8bit/ et 16bit/ sont déjà passés au crusher (ffmpeg) :
// ils sont joués tels quels, sans le traitement en direct.
const CUSTOM_TRACKS = {
  menu: [
    ['8bit/a-fistful-of-dollars', 'Titoli – A Fistful of Dollars', '8bit'],
    ['16bit/for-a-few-dollars-more', 'For a Few Dollars More', '16bit'],
    ['8bit/big-iron', 'Marty Robbins – Big Iron', '8bit'],
    ['16bit/the-good-the-bad-and-the-ugly', 'Titoli – The Good, the Bad and the Ugly', '16bit'],
    ['8bit/ecstasy-of-gold', "L'Estasi dell'Oro", '8bit'],
    ['menu', '', '16bit'],
  ],
  game: [
    ['8bit/the-good-the-bad-and-the-ugly', 'Titoli – The Good, the Bad and the Ugly', '8bit'],
    ['16bit/ecstasy-of-gold', "L'Estasi dell'Oro", '16bit'],
    ['16bit/big-iron', 'Marty Robbins – Big Iron', '16bit'],
    ['8bit/for-a-few-dollars-more', 'For a Few Dollars More', '8bit'],
    ['16bit/a-fistful-of-dollars', 'Titoli – A Fistful of Dollars', '16bit'],
    ['game', '', '8bit'],
  ],
};
const isBaked = (url) => /^music\/(8|16)bit\//.test(url);

// rate : fréquence d'échantillonnage simulée, bits : résolution, hp/lp : filtres, echo : envoi vers l'écho "canyon"
const CRUSH = {
  '8bit': { rate: 11025, bits: 6, mono: 1, hp: 110, lp: 7000, echo: 0 },
  '16bit': { rate: 16000, bits: 10, mono: 0, hp: 40, lp: 6500, echo: 0.22 },
};

// Échantillonneur-bloqueur + quantification, exécuté dans le thread audio
const CRUSHER_SRC = `
class Crusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 11025 }, { name: 'bits', defaultValue: 8 }, { name: 'mono', defaultValue: 0 }];
  }
  constructor() { super(); this.ph = 1; this.hold = [0, 0]; }
  process([input], [output], p) {
    if (!input || !input.length) return true;
    const step = Math.min(1, p.rate[0] / sampleRate), q = 2 ** (p.bits[0] - 1), mono = p.mono[0] > 0.5;
    for (let i = 0; i < output[0].length; i++) {
      this.ph += step;
      if (this.ph >= 1) {
        this.ph -= 1;
        const l = input[0][i], r = (input[1] || input[0])[i];
        const s = mono ? [(l + r) / 2, (l + r) / 2] : [l, r];
        for (let c = 0; c < 2; c++) this.hold[c] = Math.round(s[c] * q) / q;
      }
      for (let c = 0; c < output.length; c++) output[c][i] = this.hold[Math.min(c, 1)];
    }
    return true;
  }
}
registerProcessor('bs-crusher', Crusher);`;

let crusherReady = Promise.resolve(false);
function loadCrusher() {
  if (!ac.audioWorklet) return;
  const url = URL.createObjectURL(new Blob([CRUSHER_SRC], { type: 'text/javascript' }));
  crusherReady = ac.audioWorklet.addModule(url).then(() => true, () => false);
}

// branche l'élément <audio> sur la chaîne crusher -> filtres -> bus musique
function crushChain(el, style, useCrusher, baked) {
  const P = CRUSH[style] || CRUSH['16bit'];
  const nodes = [ac.createMediaElementSource(el)];
  if (baked) {
    nodes[0].connect(musicBus);
    return nodes;
  }
  if (useCrusher) {
    const cr = new AudioWorkletNode(ac, 'bs-crusher', { outputChannelCount: [2] });
    for (const k of ['rate', 'bits', 'mono']) cr.parameters.get(k).value = P[k];
    nodes.push(cr);
  }
  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = P.hp;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = P.lp;
  nodes.push(hp, lp);
  for (let i = 1; i < nodes.length; i++) nodes[i - 1].connect(nodes[i]);
  lp.connect(musicBus);
  if (P.echo) {
    const send = ac.createGain();
    send.gain.value = P.echo;
    lp.connect(send).connect(echoIn);
    nodes.push(send);
  }
  return nodes;
}

let player = null;
let customEl = null;
let customNodes = [];
let hasCrusher = false;
const customFiles = {};
const plPos = { menu: 0, game: Math.floor(Math.random() * PLAYLISTS.game.length) };
let wanted = null;
let current = '';

// Liste des fichiers de public/music/, fournie par le serveur local (npm start, server.js).
// En ligne, le dossier n'est pas publié (.surgeignore) : on ne cherche rien, pour ne pas remplir la console de 404.
const LOCAL_HOST = /^(localhost|127\.|\[::1\]$|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
async function musicIndex() {
  if (!LOCAL_HOST) return null;
  try {
    const r = await fetch('music/index.json', { cache: 'no-store' });
    if (r.ok) return new Set(await r.json());
  } catch {}
  return null;
}

// les fichiers trouvés rejoignent la rotation au morceau suivant, sans couper celui en cours
async function loadCustomMusic() {
  hasCrusher = await crusherReady;
  const have = await musicIndex();
  if (!have) return;
  for (const [list, entries] of Object.entries(CUSTOM_TRACKS)) {
    const ok = entries.map(([file, title, style]) => {
      const ext = ['mp3', 'ogg', 'm4a', 'wav'].find((e) => have.has(`${file}.${e}`));
      return { url: ext && `music/${file}.${ext}`, title, style };
    }).filter((t) => t.url);
    if (ok.length) customFiles[list] = ok;
  }
}

// playlist jouée : les morceaux synthétisés, avec les fichiers trouvés répartis régulièrement entre eux
function tracks(name) {
  const at = (list) => list.map((x, i) => [(i + 0.5) / list.length, x]);
  return [...at(customFiles[name] || []), ...at(PLAYLISTS[name] || [])].sort((a, b) => a[0] - b[0]).map(([, x]) => x);
}

function announce(title) {
  current = title;
  window.dispatchEvent(new CustomEvent('bs-track', { detail: title }));
}

export const currentTrack = () => current;

// ------------------------------------------------------------------ musique dynamique
// level : intensité 0..1 (0,5 = le morceau tel qu'écrit). Au calme (< 0,35) : son étouffé, sans grosses percussions,
// un peu plus lent ; sous tension (> 0,75) : couche de percussions en plus, plus rapide.
// heart : cœur qui bat ; tick : tic-tac d'horloge ; hush : musique presque coupée (face-à-face du duel).
const MOOD0 = { level: 0.5, heart: false, tick: false, hush: false };
const mood = { ...MOOD0 };
const tempo = () => 1 + (mood.level - 0.5) * 0.16;

export function setMood(m = {}) {
  const next = { ...MOOD0, ...m };
  if (Object.keys(MOOD0).every((k) => next[k] === mood[k])) return;
  const retempo = next.level !== mood.level;
  Object.assign(mood, next);
  if (!ac) return;
  applyMood();
  if (retempo && player) {
    // on garde la position dans le morceau : la suite est replacée au nouveau tempo
    const now = ac.currentTime, step = (now - player.loopStart) / player.stepDur;
    player.stepDur = player.baseDur / tempo();
    player.loopStart = now - step * player.stepDur;
  }
}

function applyMood() {
  const t = ac.currentTime;
  moodLP.frequency.setTargetAtTime(mood.level < 0.35 ? 1500 : 18000, t, 0.4);
  hushG.gain.setTargetAtTime(mood.hush ? 0.2 : 1, t, mood.hush ? 0.5 : 0.25);
  if (customEl) customEl.playbackRate = mood.level > 0.75 ? 1.04 : 1;
}

// cœur et horloge, joués par-dessus n'importe quel morceau (fichiers compris)
let nextBeat = 0, nextTick = 0, tickN = 0;
function layers() {
  const now = ac.currentTime, ahead = now + 0.25;
  if (mood.heart) {
    nextBeat = Math.max(nextBeat, now + 0.02);
    for (; nextBeat < ahead; nextBeat += 60 / (mood.level > 0.75 ? 104 : 80)) {
      tone(nextBeat, 75, 0.14, { f2: 42, gain: 0.5, dest: musicBus });
      tone(nextBeat + 0.17, 65, 0.2, { f2: 38, gain: 0.38, dest: musicBus });
    }
  } else nextBeat = 0;
  if (mood.tick) {
    nextTick = Math.max(nextTick, now + 0.02);
    for (; nextTick < ahead; nextTick += 0.5, tickN++) {
      tone(nextTick, tickN % 2 ? 1900 : 2500, 0.035, { type: 'triangle', gain: 0.07, dest: musicBus });
      noise(nextTick, 0.015, { type: 'highpass', f: 5000, gain: 0.05, dest: musicBus });
    }
  } else nextTick = 0;
}

// accord d'orchestre (cuivres et cordes graves) qui passe au-dessus de la musique atténuée
function stab(notes, t, len, gain) {
  const flt = ac.createBiquadFilter();
  flt.type = 'lowpass';
  flt.frequency.setValueAtTime(2400, t);
  flt.frequency.exponentialRampToValueAtTime(500, t + len);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.02);
  g.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.4);
  g.gain.exponentialRampToValueAtTime(0.0005, t + len);
  for (const n of notes) {
    for (const det of [-9, 9]) {
      const o = osc('sawtooth', mtof(n), t);
      o.detune.value = det;
      o.connect(flt);
      o.start(t);
      o.stop(t + len + 0.05);
    }
  }
  flt.connect(g);
  g.connect(stingBus);
  g.connect(echoIn);
}

// Effets ponctuels liés à l'action : 'aim' (la musique retient son souffle pendant sec secondes),
// 'hit' (balle réelle), 'death' (un joueur tombe), 'blank' (à blanc, soulagement)
export function musicCue(kind, sec = 1.5) {
  if (!ac) return;
  const t = ac.currentTime, g = duckG.gain;
  g.cancelScheduledValues(t);
  g.setValueAtTime(g.value, t);
  if (kind === 'aim') {
    g.linearRampToValueAtTime(0.3, t + 0.4);
    g.setValueAtTime(0.3, t + sec);
    g.linearRampToValueAtTime(1, t + sec + 1); // au cas où la suite n'arrive jamais
  } else if (kind === 'hit' || kind === 'death') {
    const dead = kind === 'death';
    g.linearRampToValueAtTime(dead ? 0.03 : 0.12, t + 0.03);
    g.setValueAtTime(dead ? 0.03 : 0.12, t + (dead ? 2.5 : 1));
    g.linearRampToValueAtTime(1, t + (dead ? 5 : 2.6));
    noise(t, 1.2, { f: 400, f2: 60, gain: 0.5, dest: stingBus }); // grosse caisse d'orchestre
    stab(dead ? [28, 35, 40, 43] : [40, 46, 52], t, dead ? 3.5 : 1.8, dead ? 0.1 : 0.09);
  } else if (kind === 'blank') {
    g.linearRampToValueAtTime(1, t + 0.8);
    [64, 67, 71, 76].forEach((m, i) => tone(t + i * 0.07, mtof(m), 0.5, { type: 'triangle', gain: 0.09, dest: stingBus }));
  } else if (kind === 'boss') {
    // El Diablo arrive : la musique se tait, grosse caisse et accord de triton (mi - si bémol) qui gronde
    g.linearRampToValueAtTime(0.05, t + 0.05);
    g.setValueAtTime(0.05, t + 2.2);
    g.linearRampToValueAtTime(1, t + 4);
    noise(t, 2, { f: 300, f2: 40, gain: 0.6, dest: stingBus });
    stab([28, 34, 40, 46], t, 4, 0.12);
  }
}

export function stopMusic() {
  if (player) { clearInterval(player.timer); player = null; }
  if (customEl) { customEl.pause(); customEl = null; }
  for (const n of customNodes) n.disconnect();
  customNodes = [];
}

function startSong(p, id, at) {
  p.song = getSong(id);
  p.loop = 0;
  p.i = 0;
  p.loopStart = at;
  p.baseDur = 60 / p.song.bpm / p.song.div;
  p.stepDur = p.baseDur / tempo();
  announce(p.song.title);
}

function tick() {
  const p = player;
  // le morceau suivant est un fichier : il prend la relève à la fin de celui-ci
  if (p.handoff) {
    if (ac.currentTime >= p.handoff) playMusic(p.list, true);
    return;
  }
  const horizon = ac.currentTime + 0.3;
  let guard = 0;
  while (guard++ < 400) {
    const { song } = p;
    if (p.i >= song.ev.length) {
      const end = p.loopStart + song.total * p.stepDur;
      if (end > horizon) break;
      p.loop++;
      if (p.loop >= song.loops) {
        plPos[p.list]++;
        const list = tracks(p.list);
        const next = list[plPos[p.list] % list.length];
        if (typeof next !== 'string') { p.handoff = end + 0.6; break; }
        startSong(p, next, end + 0.6);
      } else {
        p.i = 0;
        p.loopStart = end;
        if (song.accel) p.baseDur /= song.accel;
        p.stepDur = p.baseDur / tempo();
      }
      continue;
    }
    const e = song.ev[p.i];
    const t = p.loopStart + e.s * p.stepDur;
    if (t > horizon) break;
    p.i++;
    if (e.when === 'odd' && p.loop % 2 === 0) continue;
    if (e.when === 'even' && p.loop % 2 === 1) continue;
    if (t < ac.currentTime - 0.05) continue;
    if (e.role === 'loud' && mood.level < 0.35) continue;
    if (e.role === 'boost' && mood.level < 0.75) continue;
    INST[e.fn](...(e.d ? [e.arg, t, e.d * p.stepDur, e.v ?? 1] : [t]));
  }
}

// Thème de boss : tant qu'il est actif, la playlist du mini-jeu est remplacée par « <nom>-boss ».
// main.js redemande la playlist à chaque clic (déblocage du son) : elle reste alors sur celle du boss.
const bossOn = {};
export function bossMusic(name, on) {
  bossOn[name] = on;
  if (wanted === name || wanted === `${name}-boss`) playMusic(name);
}

export function playMusic(name, force = false) {
  const base = name.replace(/-boss$/, '');
  for (const k in bossOn) if (k !== base) bossOn[k] = false; // on a quitté le mini-jeu
  name = bossOn[base] && PLAYLISTS[`${base}-boss`] ? `${base}-boss` : base;
  if (!ac) { wanted = name; return; }
  if (!force && wanted === name && (player || customEl)) return;
  if (wanted !== name) setMood();
  wanted = name;
  stopMusic();
  duckG.gain.cancelScheduledValues(ac.currentTime);
  duckG.gain.setValueAtTime(1, ac.currentTime);
  plPos[name] ??= 0;
  const list = tracks(name);
  if (!list.length) return;
  const track = list[plPos[name] % list.length];
  if (typeof track === 'string') {
    player = { list: name };
    startSong(player, track, ac.currentTime + 0.1);
    tick();
    player.timer = setInterval(tick, 50);
    return;
  }
  customEl = new Audio(track.url);
  customEl.loop = list.length === 1;
  customEl.onended = () => { plPos[name]++; playMusic(name, true); };
  customNodes = crushChain(customEl, track.style, hasCrusher, isBaked(track.url)); // volume/mute gérés par musicBus et master
  customEl.playbackRate = mood.level > 0.75 ? 1.04 : 1;
  customEl.play().catch(() => {});
  announce(track.title);
}

// passe au morceau suivant de la playlist en cours
export function nextTrack() {
  if (!wanted || !(player || customEl)) return;
  plPos[wanted]++;
  playMusic(wanted, true);
}

// ------------------------------------------------------------------ bruitages
const SFX = {
  ui(t) { tone(t, 990, 0.05, { type: 'square', gain: 0.05 }); },
  hover(t) { tone(t, 1320, 0.03, { type: 'square', gain: 0.025 }); },
  gunshot(t) {
    noise(t, 0.9, { f: 6000, f2: 180, gain: 1.0, slap: true });
    noise(t, 0.08, { type: 'highpass', f: 3000, gain: 0.6 });
    tone(t, 110, 0.35, { f2: 28, gain: 0.9 });
    noise(t + 0.22, 0.9, { f: 1400, f2: 120, gain: 0.25 });
    noise(t + 0.48, 0.8, { f: 900, f2: 100, gain: 0.1 });
  },
  click(t) {
    tone(t, 2400, 0.02, { type: 'square', gain: 0.18 });
    noise(t, 0.03, { type: 'highpass', f: 4000, gain: 0.3 });
    tone(t + 0.03, 1700, 0.02, { type: 'square', gain: 0.06 });
  },
  pump(t) {
    noise(t, 0.07, { type: 'bandpass', f: 1400, q: 2, gain: 0.6 });
    tone(t, 520, 0.05, { type: 'square', gain: 0.05 });
    noise(t + 0.17, 0.08, { type: 'bandpass', f: 950, q: 2, gain: 0.7 });
    tone(t + 0.17, 380, 0.06, { type: 'square', gain: 0.06 });
  },
  shell(t) {
    tone(t, 2800, 0.08, { gain: 0.08 });
    tone(t + 0.12, 3100, 0.05, { gain: 0.05 });
    tone(t + 0.2, 2950, 0.04, { gain: 0.03 });
  },
  shellIn(t) {
    noise(t, 0.04, { type: 'bandpass', f: 2200, q: 4, gain: 0.4 });
    tone(t, 1800, 0.04, { type: 'triangle', gain: 0.08 });
  },
  heartbeat(t) {
    tone(t, 70, 0.14, { f2: 45, gain: 0.5 });
    tone(t + 0.2, 62, 0.16, { f2: 40, gain: 0.4 });
  },
  saw(t) {
    for (let i = 0; i < 6; i++) noise(t + i * 0.13, 0.11, { type: 'bandpass', f: i % 2 ? 2400 : 1700, q: 3, gain: 0.35 });
  },
  clank(t) {
    tone(t, 1250, 0.4, { type: 'triangle', gain: 0.15 });
    tone(t, 1870, 0.3, { gain: 0.08 });
    tone(t + 0.12, 1400, 0.35, { type: 'triangle', gain: 0.12 });
  },
  puff(t) { noise(t, 0.7, { f: 700, f2: 200, gain: 0.25 }); },
  gulp(t) {
    for (let i = 0; i < 3; i++) tone(t + i * 0.2, 260, 0.12, { f2: 520, gain: 0.2 });
    tone(t + 0.7, 600, 0.3, { type: 'triangle', f2: 300, gain: 0.08 });
  },
  ding(t) { tone(t, 1568, 0.6, { gain: 0.15 }); tone(t + 0.08, 2093, 0.7, { gain: 0.12 }); },
  whip(t) {
    noise(t, 0.12, { type: 'highpass', f: 800, f2: 6000, gain: 0.3 });
    noise(t + 0.12, 0.05, { type: 'highpass', f: 3000, gain: 0.9 });
  },
  morse(t) {
    const p = [0.06, 0.18, 0.06, 0.06, 0.18, 0.06, 0.18];
    let x = t;
    for (const d of p) { tone(x, 820, d, { type: 'square', gain: 0.06, attack: 0.002 }); x += d + 0.06; }
  },
  good(t) { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, f, 0.2, { type: 'square', gain: 0.06 })); },
  bad(t) { tone(t, 220, 0.5, { type: 'sawtooth', f2: 90, gain: 0.12 }); },
  coin(t) { tone(t, 1975, 0.1, { type: 'square', gain: 0.05 }); tone(t + 0.1, 2637, 0.4, { type: 'square', gain: 0.05 }); },
  thud(t) { tone(t, 90, 0.3, { f2: 40, gain: 0.5 }); noise(t, 0.2, { f: 400, gain: 0.3 }); },
  victory(t) {
    [['D5', 0.12], ['F#5', 0.12], ['A5', 0.12], ['D6', 0.24], ['A5', 0.12], ['D6', 0.8]].reduce((x, [n, d]) => {
      chipNote('p25', freq(n), x, d, 0.09, { vib: 20, dest: sfxBus });
      chipNote('tri4', freq(n) / 2, x, d, 0.28, { dest: sfxBus });
      return x + d;
    }, t);
  },
  defeat(t) {
    [['G4', 0.32], ['F#4', 0.32], ['F4', 0.32], ['E4', 1.1]].reduce((x, [n, d]) => {
      chipNote('p50', freq(n), x, d, 0.08, { vib: 30, dest: sfxBus });
      chipNote('tri4', freq(n) / 2, x, d, 0.28, { dest: sfxBus });
      return x + d + 0.05;
    }, t);
  },
  // ---- mini-jeux
  revolver(t) {
    noise(t, 0.35, { f: 5000, f2: 300, gain: 0.7, slap: true });
    noise(t, 0.05, { type: 'highpass', f: 3500, gain: 0.5 });
    tone(t, 160, 0.18, { f2: 40, gain: 0.5 });
  },
  far(t) { noise(t, 0.3, { f: 1800, f2: 200, gain: 0.25, slap: true }); tone(t, 120, 0.12, { f2: 40, gain: 0.15 }); },
  dry(t) { tone(t, 2600, 0.015, { type: 'square', gain: 0.1 }); },
  reload(t) {
    for (let i = 0; i < 4; i++) tone(t + i * 0.12, 2100 + i * 90, 0.03, { type: 'square', gain: 0.07 });
    noise(t + 0.55, 0.06, { type: 'bandpass', f: 1600, q: 3, gain: 0.5 });
  },
  glass(t) {
    for (let i = 0; i < 5; i++) tone(t + i * 0.03, 3000 + Math.random() * 2500, 0.12, { type: 'triangle', gain: 0.06 });
    noise(t, 0.25, { type: 'highpass', f: 4000, gain: 0.35 });
  },
  hurt(t) { noise(t, 0.25, { f: 900, f2: 120, gain: 0.5 }); tone(t, 180, 0.3, { type: 'sawtooth', f2: 70, gain: 0.12 }); },
  rope(t) { noise(t, 0.18, { type: 'bandpass', f: 600, f2: 2400, q: 2, gain: 0.25 }); },
  moo(t) { tone(t, 140, 0.6, { type: 'sawtooth', f2: 110, gain: 0.1, attack: 0.08 }); },
  cluck(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.07, 900, 0.05, { type: 'square', f2: 600, gain: 0.05 }); },
  oink(t) { tone(t, 300, 0.14, { type: 'sawtooth', f2: 200, gain: 0.08 }); tone(t + 0.16, 280, 0.12, { type: 'sawtooth', f2: 190, gain: 0.07 }); },
  baa(t) { tone(t, 420, 0.4, { type: 'square', f2: 380, gain: 0.05, attack: 0.05 }); },
  neigh(t) { tone(t, 700, 0.5, { type: 'sawtooth', f2: 350, gain: 0.07, attack: 0.04 }); },
  stink(t) { noise(t, 0.6, { f: 400, f2: 120, gain: 0.3 }); tone(t, 90, 0.5, { type: 'sawtooth', gain: 0.06 }); },
  // décor de la fusillade : le chien qui se réveille, le chat qui file
  bark(t) { for (let i = 0; i < 2; i++) { tone(t + i * 0.18, 420, 0.08, { type: 'sawtooth', f2: 260, gain: 0.08 }); noise(t + i * 0.18, 0.06, { type: 'bandpass', f: 900, q: 2, gain: 0.25 }); } },
  meow(t) { tone(t, 700, 0.35, { type: 'triangle', f2: 1100, gain: 0.05, attack: 0.05 }); tone(t + 0.2, 1100, 0.2, { type: 'triangle', f2: 600, gain: 0.04 }); },
  tick(t) { tone(t, 880, 0.08, { type: 'square', gain: 0.06 }); },
  // Winchester : détonation sèche puis le levier qu'on actionne
  rifle(t) {
    noise(t, 0.3, { f: 6500, f2: 350, gain: 0.6, slap: true });
    noise(t, 0.04, { type: 'highpass', f: 4000, gain: 0.45 });
    tone(t, 130, 0.14, { f2: 45, gain: 0.4 });
    noise(t + 0.13, 0.03, { type: 'bandpass', f: 1800, q: 4, gain: 0.35 });
    noise(t + 0.19, 0.03, { type: 'bandpass', f: 2400, q: 4, gain: 0.3 });
  },
  crate(t) {
    noise(t, 0.12, { type: 'bandpass', f: 900, q: 2, gain: 0.6 });
    tone(t, 220, 0.1, { type: 'triangle', f2: 110, gain: 0.15 });
    noise(t + 0.08, 0.15, { type: 'bandpass', f: 1500, q: 3, gain: 0.3 });
  },
  power(t) { [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.05, f, 0.12, { type: 'square', gain: 0.05 })); },
  boom(t) {
    noise(t, 1.4, { f: 2500, f2: 60, gain: 1.0 });
    tone(t, 70, 0.8, { f2: 25, gain: 0.9 });
    noise(t + 0.3, 1.0, { f: 600, f2: 80, gain: 0.3 });
  },
  thunder(t) {
    noise(t, 0.25, { f: 3000, f2: 500, gain: 0.5 });
    noise(t + 0.1, 2.2, { f: 400, f2: 60, gain: 0.7 });
    tone(t + 0.05, 55, 1.6, { f2: 30, gain: 0.35 });
  },
  sand(t) { noise(t, 1.6, { type: 'bandpass', f: 500, f2: 2500, q: 1, gain: 0.35, decay: true }); },
  go(t) { tone(t, 1320, 0.25, { type: 'square', gain: 0.07 }); tone(t, 660, 0.25, { type: 'square', gain: 0.05 }); },

  // ---- Doom-like : une détonation par arme (le calibre s'entend : claquement, grave, écho, mécanique)
  // Colt : la détonation franche du .45, le barillet qui tourne
  colt(t) {
    noise(t, 0.4, { f: 5200, f2: 280, gain: 0.75, slap: true });
    noise(t, 0.05, { type: 'highpass', f: 3500, gain: 0.55 });
    tone(t, 150, 0.2, { f2: 40, gain: 0.55 });
    noise(t + 0.16, 0.02, { type: 'bandpass', f: 2600, q: 5, gain: 0.18 });
  },
  // Schofield : plus sec et plus aigu, coup de feu plus court
  schofield(t) {
    noise(t, 0.26, { f: 7000, f2: 450, gain: 0.65, slap: true });
    noise(t, 0.04, { type: 'highpass', f: 4500, gain: 0.55 });
    tone(t, 210, 0.13, { f2: 60, gain: 0.4 });
  },
  // Derringer : petit « pop » de poche, aigu, presque pas de grave
  derringer(t) {
    noise(t, 0.16, { f: 4200, f2: 700, gain: 0.55, slap: true });
    noise(t, 0.03, { type: 'highpass', f: 5000, gain: 0.45 });
    tone(t, 300, 0.07, { f2: 110, gain: 0.25 });
  },
  // Deux colts : deux détonations à quelques millisecondes, la seconde un peu plus grave
  akimbo(t) {
    SFX.colt(t);
    noise(t + 0.045, 0.3, { f: 4200, f2: 250, gain: 0.55 });
    tone(t + 0.045, 135, 0.16, { f2: 38, gain: 0.4 });
  },
  // Winchester : détonation longue, puis le levier qu'on baisse et relève, la douille qui tinte
  winchester(t) {
    noise(t, 0.45, { f: 6500, f2: 300, gain: 0.7, slap: true });
    noise(t, 0.04, { type: 'highpass', f: 4000, gain: 0.5 });
    tone(t, 120, 0.22, { f2: 40, gain: 0.5 });
    noise(t + 0.2, 0.035, { type: 'bandpass', f: 1500, q: 4, gain: 0.4 });
    tone(t + 0.2, 700, 0.03, { type: 'square', gain: 0.04 });
    noise(t + 0.3, 0.035, { type: 'bandpass', f: 2300, q: 4, gain: 0.38 });
    tone(t + 0.3, 1100, 0.03, { type: 'square', gain: 0.04 });
    tone(t + 0.42, 3300, 0.06, { gain: 0.04 });
  },
  // Winchester dorée : même levier, détonation plus brillante qui résonne longtemps
  goldwin(t) {
    SFX.winchester(t);
    tone(t, 2400, 0.5, { type: 'triangle', f2: 1800, gain: 0.03, slap: true });
  },
  // Sharps : le gros calibre de chasse au bison, grondement qui roule dans les collines, culasse qui s'ouvre
  sharps(t) {
    noise(t, 0.6, { f: 7000, f2: 160, gain: 1.0, slap: true });
    noise(t, 0.05, { type: 'highpass', f: 3000, gain: 0.7 });
    tone(t, 65, 0.6, { f2: 24, gain: 0.95 });
    for (let i = 1; i <= 3; i++) noise(t + 0.38 * i, 0.7, { f: 1100 / i, f2: 110, gain: 0.28 / i });
    noise(t + 0.6, 0.04, { type: 'bandpass', f: 1300, q: 4, gain: 0.45 });
    tone(t + 0.6, 600, 0.04, { type: 'square', gain: 0.05 });
  },
  // Fusil à pompe : grosse détonation large, puis « tchk-tchk »
  shotgun(t) {
    noise(t, 0.65, { f: 4000, f2: 140, gain: 1.0, slap: true });
    noise(t, 0.07, { type: 'highpass', f: 2200, gain: 0.7 });
    tone(t, 80, 0.32, { f2: 28, gain: 0.95 });
    SFX.pump(t + 0.33);
  },
  // Canon scié : les deux canons à la fois, une explosion sourde et énorme
  sawed(t) {
    noise(t, 0.8, { f: 3200, f2: 110, gain: 1.0, slap: true });
    noise(t + 0.012, 0.6, { f: 5000, f2: 200, gain: 0.7 });
    noise(t, 0.09, { type: 'highpass', f: 1800, gain: 0.8 });
    tone(t, 62, 0.45, { f2: 22, gain: 1.0 });
  },
  // Gatling : rafale mécanique, la manivelle claque entre deux coups
  gatling(t) {
    noise(t, 0.1, { f: 4200, f2: 400, gain: 0.5 });
    tone(t, 140, 0.06, { f2: 60, gain: 0.28 });
    noise(t + 0.04, 0.015, { type: 'bandpass', f: 2600, q: 5, gain: 0.2 });
  },

  // ---- Doom-like : balles, lames, mécanique
  // ricochet « piiouu » : la balle chante en repartant (deux sifflements qui battent entre eux)
  ricochet(t) {
    const f = 2000 + Math.random() * 1800, len = 0.45 + Math.random() * 0.3;
    tone(t, f, len, { type: 'triangle', f2: f * 0.4, gain: 0.07, attack: 0.01 });
    tone(t, f * 1.015, len * 0.85, { f2: f * 0.42, gain: 0.05, attack: 0.01 });
    noise(t, 0.035, { type: 'highpass', f: 3000, gain: 0.3 });
  },
  // la balle touche : impact mat dans la chair (le « toc » qui confirme)
  hitmark(t) {
    tone(t, 150, 0.08, { f2: 60, gain: 0.35 });
    noise(t, 0.05, { type: 'bandpass', f: 1100, q: 1.5, gain: 0.35 });
  },
  // lame qui fend l'air, coup qui porte, lame qu'on dégaine
  swish(t) { noise(t, 0.2, { type: 'bandpass', f: 500 + Math.random() * 200, f2: 3500, q: 3, gain: 0.4 }); },
  chop(t) {
    noise(t, 0.12, { type: 'bandpass', f: 500, q: 1.5, gain: 0.6 });
    tone(t, 120, 0.15, { f2: 50, gain: 0.5 });
    noise(t + 0.02, 0.1, { type: 'highpass', f: 2500, gain: 0.15 });
  },
  unsheathe(t) { noise(t, 0.32, { type: 'bandpass', f: 3000, f2: 6500, q: 6, gain: 0.2 }); tone(t + 0.28, 4200, 0.25, { type: 'triangle', gain: 0.03 }); },
  // sortir l'arme : cuir de l'étui, puis le chien qu'on arme (clic-clac)
  draw(t) {
    noise(t, 0.12, { type: 'bandpass', f: 900, f2: 1800, q: 1.5, gain: 0.22 });
    noise(t + 0.13, 0.03, { type: 'highpass', f: 3500, gain: 0.3 });
    tone(t + 0.13, 1900, 0.025, { type: 'square', gain: 0.07 });
    noise(t + 0.2, 0.03, { type: 'bandpass', f: 2200, q: 3, gain: 0.35 });
    tone(t + 0.2, 1300, 0.03, { type: 'square', gain: 0.06 });
  },
  // fin de recharge : le barillet ou la culasse se referme
  snap(t) {
    noise(t, 0.03, { type: 'bandpass', f: 1800, q: 4, gain: 0.45 });
    tone(t, 1500, 0.03, { type: 'square', gain: 0.06 });
  },
  // cartouches glissées une à une (winchester, pompe), canon scié qu'on casse
  shells(t) { for (let i = 0; i < 4; i++) SFX.shellIn(t + i * 0.28); },
  breakopen(t) {
    noise(t, 0.05, { type: 'bandpass', f: 1200, q: 3, gain: 0.5 });
    tone(t + 0.12, 2700, 0.08, { gain: 0.05 });
    tone(t + 0.2, 3100, 0.07, { gain: 0.04 });
  },
  // pas dans la poussière, éperons qui tintent, sabots au galop
  step(t) { noise(t, 0.07, { f: 350 + Math.random() * 250, gain: 0.14 }); },
  spur(t) { for (let i = 0; i < 3; i++) tone(t + i * 0.022 + Math.random() * 0.01, 4200 + Math.random() * 1500, 0.09, { type: 'triangle', gain: 0.016 }); },
  hoof(t) {
    tone(t, 240 + Math.random() * 70, 0.06, { type: 'triangle', f2: 110, gain: 0.2 });
    noise(t, 0.05, { f: 900, gain: 0.16 });
  },
  // ramassages : cartouches qui s'entrechoquent, gilet de cuir et sa boucle, mèche qui grésille
  ammo(t) {
    for (let i = 0; i < 4; i++) tone(t + i * 0.045, 2500 + i * 230 + Math.random() * 150, 0.07, { type: 'triangle', gain: 0.07 });
    noise(t, 0.08, { type: 'bandpass', f: 3000, q: 2, gain: 0.15 });
  },
  armor(t) {
    noise(t, 0.15, { type: 'bandpass', f: 700, q: 1.5, gain: 0.3 });
    tone(t + 0.12, 1700, 0.08, { type: 'triangle', gain: 0.07 });
    tone(t + 0.16, 2300, 0.15, { type: 'triangle', gain: 0.05 });
  },
  fuse(t) {
    noise(t, 0.7, { type: 'highpass', f: 5500, f2: 3000, gain: 0.1, decay: false });
    for (let i = 0; i < 4; i++) noise(t + Math.random() * 0.6, 0.012, { type: 'highpass', f: 2500, gain: 0.18 });
  },
  // sifflet de locomotive à vapeur : deux coups, accord mineur qui monte un peu
  steam(t) {
    for (const [at, d] of [[0, 0.35], [0.45, 1.2]]) {
      for (const m of [62, 65, 69]) chipNote('triangle', mtof(m), t + at, d, 0.07, { gate: 1, vib: 8, dest: sfxBus });
      noise(t + at, d, { type: 'bandpass', f: 1400, q: 1, gain: 0.12, decay: false });
    }
  },
  // glas : grosse cloche de l'église de Boot Hill
  toll(t) {
    for (const [k, lvl, len] of [[1, 1, 3.5], [2, 0.6, 2.4], [2.4, 0.45, 2], [3, 0.3, 1.5], [4.2, 0.2, 1]]) {
      tone(t, 146 * k, len, { gain: 0.12 * lvl, slap: k === 1 });
    }
    noise(t, 0.03, { type: 'highpass', f: 3000, gain: 0.2 });
  },

  // ---- Doom-like : voix (bandits, joueur, El Diablo)
  // « Hé ! » ou « Yaaah ! » : le bandit vous a vu
  yell(t) {
    const p = 0.85 + Math.random() * 0.35;
    if (Math.random() < 0.5) voice(t, 0.24, { f0: 230 * p, f1: 290 * p, from: 'e', to: 'e', gain: 0.3 });
    else voice(t, 0.5, { f0: 200 * p, f1: 310 * p, from: 'i', to: 'a', gain: 0.3 });
  },
  // le bandit tombe : râle qui descend, puis le corps dans la poussière
  grunt(t) {
    const p = 0.8 + Math.random() * 0.5;
    voice(t, 0.55, { f0: 190 * p, f1: 85 * p, from: 'a', to: 'u', gain: 0.3, growl: 0.3 });
    tone(t + 0.5, 85, 0.25, { f2: 40, gain: 0.35 });
    noise(t + 0.5, 0.18, { f: 400, gain: 0.2 });
  },
  // ---- le cri de Corsi (public/sfx/yeehaw.wav) : rafale de mitrailleuse, « YIIIHAAA ! », fin de rafale
  // joué entier pour les grands moments (victoires, gatling, El Diablo abattu)
  yeehaw(t) { if (!sample('yeehaw', t, { gain: 0.9, cool: 3 })) SFX.yell(t); },
  // le cri seul, sans la mitrailleuse, un peu plus aigu ou plus grave à chaque fois (manche gagnée, belle prise…)
  hiha(t) { if (!sample('yeehaw', t, { from: 0.55, to: 2.4, gain: 0.8, rate: 0.94 + Math.random() * 0.12, cool: 2 })) SFX.yell(t); },

  // le joueur prend une balle / meurt
  oof(t) { voice(t, 0.2, { f0: 160, f1: 105, from: 'u', to: 'o', gain: 0.28, growl: 0.2 }); },
  scream(t) { voice(t, 1.0, { f0: 430, f1: 170, from: 'a', to: 'o', gain: 0.32, growl: 0.15, breath: 0.08 }); },
  // El Diablo : rire grave et rauque, et son hurlement quand il tombe
  laugh(t) {
    for (let i = 0; i < 6; i++) voice(t + i * 0.17, i === 5 ? 0.4 : 0.13, { f0: 125 - i * 6, f1: 108 - i * 7, from: 'a', gain: 0.38, growl: 0.45, breath: 0.03 });
    tone(t, 55, 1.1, { f2: 45, gain: 0.25 });
  },
  roar(t) {
    voice(t, 1.8, { f0: 115, f1: 42, from: 'a', to: 'u', gain: 0.42, growl: 0.5, breath: 0.2 });
    noise(t, 2, { f: 600, f2: 60, gain: 0.4 });
  },
};

// Échantillons enregistrés, dans public/sfx (publié en ligne, contrairement à public/music) et déjà passés
// en 16 bits comme CRUSH['16bit'] : mono, 16 kHz, 10 bits, coupe-bas 40 Hz, passe-bas 6,5 kHz.
const SAMPLES = { yeehaw: 'sfx/yeehaw.wav' };
const sampleBuf = {};
const sampleAt = {};
function loadSamples() {
  for (const [k, url] of Object.entries(SAMPLES)) {
    fetch(url).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => ac.decodeAudioData(b))
      .then((buf) => { sampleBuf[k] = buf; }, () => {});
  }
}

// Joue le passage [from, to] (s) d'un échantillon, avec l'écho de canyon. rate : vitesse (et hauteur).
// cool : secondes pendant lesquelles il ne se relance pas (deux cris qui se chevauchent, c'est la bouillie).
// Faux tant que le fichier n'est pas chargé : l'appelant joue alors un son de secours.
function sample(name, t, { from = 0, to = null, gain = 1, rate = 1, cool = 0 } = {}) {
  const buf = sampleBuf[name];
  if (!buf) return false;
  if (t - (sampleAt[name] ?? -1e9) < cool) return true;
  sampleAt[name] = t;
  const end = Math.min(to ?? buf.duration, buf.duration), len = (end - from) / rate;
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.playbackRate.value = rate;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.setValueAtTime(gain, t + Math.max(0.01, len - 0.08));
  g.gain.linearRampToValueAtTime(0.0001, t + len);
  src.connect(g).connect(sfxBus);
  g.connect(sfxSlap);
  src.start(t, from, end - from);
  return true;
}

// Voix synthétique : corde vocale en dent de scie (glissando f0 -> f1) dans deux formants qui passent
// d'une voyelle à l'autre ; growl : voix rauque (modulée en amplitude à 35 Hz), breath : souffle
const VOW = { a: [750, 1150], o: [480, 850], u: [350, 650], e: [450, 1850], i: [300, 2250] };
function voice(t, dur, { f0, f1 = f0, from = 'a', to = from, gain = 0.3, growl = 0, breath = 0.06 }) {
  const end = t + dur;
  const o = osc('sawtooth', f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, end);
  vibrato(o, t, dur, 25, 7, 0.05);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain * 4, t + 0.025);
  g.gain.setValueAtTime(gain * 4, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, end);
  let src = o;
  if (growl) {
    src = ac.createGain();
    src.gain.value = 1 - growl;
    const lfo = osc('square', 35, t);
    const lg = ac.createGain();
    lg.gain.value = growl;
    lfo.connect(lg).connect(src.gain);
    lfo.start(t);
    lfo.stop(end + 0.05);
    o.connect(src);
  }
  for (let k = 0; k < 2; k++) {
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 5;
    bp.frequency.setValueAtTime(VOW[from][k], t);
    bp.frequency.exponentialRampToValueAtTime(VOW[to][k], end);
    src.connect(bp).connect(g);
  }
  g.connect(sfxBus);
  o.start(t);
  o.stop(end + 0.05);
  if (breath) noise(t, dur, { type: 'bandpass', f: VOW[from][1], f2: VOW[to][1], q: 3, gain: breath });
}

// Limiteur : chaque bruitage crée plusieurs générateurs qui durent jusqu'à une seconde. Avec une arme
// automatique ou une salve d'explosions, des dizaines se superposaient et saturaient les téléphones.
// Un même son au plus toutes les 40 ms, et au plus 14 bruitages lancés par quart de seconde.
// prio : le tir du joueur passe toujours (sinon, en pleine fusillade, sa propre arme devenait muette).
const sfxLast = {};
const sfxRecent = [];
export function sfx(name, delay = 0, prio = false) {
  if (!ac || !SFX[name] || document.hidden) return;
  const now = performance.now();
  if (!delay && !prio && now - (sfxLast[name] || -1e9) < 40) return;
  while (sfxRecent.length && now - sfxRecent[0] > 250) sfxRecent.shift();
  if (sfxRecent.length >= 14 && !prio) return;
  sfxRecent.push(now);
  if (!delay) sfxLast[name] = now;
  SFX[name](ac.currentTime + delay);
}
