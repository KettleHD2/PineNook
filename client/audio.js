// audio.js — procedural soundscapes and chill music, generated live with the Web Audio API.
// There are no audio files: nothing to download or license, and nothing for the activity's
// content-security policy to block.

export const LAYERS = [
  { id: "rain", label: "Rain", icon: "rain", gain: 0.9 },
  { id: "wind", label: "Forest wind", icon: "tree", gain: 1 },
  { id: "birds", label: "Birds", icon: "bird", gain: 1 },
  { id: "crickets", label: "Night crickets", icon: "moon", gain: 0.9 },
  { id: "fire", label: "Campfire", icon: "flame", gain: 1 },
  { id: "stream", label: "Stream", icon: "drop", gain: 0.9 },
  { id: "waves", label: "Ocean waves", icon: "wave", gain: 1 },
];
export const MUSIC = [
  { id: "off", label: "Off" },
  { id: "lofi", label: "Lo-fi" },
  { id: "piano", label: "Soft piano" },
  { id: "dream", label: "Dreamy" },
  { id: "box", label: "Music box" },
];
export const PRESETS = [
  { id: "morning", label: "Forest morning", layers: { birds: 0.55, wind: 0.35, stream: 0.3 }, music: "off" },
  { id: "cabin", label: "Rainy cabin", layers: { rain: 0.6, fire: 0.45, wind: 0.2 }, music: "piano" },
  { id: "campfire", label: "Campfire night", layers: { fire: 0.6, crickets: 0.4, wind: 0.2 }, music: "off" },
  { id: "focus", label: "Deep focus", layers: { rain: 0.35 }, music: "lofi" },
];

// ---------- state (volumes are remembered; what's playing is not, so nothing blasts on launch) ----------
const KEY = "flowsesh-sound";
const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));
export const state = {
  master: 0.8,
  musicVol: 0.5,
  lastMusic: "lofi",
  vol: Object.fromEntries(LAYERS.map((l) => [l.id, 0.5])),
  on: {},
  music: "off",
};
try {
  const s = JSON.parse(localStorage.getItem(KEY) || "null");
  if (s) {
    if (typeof s.master === "number") state.master = clamp01(s.master);
    if (typeof s.musicVol === "number") state.musicVol = clamp01(s.musicVol);
    if (MUSIC.some((m) => m.id === s.lastMusic)) state.lastMusic = s.lastMusic;
    LAYERS.forEach((l) => { if (typeof s.vol?.[l.id] === "number") state.vol[l.id] = clamp01(s.vol[l.id]); });
  }
} catch (e) {}

const subs = new Set();
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };
const emit = () => subs.forEach((f) => f());
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ master: state.master, musicVol: state.musicVol, lastMusic: state.lastMusic, vol: state.vol }));
  } catch (e) {}
}
export const isPlaying = () => state.music !== "off" || Object.values(state.on).some(Boolean);

// ---------- audio graph ----------
let ctx = null, master, ambBus, musicBus, musicIn, tone, reverb;
const running = new Map();
let mus = null;

function ensure() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = state.master;
    const comp = ctx.createDynamicsCompressor(); // keeps stacked layers from clipping
    master.connect(comp);
    comp.connect(ctx.destination);
    ambBus = ctx.createGain();
    ambBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = state.musicVol ** 2 * 0.9;
    musicBus.connect(master);
    musicIn = ctx.createGain();
    tone = filt("lowpass", 4500);
    musicIn.connect(tone);
    tone.connect(musicBus);
    reverb = makeReverb();
    const send = gain(0.28);
    tone.connect(send);
    send.connect(reverb);
    reverb.connect(musicBus);
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}

const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
const filt = (type, freq, q = 1) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };

function makeReverb() {
  const len = Math.floor(ctx.sampleRate * 2.2);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
  }
  const cv = ctx.createConvolver();
  cv.buffer = buf;
  return cv;
}

const noiseCache = {};
function noiseBuf(type) {
  if (noiseCache[type]) return noiseCache[type];
  const len = Math.floor(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let last = 0, b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === "brown") { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else if (type === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else d[i] = w;
    }
  }
  noiseCache[type] = buf;
  return buf;
}

function loopNoise(type) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(type);
  s.loop = true;
  s.start(0, Math.random() * 3);
  return s;
}

function lfo(rate, depth, param, type = "sine") {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.value = rate;
  const d = gain(depth);
  o.connect(d);
  d.connect(param);
  o.start();
  return o;
}

// one short filtered burst of noise (crackles, hi-hats, snares)
function hit(dest, t, { freq = 2000, q = 1, dur = 0.03, vol = 0.4 }) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf("white");
  const bp = filt("bandpass", freq * (0.7 + Math.random() * 0.6), q);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol * (0.4 + Math.random() * 0.6), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(bp);
  bp.connect(g);
  g.connect(dest);
  s.start(t, Math.random() * 3, dur + 0.02);
}

function kit() {
  const srcs = [];
  let alive = true;
  return {
    get alive() { return alive; },
    src(n) { srcs.push(n); return n; },
    stop() { alive = false; srcs.forEach((n) => { try { n.stop(); } catch (e) {} }); },
  };
}

// ---------- ambient layers ----------
function chirp(dest, t, f0, f1, dur, vol) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

const BUILD = {
  rain(out) {
    const k = kit();
    const hiss = k.src(loopNoise("white")), hp = filt("highpass", 1100), lp = filt("lowpass", 9000), hg = gain(0.22);
    hiss.connect(hp); hp.connect(lp); lp.connect(hg); hg.connect(out);
    const body = k.src(loopNoise("pink")), bp = filt("bandpass", 650, 0.6), bg = gain(0.55);
    body.connect(bp); bp.connect(bg); bg.connect(out);
    return k.stop;
  },
  wind(out) {
    const k = kit(), n = k.src(loopNoise("pink")), bp = filt("bandpass", 500, 0.9), g = gain(0.6);
    n.connect(bp); bp.connect(g); g.connect(out);
    k.src(lfo(0.08, 0.35, g.gain));
    k.src(lfo(0.05, 260, bp.frequency));
    const r = k.src(loopNoise("white")), hp = filt("highpass", 3500), rg = gain(0.04); // leaves rustling
    r.connect(hp); hp.connect(rg); rg.connect(out);
    k.src(lfo(0.13, 0.04, rg.gain));
    return k.stop;
  },
  birds(out) {
    const k = kit();
    const phrase = () => {
      if (!k.alive) return;
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.6 - 0.8;
      pan.connect(out);
      const base = 2200 + Math.random() * 2200, n = 2 + ((Math.random() * 5) | 0);
      const gap = 0.07 + Math.random() * 0.08, vol = 0.05 + Math.random() * 0.08, t0 = ctx.currentTime + 0.05;
      for (let i = 0; i < n; i++) {
        const up = Math.random() < 0.5;
        chirp(pan, t0 + i * gap * 1.6, base * (up ? 0.8 : 1.2), base * (up ? 1.25 : 0.85), gap, vol);
      }
      setTimeout(phrase, 1200 + Math.random() * 4500);
    };
    phrase();
    return k.stop;
  },
  crickets(out) {
    const k = kit();
    for (let i = 0; i < 3; i++) {
      const o = k.src(ctx.createOscillator());
      o.frequency.value = 3900 + Math.random() * 1000;
      const pulse = gain(0.5), burst = gain(0.5), pan = ctx.createStereoPanner(), v = gain(0.035);
      pan.pan.value = Math.random() * 1.6 - 0.8;
      o.connect(pulse); pulse.connect(burst); burst.connect(v); v.connect(pan); pan.connect(out);
      k.src(lfo(28 + Math.random() * 8, 0.5, pulse.gain));
      k.src(lfo(1.8 + Math.random() * 1.4, 0.5, burst.gain, "square"));
      o.start();
    }
    return k.stop;
  },
  fire(out) {
    const k = kit(), n = k.src(loopNoise("brown")), lp = filt("lowpass", 320), g = gain(1.1);
    n.connect(lp); lp.connect(g); g.connect(out);
    const crackle = () => {
      if (!k.alive) return;
      const big = Math.random() < 0.12;
      hit(out, ctx.currentTime, { freq: big ? 1400 : 3200, q: 1.2, dur: big ? 0.06 : 0.025, vol: big ? 0.7 : 0.35 });
      setTimeout(crackle, 25 + Math.random() * (big ? 400 : 220));
    };
    crackle();
    return k.stop;
  },
  stream(out) {
    const k = kit(), n = k.src(loopNoise("white")), bp = filt("bandpass", 1500, 0.6), g = gain(0.35);
    n.connect(bp); bp.connect(g); g.connect(out);
    [[2600, 3.1, 520, 0.18], [900, 2.2, 260, 0.16], [4200, 4.3, 800, 0.08]].forEach(([fq, rate, depth, vol]) => {
      const s = k.src(loopNoise("white")), f = filt("bandpass", fq, 4), v = gain(vol);
      s.connect(f); f.connect(v); v.connect(out);
      k.src(lfo(rate, depth, f.frequency)); // bubbling
    });
    return k.stop;
  },
  waves(out) {
    const k = kit(), n = k.src(loopNoise("pink")), lp = filt("lowpass", 1200), g = gain(0.5);
    n.connect(lp); lp.connect(g); g.connect(out);
    k.src(lfo(0.11, 0.35, g.gain));
    k.src(lfo(0.037, 0.12, g.gain));
    const f = k.src(loopNoise("white")), hp = filt("highpass", 2200), fg = gain(0.1); // foam
    f.connect(hp); hp.connect(fg); fg.connect(out);
    k.src(lfo(0.11, 0.09, fg.gain));
    return k.stop;
  },
};

const levelOf = (id) => state.vol[id] ** 2 * (LAYERS.find((l) => l.id === id)?.gain ?? 1);

export function setLayerOn(id, on) {
  if (!BUILD[id]) return;
  state.on[id] = on;
  if (on) {
    if (state.vol[id] < 0.02) state.vol[id] = 0.5;
    ensure();
    let r = running.get(id);
    if (r) { clearTimeout(r.timer); r.timer = 0; }
    else {
      const out = ctx.createGain();
      out.gain.value = 0;
      out.connect(ambBus);
      r = { out, stop: BUILD[id](out), timer: 0 };
      running.set(id, r);
    }
    r.out.gain.setTargetAtTime(levelOf(id), ctx.currentTime, 0.15);
  } else {
    const r = running.get(id);
    if (r) {
      r.out.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
      r.timer = setTimeout(() => { r.stop(); r.out.disconnect(); running.delete(id); }, 700);
    }
  }
  save();
  emit();
}

export function setLayerVolume(id, v) {
  state.vol[id] = clamp01(v);
  if (state.vol[id] <= 0.001) { state.vol[id] = 0; return setLayerOn(id, false); }
  if (!state.on[id]) return setLayerOn(id, true);
  const r = running.get(id);
  if (r) r.out.gain.setTargetAtTime(levelOf(id), ctx.currentTime, 0.05);
  save();
  emit();
}

export function setMaster(v) {
  state.master = clamp01(v);
  if (ctx) master.gain.setTargetAtTime(state.master, ctx.currentTime, 0.03);
  save();
  emit();
}

// ---------- music ----------
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const pick = (a) => a[(Math.random() * a.length) | 0];
const PENT = [67, 69, 72, 74, 76, 79]; // C-major pentatonic: sits nicely over every chord below
const PROGS = [
  [[48, 52, 55, 59, 62], [45, 48, 52, 55, 59], [50, 53, 57, 60, 64], [43, 47, 53, 57, 64]], // Cmaj9 Am9 Dm9 G13
  [[53, 57, 60, 64, 67], [52, 55, 59, 62, 66], [45, 48, 52, 55, 59], [50, 53, 57, 60, 64]], // Fmaj9 Em9 Am9 Dm9
  [[45, 48, 52, 55, 59], [50, 53, 57, 60, 64], [43, 47, 50, 55, 59], [48, 52, 55, 59, 62]], // Am9 Dm9 G Cmaj9
];

function voice(dest, t, f, type, peak, attack, decay) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}
const epiano = (d, t, m, dur, v = 0.8) => {
  voice(d, t, hz(m), "sine", 0.2 * v, 0.006, dur * 1.3);
  voice(d, t, hz(m) * 2, "triangle", 0.05 * v, 0.003, dur * 0.5);
  voice(d, t, hz(m) * 4, "sine", 0.03 * v, 0.002, 0.18);
};
const piano = (d, t, m, dur, v = 0.7) => {
  voice(d, t, hz(m), "triangle", 0.22 * v, 0.008, dur);
  voice(d, t, hz(m) * 2, "sine", 0.06 * v, 0.005, dur * 0.6);
  voice(d, t, hz(m) * 3, "sine", 0.025 * v, 0.003, dur * 0.3);
};
const bell = (d, t, m, dur, v = 0.8) => {
  voice(d, t, hz(m), "sine", 0.16 * v, 0.003, dur);
  voice(d, t, hz(m) * 2.76, "sine", 0.05 * v, 0.002, dur * 0.35);
  voice(d, t, hz(m) * 5.4, "sine", 0.02 * v, 0.002, dur * 0.15);
};
function pad(dest, t, midis, dur) {
  const lp = filt("lowpass", 700 + Math.random() * 300, 0.7), g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.5, t + dur * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 1.5);
  lp.connect(g);
  g.connect(dest);
  midis.forEach((m) => [-7, 7].forEach((det) => {
    const o = ctx.createOscillator(), v = gain(0.045);
    o.type = "sawtooth";
    o.frequency.value = hz(m);
    o.detune.value = det;
    o.connect(v);
    v.connect(lp);
    o.start(t);
    o.stop(t + dur + 1.6);
  }));
}
function kick(dest, t, vel = 1) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
  g.gain.setValueAtTime(0.7 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g);
  g.connect(dest);
  o.start(t);
  o.stop(t + 0.32);
}
const snare = (d, t) => { hit(d, t, { freq: 1800, q: 0.7, dur: 0.14, vol: 0.35 }); voice(d, t, 190, "triangle", 0.18, 0.001, 0.09); };
const hat = (d, t, vol) => hit(d, t, { freq: 7500, q: 1.5, dur: 0.05, vol });

const STYLES = {
  lofi: {
    bpm: 74, swing: 0.2, tone: 2600, crackle: true,
    play(m, i, t) {
      const s = i % 16, chord = m.prog[((i / 16) | 0) % 4];
      if (s === 0) chord.forEach((n, k) => epiano(m.out, t + k * 0.02, n + m.key, m.sd * 15, 0.9 - k * 0.1));
      if ((s === 6 || s === 10 || s === 14) && Math.random() < 0.6) epiano(m.out, t, pick(PENT) + m.key, 1.2, 0.8);
      if (s === 0 || s === 10) kick(m.out, t);
      else if (s === 7 && Math.random() < 0.35) kick(m.out, t, 0.6);
      if (s === 4 || s === 12) snare(m.out, t);
      if (s % 2 === 0 && Math.random() < 0.85) hat(m.out, t, s % 4 === 0 ? 0.06 : 0.035);
    },
  },
  piano: {
    bpm: 62, swing: 0, tone: 4500,
    play(m, i, t) {
      const s = i % 16, chord = m.prog[((i / 16) | 0) % 4];
      if (s === 0) chord.slice(0, 4).forEach((n, k) => piano(m.out, t + k * 0.28, n + m.key, m.sd * 16, 0.7 - k * 0.08));
      else if (s % 2 === 0 && Math.random() < 0.3) piano(m.out, t, pick(PENT) + m.key, 3.2, 0.45 + Math.random() * 0.25);
    },
  },
  dream: {
    bpm: 42, swing: 0, tone: 3200,
    play(m, i, t) {
      const s = i % 32, chord = m.prog[((i / 32) | 0) % 4];
      if (s === 0) pad(m.out, t, chord.map((n) => n + m.key), m.sd * 32);
      if (s % 2 === 0 && Math.random() < 0.07) bell(m.out, t, pick(PENT) + 12 + m.key, 4, 0.5);
    },
  },
  box: {
    bpm: 92, swing: 0, tone: 6500,
    play(m, i, t) {
      const s = i % 16, chord = m.prog[((i / 16) | 0) % 4];
      if (s % 2 === 0 && Math.random() < 0.9) bell(m.out, t, chord[[0, 1, 2, 3, 4, 3, 2, 1][(s / 2) % 8]] + 12 + m.key, 2.2, 0.8);
      if (s === 0) bell(m.out, t, chord[0] + m.key, 3.5, 0.8);
    },
  },
};

function startCrackle(dest) {
  const len = Math.floor(ctx.sampleRate * 3);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.015 + (Math.random() < 0.0007 ? (Math.random() * 2 - 1) * 0.9 : 0);
  const s = ctx.createBufferSource();
  s.buffer = buf;
  s.loop = true;
  const hp = filt("highpass", 700), g = gain(0.5);
  s.connect(hp); hp.connect(g); g.connect(dest);
  s.start();
  return s;
}

function startMusic(id) {
  const style = STYLES[id];
  if (!style) return;
  ensure();
  const out = ctx.createGain();
  out.connect(musicIn);
  tone.frequency.setTargetAtTime(style.tone, ctx.currentTime, 0.3);
  const m = { id, out, key: pick([-4, -2, 0, 2, 3]), prog: pick(PROGS), sd: 60 / style.bpm / 4, i: 0, next: ctx.currentTime + 0.15, timer: 0, extra: [] };
  if (style.crackle) m.extra.push(startCrackle(out));
  // look ahead ~1s so playback stays smooth even when the tab is throttled
  m.timer = setInterval(() => {
    while (m.next < ctx.currentTime + 1) {
      if (m.i % 256 === 0) m.prog = pick(PROGS);
      style.play(m, m.i, m.next + (m.i % 2 ? style.swing * m.sd : 0));
      m.next += m.sd;
      m.i++;
    }
  }, 200);
  mus = m;
}

function stopMusic() {
  if (!mus) return;
  const m = mus;
  mus = null;
  clearInterval(m.timer);
  m.out.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
  setTimeout(() => {
    m.extra.forEach((s) => { try { s.stop(); } catch (e) {} });
    try { m.out.disconnect(); } catch (e) {}
  }, 1200);
}

export function setMusic(id) {
  if (id !== "off") state.lastMusic = id;
  state.music = id;
  stopMusic();
  if (id !== "off") startMusic(id);
  save();
  emit();
}

export function setMusicVolume(v) {
  state.musicVol = clamp01(v);
  if (ctx) musicBus.gain.setTargetAtTime(state.musicVol ** 2 * 0.9, ctx.currentTime, 0.05);
  save();
  emit();
}

export function applyPreset(p) {
  LAYERS.forEach((l) => {
    if (p.layers[l.id]) state.vol[l.id] = p.layers[l.id];
    setLayerOn(l.id, !!p.layers[l.id]);
  });
  setMusic(p.music);
}

export function stopAll() {
  LAYERS.forEach((l) => setLayerOn(l.id, false));
  setMusic("off");
}
