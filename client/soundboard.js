// soundboard.js — the Soundboard window (ambient mixer, chill music, presets) and its HUD button.
import "./sound.css";
import { setIcon } from "./icons.js";
import {
  LAYERS, MUSIC, PRESETS, state, subscribe, isPlaying,
  setMaster, setLayerOn, setLayerVolume, setMusic, setMusicVolume, applyPreset, stopAll,
} from "./audio.js";

const modal = document.getElementById("sound-modal");
const panel = document.getElementById("sound-panel");
const hudBtn = document.getElementById("toggle-sound");

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

function range(value, onInput) {
  const r = el("input", "snd-range");
  r.type = "range";
  r.min = 0;
  r.max = 100;
  r.step = 1;
  r.value = Math.round(value * 100);
  r.addEventListener("input", () => onInput(r.value / 100));
  return r;
}

if (!modal || !panel || !hudBtn) {
  console.warn("Soundboard: sound-modal / sound-panel / toggle-sound not found in index.html");
} else {
  const layerRefs = {};
  const musicBtns = [];

  panel.appendChild(el("h3", "", "Soundboard"));

  const masterRow = el("div", "snd-row");
  masterRow.append(el("label", "", "Master"));
  const masterRange = range(state.master, setMaster);
  masterRow.appendChild(masterRange);
  panel.appendChild(masterRow);

  panel.appendChild(el("h4", "snd-h", "Nature & ambience"));
  const grid = el("div", "snd-grid");
  LAYERS.forEach((l) => {
    const item = el("div", "snd-item");
    const head = el("div", "snd-head");
    const tog = el("button", "ibtn small snd-tog");
    tog.title = "Toggle " + l.label;
    setIcon(tog, l.icon);
    tog.addEventListener("click", () => setLayerOn(l.id, !state.on[l.id]));
    head.append(tog, el("span", "", l.label));
    const r = range(state.vol[l.id], (v) => setLayerVolume(l.id, v));
    item.append(head, r);
    grid.appendChild(item);
    layerRefs[l.id] = { item, range: r };
  });
  panel.appendChild(grid);

  panel.appendChild(el("h4", "snd-h", "Chill music"));
  const musicRow = el("div", "snd-music");
  MUSIC.forEach((m) => {
    const b = el("button", "buddy-opt", m.label);
    b.addEventListener("click", () => setMusic(m.id));
    musicRow.appendChild(b);
    musicBtns.push([m.id, b]);
  });
  panel.appendChild(musicRow);
  const musicVolRow = el("div", "snd-row");
  musicVolRow.append(el("label", "", "Music volume"));
  const musicRange = range(state.musicVol, setMusicVolume);
  musicVolRow.appendChild(musicRange);
  panel.appendChild(musicVolRow);

  panel.appendChild(el("h4", "snd-h", "Presets"));
  const presets = el("div", "snd-music");
  PRESETS.forEach((p) => {
    const b = el("button", "buddy-opt", p.label);
    b.addEventListener("click", () => applyPreset(p));
    presets.appendChild(b);
  });
  panel.appendChild(presets);

  const actions = el("div", "wb-controls");
  const stopBtn = el("button", "", "Stop all");
  stopBtn.addEventListener("click", stopAll);
  const closeBtn = el("button", "", "Close");
  const close = () => modal.classList.add("hidden");
  closeBtn.addEventListener("click", close);
  actions.append(stopBtn, closeBtn);
  panel.appendChild(actions);

  function update() {
    LAYERS.forEach((l) => {
      const r = layerRefs[l.id];
      r.item.classList.toggle("on", !!state.on[l.id]);
      const v = Math.round(state.vol[l.id] * 100);
      if (document.activeElement !== r.range && +r.range.value !== v) r.range.value = v;
    });
    musicBtns.forEach(([id, b]) => b.classList.toggle("selected", state.music === id));
    if (document.activeElement !== musicRange) musicRange.value = Math.round(state.musicVol * 100);
    if (document.activeElement !== masterRange) masterRange.value = Math.round(state.master * 100);
    hudBtn.classList.toggle("playing", isPlaying());
  }

  subscribe(update);
  update();
  hudBtn.addEventListener("click", () => modal.classList.remove("hidden"));
  modal.addEventListener("click", (e) => { if (e.target === modal) close(); });
}
