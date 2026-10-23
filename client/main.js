import { DiscordSDK } from "@discord/embedded-app-sdk";
import "./style.css";
import "./hud.css";
import "./profile.css";
import {
  getPose, drawSpriteBody, drawSpriteFront,
  CHAR_TYPES, COLOR_LABEL, COLOR_CHOICES, OUTFIT_CHOICES, SKIN_CHOICES, ACC_CHOICES, HAIR_CHOICES,
  parseChar, encodeChar, defaultChar,
} from "./sprites.js";
import { PX, snap, cells, gline, pixelText, cleanText, drawName, drawPill, ICONS } from "./pixel.js";
import { paintBackground, drawCampfireArt, drawDeskArt, drawDeskShadow, drawEmptyTableArt } from "./scenery.js";
import { setIcon, mountIcons, drawIcon, REACTION_ICON } from "./icons.js";
import { drawPet, PET_SPECIES, PET_COLOR_SWATCHES, STAGE_NAMES } from "./pet.js";
import "./soundboard.js";

let ROOM = "default";
let serverOffset = 0; // serverNow - Date.now(), keeps everyone's timers aligned
const now = () => Date.now() + serverOffset;

let focusMin = 25;
let breakMin = 5;
let ready = false; // don't sync until auth finishes, so no ghost "User_123" entries

let myState = {
  userKey: Math.random().toString(36).substring(2, 9),
  name: "User_" + Math.floor(Math.random() * 1000),
  tableIndex: null,
  status: "🟢 Deep Focus",
  goal: "",
  phase: "focus",
  running: false,
  endsAt: 0,
  remaining: 25 * 60,
  total: 25 * 60,
  focusedToday: 0, // server-counted focus seconds today (the server is the source of truth)
  tz: new Date().getTimezoneOffset(), // so the server knows when your "day" rolls over
  char: "", // chosen buddy, e.g. "cat.2.4.1.0.0" (empty = auto look from your id)
};

let remoteUsers = {};

async function initDiscord() {
  try {
    let clientId = import.meta.env.VITE_DISCORD_CLIENT_ID;
    if (!clientId) {
      const cfg = await (await fetch("/api/config")).json();
      clientId = cfg.clientId;
    }
    if (!clientId) throw new Error("Missing VITE_DISCORD_CLIENT_ID");

    const discordSdk = new DiscordSDK(clientId);
    await discordSdk.ready();
    ROOM = discordSdk.instanceId || "default";

    // prompt: "none" reuses a previous approval silently; the consent screen only appears if they never approved
    const authorize = (scope, prompt) =>
      discordSdk.commands.authorize({ client_id: clientId, response_type: "code", state: "", prompt, scope });
    const FULL = ["identify", "guilds", "guilds.members.read", "applications.commands"];
    const BASIC = ["identify"];
    let code;
    const attempts = [[FULL, "none"], [BASIC, "none"], [FULL, undefined], [BASIC, undefined]];
    for (const [scope, prompt] of attempts) {
      try {
        ({ code } = await authorize(scope, prompt));
        break;
      } catch (err) {
        console.warn("Authorize attempt failed:", scope.length, prompt, err);
      }
    }
    if (!code) throw new Error("Authorization failed");

    const tokenRes = await fetch("/api/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      throw new Error("Token exchange failed: " + JSON.stringify(tokenData));
    }
    const { access_token } = tokenData;

    const auth = await discordSdk.commands.authenticate({ access_token });
    if (auth?.user) {
      myState.userKey = auth.user.id; // stable id: reloads replace you instead of duplicating
      myState.name = auth.user.global_name || auth.user.username || myState.name;
    }

    const profileRes = await fetch("/api/user-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access_token, guild_id: discordSdk.guildId }),
    });
    if (profileRes.ok) {
      const p = await profileRes.json();
      if (p.name) myState.name = p.name;
    }
  } catch (err) {
    console.error("Discord Auth Error (running in standalone fallback):", err);
  } finally {
    ready = true;
    loadChar();
    loadDeck();
    syncState();
  }
}

window.addEventListener("beforeunload", () => {
  navigator.sendBeacon(
    "/api/leave",
    new Blob([JSON.stringify({ room: ROOM, userKey: myState.userKey })], { type: "application/json" })
  );
});

// ---------- DOM ELEMENTS & SETUP ----------
const canvas = document.getElementById("forest-canvas");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const timerDisplay = document.getElementById("timer-display");
const startTimerButton = document.getElementById("start-timer");
const resetTimerButton = document.getElementById("reset-timer");
const statusInput = document.getElementById("status-input");

const toggleWhiteboardButton = document.getElementById("toggle-wb");
const whiteboardModal = document.getElementById("whiteboard-modal");
const closeWhiteboardButton = document.getElementById("close-wb");
const clearWhiteboardButton = document.getElementById("clear-wb");
const drawCanvas = document.getElementById("draw-canvas");
const drawCtx = drawCanvas.getContext("2d");

const W = canvas.width;
const H = canvas.height;
const CENTER_X = W / 2;
const CENTER_Y = H / 2;

const TABLE_COUNT = 8;
const TABLE_RADIUS = 155;
const TABLE_W = 72;
const TABLE_H = 48;

let timerRunning = false;
let timerInterval = null;
let drawing = false;
let lastPoint = null;

const tables = Array.from({ length: TABLE_COUNT }, (_, i) => {
  const angle = (i / TABLE_COUNT) * Math.PI * 2 - Math.PI / 2;
  return {
    id: i,
    x: CENTER_X + Math.cos(angle) * TABLE_RADIUS,
    y: CENTER_Y + Math.sin(angle) * TABLE_RADIUS,
    angle,
  };
});

// ---------- FOREST BACKGROUND ----------
// The scene canvas is a fixed 540x540, but the window can be wider/taller. The forest floor is painted on a
// separate canvas behind it that grows (in whole pixel-art cells, so the grid still lines up) to fill the box.
const bgCanvas = document.getElementById("bg-canvas");
let bgKey = "";
function layoutBackground() {
  const box = canvas.parentElement.getBoundingClientRect();
  const r = canvas.getBoundingClientRect();
  const s = Math.min(r.width, r.height) / W; // CSS px per scene pixel
  if (!s || !box.width || !box.height) return;
  const pad = (cssPx, base) => Math.max(0, Math.ceil((cssPx / s - base) / 2 / PX) * PX);
  const padX = pad(box.width, W);
  const padY = pad(box.height, H);
  bgCanvas.style.width = (W + 2 * padX) * s + "px";
  bgCanvas.style.height = (H + 2 * padY) * s + "px";
  const key = padX + "|" + padY;
  if (key === bgKey) return;
  bgKey = key;
  bgCanvas.width = W + 2 * padX;
  bgCanvas.height = H + 2 * padY;
  const g = bgCanvas.getContext("2d");
  g.imageSmoothingEnabled = false;
  paintBackground(g, bgCanvas.width, bgCanvas.height, bgCanvas.width / 2, bgCanvas.height / 2);
}
new ResizeObserver(layoutBackground).observe(canvas.parentElement);
layoutBackground();

// ---------- DESKS & STUDY SPRITES ----------
function occupantOf(table) {
  return Object.values(remoteUsers).find((u) => u.tableIndex === table.id);
}

// Draw the desk + sprite for one table (labels come in a separate pass so they're never covered)
function drawTable(table) {
  const u = occupantOf(table);
  ctx.save();
  ctx.translate(snap(table.x), snap(table.y)); // stay on the global pixel grid
  if (!u) drawEmptyTableArt(ctx);
  else {
    // fire position relative to this table, so the sprite can reach toward it when roasting
    const fire = { x: CENTER_X - snap(table.x), y: CENTER_Y - snap(table.y) };
    const pose = getPose(u, timeLeftOf(u), performance.now() / 1000, fire);
    drawDeskShadow(ctx);
    drawSpriteBody(ctx, pose); // head + shoulders, behind the desk
    drawDeskArt(ctx);
    drawSpriteFront(ctx, pose); // arms, book, mug, stick... in front of the desk
    drawTablePet(u);
  }
  ctx.restore();
}

// each seated player's pet sits on the floor beside their desk
function drawTablePet(u) {
  const p = u.profile;
  if (!p) return;
  ctx.save();
  ctx.translate(20 * PX, 7 * PX);
  drawPet(ctx, p.pet, p.stage, performance.now() / 1000, {
    sleepy: p.mood === "sleepy",
    active: u.running && u.phase === "focus",
  });
  ctx.restore();
}

function drawTableLabels(table) {
  const u = occupantOf(table);
  if (!u) return;
  ctx.save();
  ctx.translate(snap(table.x), snap(table.y));
  drawLabels(u);
  ctx.restore();
}

// ---------- CENTRAL CAMPFIRE ----------
function drawCampfire() {
  drawCampfireArt(ctx, CENTER_X, CENTER_Y, performance.now() / 1000);
}

// ---------- HELPERS ----------
const JSON_HEADERS = { "Content-Type": "application/json" };
const clip = (t, n) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
const fmtDur = (s) => {
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
};
const timeLeftOf = (u) => (u.running ? Math.max(0, Math.round((u.endsAt - now()) / 1000)) : Math.round(u.remaining));

const phaseBadge = document.getElementById("phase-badge");
const goalInput = document.getElementById("goal-input");
const presetSelect = document.getElementById("preset-select");
const toastEl = document.getElementById("toast");
const rosterPanel = document.getElementById("roster-panel");
const rosterList = document.getElementById("roster-list");
const rosterBtn = document.getElementById("toggle-roster");
const rosterCount = document.getElementById("roster-count");

let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 4000);
}

let audioCtx;
function chime() {
  try {
    audioCtx = audioCtx || new AudioContext();
    [660, 880].forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + i * 0.25;
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
      o.start(t);
      o.stop(t + 0.5);
    });
  } catch (e) {}
}

// ---------- LABELS, PROGRESS RING, REACTIONS (called from drawTable) ----------
function drawLabels(u) {
  const left = timeLeftOf(u);
  const brk = u.phase === "break";
  const frac = u.total ? Math.min(1, Math.max(0, 1 - left / u.total)) : 0;
  const active = !u.running ? "#7d8a80" : brk ? "#88c0d0" : "#a3d977";

  drawName(ctx, u.name, 0, -90, "#ffffff", { max: 12 });

  // chunky progress bar under the desk (fills as the timer runs)
  cells(ctx, -13, 10, 26, 3, "#0b120d");
  cells(ctx, -12, 11, 24, 1, "#1f3326");
  cells(ctx, -12, 11, Math.round(24 * frac), 1, active);

  const pillBg = !u.running ? "#4a5550" : brk ? "#3b6a7a" : "#3b5c42";
  drawPill(ctx, 51, fmt(left) + (u.running ? "" : " ||"), pillBg, brk ? ICONS.mug : ICONS.tomato);
  if (u.status) {
    const s = cleanText(u.status, 12);
    if (s) drawPill(ctx, 72, s, "#1b2a20");
  }
  if (u.goal) {
    const g = cleanText(u.goal, 12);
    if (g) pixelText(ctx, "> " + g, 0, 85, "#cfe3d4", { align: "center", shadow: true });
  }
}

let floaters = [];
function drawFloaters() {
  const t = performance.now();
  floaters = floaters.filter((f) => t - f.born < 2500);
  floaters.forEach((f) => {
    const age = (t - f.born) / 2500;
    const u = remoteUsers[f.userKey];
    const tb = u && u.tableIndex !== null && u.tableIndex !== undefined ? tables[u.tableIndex] : null;
    const x = snap((tb ? tb.x : CENTER_X) + Math.sin(age * 6 + f.id) * 8);
    const y = snap((tb ? tb.y - 78 : CENTER_Y - 50) - age * 60);
    ctx.globalAlpha = 1 - age;
    drawIcon(ctx, REACTION_ICON[f.emoji] || "star", x - 18, y - 18, 3);
    ctx.globalAlpha = 1;
  });
}

function drawScene() {
  ctx.clearRect(0, 0, W, H);
  tables.forEach(drawTable);
  drawCampfire();
  tables.forEach(drawTableLabels);
  drawFloaters();
}

function loop() {
  drawScene();
  requestAnimationFrame(loop);
}

// ---------- SYNC ----------
let strokeCount = 0;
let boardEpoch = 0;
let eventCursor = null;
let syncing = false;
let dirty = false;

async function syncState() {
  if (!ready) return;
  if (syncing) { dirty = true; return; }
  syncing = true;
  try {
    const res = await fetch("/api/sync", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({
        room: ROOM,
        me: myState,
        since: strokeCount,
        epoch: boardEpoch,
        lastEvent: eventCursor ?? 999999999,
      }),
    });
    const data = await res.json();
    serverOffset = data.serverNow - Date.now();
    remoteUsers = data.users || {};

    const me = remoteUsers[myState.userKey];
    if (me && me.focusedToday > myState.focusedToday) myState.focusedToday = me.focusedToday;
    if (me?.profile) onMyProfile(me.profile);
    if (!pf.modal.classList.contains("hidden")) renderProfile();

    onBattle(data.battle);
    applyBoard(data.board);
    if (eventCursor !== null) {
      (data.events || [])
        .filter((e) => e.userKey !== myState.userKey)
        .forEach((e) => floaters.push({ ...e, born: performance.now() }));
    }
    eventCursor = data.lastEventId;
    renderRoster();
  } catch (err) {
  } finally {
    syncing = false;
    if (dirty) { dirty = false; syncState(); }
  }
}

setInterval(syncState, 2000);
setInterval(() => { if (!whiteboardModal.classList.contains("hidden") || (battle && (battle.status === "active" || battle.status === "pending"))) syncState(); }, 500);

// ---------- ROSTER / STUDY BOARD ----------
const rosterRows = new Map();

// the board can rank by today / last 7 days / all time (all server-counted)
let rosterMode = "today";
const rosterValue = (u) => {
  const p = u.profile;
  if (!p) return u.focusedToday || 0;
  return rosterMode === "all" ? p.total : rosterMode === "week" ? p.week.reduce((a, b) => a + b, 0) : p.today;
};
document.querySelectorAll("#roster-tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    rosterMode = b.dataset.mode;
    document.querySelectorAll("#roster-tabs button").forEach((x) => x.classList.toggle("selected", x === b));
    renderRoster();
  })
);

function setText(el, v) {
  if (el.textContent !== v) el.textContent = v;
}

function buildRow(u) {
  const row = document.createElement("div");
  row.className = "roster-row";
  const av = document.createElement("div");
  av.className = "roster-avatar";
  const info = document.createElement("div");
  info.className = "roster-info";
  const n = document.createElement("strong");
  const s = document.createElement("span");
  info.append(n, s);
  const stats = document.createElement("div");
  stats.className = "roster-stats";
  const t = document.createElement("div");
  const f = document.createElement("small");
  stats.append(t, f);
  const btn = document.createElement("button");
  btn.className = "challenge-btn ibtn small";
  setIcon(btn, "sword");
  btn.addEventListener("click", () => challenge(u.userKey));
  row.append(av, info, stats, btn);
  row.classList.add("clickable"); // click anyone to see their profile & pet
  row.addEventListener("click", (e) => { if (!e.target.closest(".challenge-btn")) openProfile(u.userKey); });
  return { row, av, n, s, t, f, btn, avatar: undefined };
}

function renderRoster() {
  const users = Object.values(remoteUsers).sort((a, b) => rosterValue(b) - rosterValue(a));
  rosterCount.textContent = String(users.length);
  if (rosterPanel.classList.contains("hidden")) return;

  const seen = new Set();
  users.forEach((u, idx) => {
    seen.add(u.userKey);
    let r = rosterRows.get(u.userKey);
    if (!r) { r = buildRow(u); rosterRows.set(u.userKey, r); }
    const isMe = u.userKey === myState.userKey;

    setText(r.n, `#${idx + 1} ${u.name}${isMe ? " (you)" : ""}`);
    setText(r.s, [u.status, u.goal].filter(Boolean).join(" · "));
    setText(r.t, `${u.phase === "break" ? "BREAK" : "FOCUS"} ${fmt(timeLeftOf(u))}${u.running ? "" : " (paused)"}`);
    setText(r.f, `${fmtDur(rosterValue(u))}${u.profile ? ` · Lv ${u.profile.level}` : ""}`);
    r.row.title = `View profile · ${u.cardCount} flashcard${u.cardCount === 1 ? "" : "s"}`;
    if (r.avatar !== u.avatar) {
      r.avatar = u.avatar;
      r.av.style.backgroundImage = u.avatar ? `url("${u.avatar}")` : "";
      r.av.textContent = u.avatar ? "" : (u.name || "?")[0].toUpperCase();
    }
    r.btn.classList.toggle("hidden", isMe);
    r.btn.disabled = !!u.busy || !u.cardCount;
    r.btn.title = u.busy ? "In a battle" : !u.cardCount ? "No flashcards yet" : "Challenge to a knowledge battle";

    if (rosterList.children[idx] !== r.row) rosterList.insertBefore(r.row, rosterList.children[idx] || null);
  });
  for (const [k, r] of rosterRows) {
    if (!seen.has(k)) { r.row.remove(); rosterRows.delete(k); }
  }
}

rosterBtn.addEventListener("click", () => {
  rosterPanel.classList.toggle("hidden");
  renderRoster();
});

// ---------- SIT / STAND ----------
function getCanvasPosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener("click", (event) => {
  const { x, y } = getCanvasPosition(event);

  if (myState.tableIndex !== null) {
    const cur = tables[myState.tableIndex];
    if (Math.abs(x - cur.x) < TABLE_W / 2 + 8 && y > cur.y - 74 && y < cur.y + TABLE_H / 2 + 8) {
      myState.tableIndex = null;
      syncState();
      return;
    }
  }

  const clicked = tables.find(
    (t) => Math.abs(x - t.x) < TABLE_W / 2 + 6 && Math.abs(y - t.y) < TABLE_H / 2 + 6
  );
  if (!clicked) return;
  const other = Object.values(remoteUsers).find((u) => u.tableIndex === clicked.id && u.userKey !== myState.userKey);
  if (other) return openProfile(other.userKey);

  myState.tableIndex = clicked.id;
  syncState();
});

// ---------- POMODORO (focus / break) ----------
function updateTimerDisplay() {
  timerDisplay.textContent = fmt(timeLeftOf(myState));
  setIcon(startTimerButton, myState.running ? "pause" : "play");
  startTimerButton.title = myState.running ? "Pause" : "Start";
  setIcon(phaseBadge, myState.phase === "focus" ? "tomato" : "mug");
}

function setPhase(p) {
  myState.phase = p;
  myState.total = (p === "focus" ? focusMin : breakMin) * 60;
  myState.remaining = myState.total;
  myState.running = false;
  myState.endsAt = 0;
  updateTimerDisplay();
}

function startTimer() {
  if (myState.running) {
    myState.remaining = timeLeftOf(myState);
    myState.running = false;
  } else {
    if (myState.remaining <= 0) setPhase(myState.phase);
    myState.running = true;
    myState.endsAt = now() + myState.remaining * 1000;
  }
  updateTimerDisplay();
  syncState();
}

function completePhase() {
  const wasFocus = myState.phase === "focus";
  // the server only counts it if it really credited the time, then awards the bonus XP
  if (wasFocus) post("/api/session", { total: myState.total }).then(() => syncState());
  chime();
  toast(wasFocus ? "🔥 Focus session complete! +10 XP. Time for a break." : "☕ Break's over — ready to focus?");
  setPhase(wasFocus ? "break" : "focus");
  syncState();
}

let lastTick = Date.now();
setInterval(() => {
  const t = Date.now();
  if (myState.running && myState.phase === "focus") myState.focusedToday += (t - lastTick) / 1000;
  lastTick = t;
  if (myState.running && timeLeftOf(myState) <= 0) completePhase();
  updateTimerDisplay();
  renderRoster();
}, 1000);

startTimerButton.addEventListener("click", startTimer);
resetTimerButton.addEventListener("click", () => { setPhase(myState.phase); syncState(); });
presetSelect.addEventListener("change", () => {
  [focusMin, breakMin] = presetSelect.value.split(",").map(Number);
  setPhase("focus");
  syncState();
});

statusInput.addEventListener("focus", (e) => e.target.select());
statusInput.addEventListener("input", (e) => { myState.status = e.target.value || "Focused"; syncState(); });
goalInput.addEventListener("input", (e) => { myState.goal = e.target.value; syncState(); });

// ---------- REACTIONS ----------
let lastReact = 0;
document.querySelectorAll(".react").forEach((btn) =>
  btn.addEventListener("click", () => {
    if (Date.now() - lastReact < 600) return;
    lastReact = Date.now();
    const emoji = btn.dataset.emoji;
    floaters.push({ id: Math.random(), userKey: myState.userKey, emoji, born: performance.now() });
    fetch("/api/react", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ room: ROOM, userKey: myState.userKey, emoji }),
    }).catch(() => {});
  })
);

// ---------- WHITEBOARD ----------
let brush = { color: "#263b2a", width: 3 };
document.querySelectorAll(".wb-color").forEach((b) =>
  b.addEventListener("click", () => { brush = { color: b.dataset.color, width: Number(b.dataset.width || 3) }; })
);

toggleWhiteboardButton.addEventListener("click", () => whiteboardModal.classList.remove("hidden"));
closeWhiteboardButton.addEventListener("click", () => whiteboardModal.classList.add("hidden"));
whiteboardModal.addEventListener("click", (e) => { if (e.target === whiteboardModal) whiteboardModal.classList.add("hidden"); });

// Pixel-art strokes: every segment is stamped as squares on a WB_PX grid (same on every client)
const WB_PX = 4;
function drawLocalSegment(s) {
  const size = Math.max(1, Math.round((s.width || 3) / WB_PX));
  const off = Math.floor(size / 2);
  const g = (v) => Math.round(v / WB_PX);
  drawCtx.fillStyle = s.color || "#263b2a";
  gline(g(s.x0), g(s.y0), g(s.x1), g(s.y1), (x, y) =>
    drawCtx.fillRect((x - off) * WB_PX, (y - off) * WB_PX, size * WB_PX, size * WB_PX)
  );
}

function applyBoard(b) {
  if (!b) return;
  if (b.reset) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  boardEpoch = b.epoch;
  b.strokes.forEach(drawLocalSegment);
  strokeCount = b.from + b.strokes.length;
}

// Strokes are batched so dragging doesn't fire a request per pixel
let pending = [];
setInterval(async () => {
  if (!pending.length) return;
  const strokes = pending;
  pending = [];
  try {
    await fetch("/api/draw", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ room: ROOM, strokes }) });
  } catch (e) {
    pending = strokes.concat(pending);
  }
}, 150);

function getDrawPosition(event) {
  const rect = drawCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (drawCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (drawCanvas.height / rect.height),
  };
}

drawCanvas.addEventListener("pointerdown", (event) => {
  drawing = true;
  lastPoint = getDrawPosition(event);
  drawCanvas.setPointerCapture(event.pointerId);
});

drawCanvas.addEventListener("pointermove", (event) => {
  if (!drawing || !lastPoint) return;
  const p = getDrawPosition(event);
  const stroke = { x0: lastPoint.x, y0: lastPoint.y, x1: p.x, y1: p.y, width: brush.width, color: brush.color };
  drawLocalSegment(stroke);
  pending.push(stroke);
  lastPoint = p;
});

function stopDrawing() { drawing = false; lastPoint = null; }
drawCanvas.addEventListener("pointerup", stopDrawing);
drawCanvas.addEventListener("pointercancel", stopDrawing);
drawCanvas.addEventListener("lostpointercapture", stopDrawing);

clearWhiteboardButton.addEventListener("click", async () => {
  try {
    await fetch("/api/clear-board", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ room: ROOM }) });
  } catch (e) {}
  syncState();
});

// ---------- FLASHCARDS ----------
const $ = (id) => document.getElementById(id);
const shuffle = (a) => a.map((v) => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map((x) => x[1]);
const post = (path, body) =>
  fetch(path, {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ room: ROOM, userKey: myState.userKey, ...body }),
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false }));

const cardsModal = $("cards-modal");
const cardList = $("card-list");
const cardQ = $("card-q");
const cardA = $("card-a");
const studyCard = $("study-card");
let deck = [];

function uploadDeck() {
  post("/api/deck", { cards: deck });
}

function saveDeck() {
  try { localStorage.setItem("flowsesh-deck-" + myState.userKey, JSON.stringify(deck)); } catch (e) {}
  uploadDeck();
  renderDeck();
}

function loadDeck() {
  try { deck = JSON.parse(localStorage.getItem("flowsesh-deck-" + myState.userKey) || "[]"); } catch (e) { deck = []; }
  if (!Array.isArray(deck)) deck = [];
  renderDeck();
  if (deck.length) uploadDeck();
}

function renderDeck() {
  $("card-count").textContent = `${deck.length} card${deck.length === 1 ? "" : "s"}`;
  cardList.replaceChildren(
    ...deck.map((c, i) => {
      const row = document.createElement("div");
      row.className = "card-row";
      const t = document.createElement("span");
      t.textContent = `${c.q} → ${c.a}`;
      t.title = t.textContent;
      const x = document.createElement("button");
      x.textContent = "✕";
      x.title = "Delete";
      x.addEventListener("click", () => { deck.splice(i, 1); saveDeck(); });
      row.append(t, x);
      return row;
    })
  );
}

function addCard() {
  const q = cardQ.value.trim();
  const a = cardA.value.trim();
  if (!q || !a) return toast("Fill in both the question and the answer.");
  if (deck.length >= 100) return toast("Deck is full (100 cards).");
  deck.push({ q, a });
  cardQ.value = "";
  cardA.value = "";
  saveDeck();
  cardQ.focus();
}

$("card-add").addEventListener("click", addCard);
cardA.addEventListener("keydown", (e) => { if (e.key === "Enter") addCard(); });
$("toggle-cards").addEventListener("click", () => cardsModal.classList.remove("hidden"));
$("close-cards").addEventListener("click", () => cardsModal.classList.add("hidden"));

// Solo study mode: click the card to flip it
let studyOrder = [];
let studyIdx = -1;
let showingAnswer = false;

function renderStudy() {
  const c = deck[studyOrder[studyIdx]];
  if (!c) return;
  studyCard.textContent = showingAnswer ? "✅ " + c.a : "❓ " + c.q;
  studyCard.classList.toggle("flipped", showingAnswer);
}

$("study-next").addEventListener("click", () => {
  if (!deck.length) { studyCard.textContent = "Add a few cards first!"; return; }
  if (studyIdx < 0 || studyIdx + 1 >= studyOrder.length || studyOrder.length !== deck.length) {
    studyOrder = shuffle(deck.map((_, i) => i));
    studyIdx = 0;
  } else studyIdx++;
  showingAnswer = false;
  renderStudy();
});
studyCard.addEventListener("click", () => {
  if (studyIdx < 0) return;
  showingAnswer = !showingAnswer;
  renderStudy();
});

// ---------- AI CARD GENERATOR ----------
const genBtn = $("gen-btn");
const genAdd = $("gen-add");
const genResults = $("gen-results");
let generated = [];

function renderGenerated() {
  genResults.replaceChildren(
    ...generated.map((c) => {
      const label = document.createElement("label");
      label.className = "gen-row";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = true;
      const t = document.createElement("span");
      t.textContent = `${c.q} → ${c.a}`;
      label.append(cb, t);
      return label;
    })
  );
  genAdd.classList.toggle("hidden", generated.length === 0);
}

genBtn.addEventListener("click", async () => {
  const course = $("gen-course").value.trim();
  if (!course) return toast("Enter a course or subject first.");
  genBtn.disabled = true;
  genBtn.textContent = "Generating…";
  const r = await post("/api/generate", {
    course,
    level: $("gen-level").value,
    topic: $("gen-topic").value.trim(),
    institution: $("gen-inst").value.trim(),
    notes: $("gen-notes").value,
    count: Number($("gen-count").value),
  });
  genBtn.disabled = false;
  genBtn.textContent = "Generate";
  if (!r.ok) return toast(r.error || "Couldn't generate cards.");
  generated = r.cards;
  renderGenerated();
});

genAdd.addEventListener("click", () => {
  const boxes = [...genResults.querySelectorAll("input[type=checkbox]")];
  const chosen = generated.filter((_, i) => boxes[i] && boxes[i].checked).slice(0, 100 - deck.length);
  if (!chosen.length) return toast("Nothing selected (or your deck is full).");
  deck.push(...chosen);
  saveDeck();
  generated = [];
  renderGenerated();
  toast(`Added ${chosen.length} card${chosen.length === 1 ? "" : "s"} to your deck.`);
});

// ---------- KNOWLEDGE BATTLE ----------
let battle = null;
let dismissedId = null;
let notifiedId = null;
let myPick = { key: null, idx: null };

const bEls = {
  modal: $("battle-modal"), names: $("b-names"), scores: $("b-scores"), status: $("b-status"),
  timer: $("b-timer"), fill: $("b-timer-fill"), question: $("b-question"),
  opts: [...document.querySelectorAll("#b-options .opt")], note: $("b-note"),
  accept: $("b-accept"), decline: $("b-decline"), forfeit: $("b-forfeit"), close: $("b-close"),
};
const setShown = (el, on) => el.classList.toggle("hidden", !on);

async function challenge(target) {
  const r = await post("/api/battle/challenge", { target });
  if (!r.ok) toast(r.error || "Couldn't start the battle.");
  syncState();
}

function onBattle(b) {
  const prev = battle;
  battle = b;
  if (b && b.status === "pending" && b.b === myState.userKey && b.id !== notifiedId) {
    notifiedId = b.id;
    chime();
    toast(`⚔️ ${b.names[b.a]} challenged you to a knowledge battle!`);
  }
  if (b && prev && prev.id === b.id && prev.status === "active" && b.status === "done") chime();
  renderBattle();
}

function renderBattle() {
  const b = battle;
  if (!b || b.id === dismissedId) return setShown(bEls.modal, false);
  setShown(bEls.modal, true);

  const me = myState.userKey;
  const opp = b.a === me ? b.b : b.a;
  const nm = (k) => b.names[k] || "Player";
  const pending = b.status === "pending";
  const active = b.status === "active";
  const q = b.question;
  const inQuestion = active && b.phase === "question" && !!q;
  const inReveal = active && b.phase === "reveal" && !!q;

  setText(bEls.names, `${nm(b.a)} vs ${nm(b.b)}`);
  setText(bEls.scores, `${b.scores[b.a] ?? 0}  —  ${b.scores[b.b] ?? 0}`);
  setShown(bEls.accept, pending && b.b === me);
  setShown(bEls.decline, pending);
  setText(bEls.decline, b.b === me ? "Decline" : "Cancel");
  setShown(bEls.forfeit, active);
  setShown(bEls.close, !pending && !active);
  setShown(bEls.timer, inQuestion);
  setShown(bEls.question, inQuestion || inReveal);

  let status = "";
  let note = "";

  if (pending) {
    status = "⚔️ Knowledge Battle";
    note = b.b === me ? `${nm(b.a)} wants to quiz you with flashcards!` : `Waiting for ${nm(b.b)} to accept…`;
  } else if (b.status === "declined") {
    status = "Battle called off";
    note = `${nm(b.declinedBy)} ${b.declinedBy === b.a ? "cancelled" : "declined"}.`;
  } else if (b.status === "expired") {
    status = "Challenge expired";
  } else if (active && b.phase === "ready") {
    status = "Get ready…";
    note = `Starts in ${Math.max(0, Math.ceil((b.phaseEnd - now()) / 1000))}…`;
  } else if (inQuestion || inReveal) {
    const amAnswerer = q.answerer === me;
    const key = `${b.id}:${b.i}`;
    const locked = b.answered || myPick.key === key;
    const pickedIdx = myPick.key === key ? myPick.idx : null;
    const r = inReveal ? b.reveal : null;

    status = `Round ${b.i + 1}/${b.total} · ${nm(q.owner)}'s card`;
    setText(bEls.question, q.q);
    bEls.opts.forEach((btn, i) => {
      const has = i < q.options.length;
      setShown(btn, has);
      if (!has) return;
      setText(btn, q.options[i]);
      btn.disabled = inReveal || !amAnswerer || locked;
      btn.classList.toggle("picked", inQuestion && pickedIdx === i);
      btn.classList.toggle("correct", !!r && r.correct === i);
      btn.classList.toggle("wrong", !!r && r.pick === i && r.pick !== r.correct);
    });

    if (inQuestion) {
      bEls.fill.style.width = Math.max(0, Math.min(100, ((b.phaseEnd - now()) / b.qMs) * 100)) + "%";
      note = amAnswerer
        ? locked ? "Locked in ✔ — waiting for the reveal" : "Pick an answer — faster is worth more!"
        : q.owner === me ? `✏️ Your card — ${nm(q.answerer)} is answering…` : `${nm(q.answerer)} is answering…`;
    } else {
      const who = amAnswerer ? "You" : nm(q.answerer);
      note = r.pick === null || r.pick < 0
        ? `${who} ran out of time ⏱`
        : r.pick === r.correct ? `${who} got it! +${r.points}` : `${who} missed that one`;
    }
  } else if (b.status === "done") {
    const mine = b.scores[me] ?? 0;
    const theirs = b.scores[opp] ?? 0;
    if (b.forfeitBy) status = b.forfeitBy === me ? `🏳️ You forfeited — ${nm(opp)} wins` : "🏆 You win!";
    else status = mine === theirs ? "🤝 It's a tie!" : mine > theirs ? "🏆 You win!" : `${nm(opp)} wins!`;
    note = b.forfeitBy ? `${nm(b.forfeitBy)} forfeited.` : "Good game! Challenge again from the Who's here panel.";
  }

  if (!inQuestion && !inReveal) bEls.opts.forEach((btn) => setShown(btn, false));
  setText(bEls.status, status);
  setText(bEls.note, note);
}

bEls.accept.addEventListener("click", () => post("/api/battle/respond", { id: battle.id, accept: true }).then(syncState));
bEls.decline.addEventListener("click", () => post("/api/battle/respond", { id: battle.id, accept: false }).then(syncState));
bEls.forfeit.addEventListener("click", () => post("/api/battle/leave", { id: battle.id }).then(syncState));
bEls.close.addEventListener("click", () => { dismissedId = battle.id; renderBattle(); });
bEls.opts.forEach((btn, i) =>
  btn.addEventListener("click", () => {
    if (!battle || !battle.question || btn.disabled) return;
    myPick = { key: `${battle.id}:${battle.i}`, idx: i };
    renderBattle();
    post("/api/battle/answer", { id: battle.id, choice: i }).then(syncState);
  })
);
setInterval(renderBattle, 250);

// ---------- BUDDY PICKER (choose your character) ----------
const charKey = () => "flowsesh-char-" + myState.userKey;

function loadChar() {
  try {
    const saved = localStorage.getItem(charKey());
    if (parseChar(saved)) myState.char = saved;
  } catch (e) {}
}

function saveChar() {
  try { localStorage.setItem(charKey(), myState.char); } catch (e) {}
}

const currentChar = () => parseChar(myState.char) || defaultChar(myState.userKey);

const mkEl = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const buddyBtn = document.getElementById("toggle-buddy");

const buddyModal = mkEl("div");
buddyModal.id = "buddy-modal";
buddyModal.className = "hidden";
(document.querySelector(".viewport-container") || document.getElementById("app") || document.body).appendChild(buddyModal);

function setChar(c) {
  myState.char = encodeChar(c);
  saveChar();
  renderBuddy();
  syncState();
}

function swatchRow(label, colors, selected, onPick) {
  const row = mkEl("div", "buddy-row");
  row.appendChild(mkEl("label", "", label));
  colors.forEach((col, i) => {
    const b = mkEl("button", "buddy-swatch" + (i === selected ? " selected" : ""));
    b.style.background = col;
    b.title = String(i + 1);
    b.addEventListener("click", () => onPick(i));
    row.appendChild(b);
  });
  return row;
}

function choiceRow(label, names, selected, onPick) {
  const row = mkEl("div", "buddy-row");
  row.appendChild(mkEl("label", "", label));
  names.forEach((n, i) => {
    const b = mkEl("button", "buddy-opt" + (i === selected ? " selected" : ""), n);
    b.addEventListener("click", () => onPick(i));
    row.appendChild(b);
  });
  return row;
}

function renderBuddy() {
  const c = currentChar();
  buddyModal.innerHTML = "";
  const panel = mkEl("div", "panel buddy-panel");
  panel.appendChild(mkEl("h3", "", "Choose your study buddy"));

  const tiles = mkEl("div", "buddy-tiles");
  CHAR_TYPES.forEach((t) => {
    const tile = mkEl("button", "buddy-tile" + (c.type === t.id ? " selected" : ""));
    const cv = document.createElement("canvas");
    cv.width = 144;
    cv.height = 108;
    cv.dataset.char = encodeChar({ ...c, type: t.id });
    tile.appendChild(cv);
    tile.appendChild(mkEl("span", "", t.label));
    tile.addEventListener("click", () => setChar({ ...c, type: t.id }));
    tiles.appendChild(tile);
  });
  panel.appendChild(tiles);

  panel.appendChild(swatchRow(COLOR_LABEL[c.type], COLOR_CHOICES[c.type], c.color, (i) => setChar({ ...c, color: i })));
  panel.appendChild(swatchRow("Outfit", OUTFIT_CHOICES, c.outfit, (i) => setChar({ ...c, outfit: i })));
  if (c.type === "human") {
    panel.appendChild(swatchRow("Skin", SKIN_CHOICES, c.skin, (i) => setChar({ ...c, skin: i })));
    panel.appendChild(choiceRow("Hair", HAIR_CHOICES, c.hair, (i) => setChar({ ...c, hair: i })));
  }
  panel.appendChild(choiceRow("Extra", ACC_CHOICES, c.acc, (i) => setChar({ ...c, acc: i })));

  const done = mkEl("div", "wb-controls");
  const doneBtn = mkEl("button", "", "Done");
  doneBtn.addEventListener("click", closeBuddy);
  done.appendChild(doneBtn);
  panel.appendChild(done);
  buddyModal.appendChild(panel);
}

// live, animated previews while the picker is open
let buddyRaf = 0;
function buddyLoop() {
  if (buddyModal.classList.contains("hidden")) { buddyRaf = 0; return; }
  const t = performance.now() / 1000;
  buddyModal.querySelectorAll("canvas[data-char]").forEach((cv) => {
    const g = cv.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.fillStyle = "#223829";
    g.fillRect(0, 0, cv.width, cv.height);
    g.save();
    g.translate(72, 84);
    const pose = getPose(
      { char: cv.dataset.char, userKey: myState.userKey, phase: "focus", running: true, total: 1500 },
      1400, t, { x: 0, y: 150 }
    );
    drawSpriteBody(g, pose);
    drawDeskArt(g);
    drawSpriteFront(g, pose);
    g.restore();
  });
  buddyRaf = requestAnimationFrame(buddyLoop);
}

function openBuddy() {
  renderBuddy();
  buddyModal.classList.remove("hidden");
  if (!buddyRaf) buddyRaf = requestAnimationFrame(buddyLoop);
}
function closeBuddy() { buddyModal.classList.add("hidden"); }
buddyBtn.addEventListener("click", openBuddy);
buddyModal.addEventListener("click", (e) => { if (e.target === buddyModal) closeBuddy(); });

// live, animated preview of your own buddy on the big corner button
const buddyPrev = document.getElementById("buddy-preview");
const buddyPrevCtx = buddyPrev.getContext("2d");
buddyPrevCtx.imageSmoothingEnabled = false;
function paintBuddyPreview() {
  const g = buddyPrevCtx;
  g.fillStyle = "#223829";
  g.fillRect(0, 0, buddyPrev.width, buddyPrev.height);
  g.save();
  g.translate(44, 68);
  const pose = getPose(
    { char: myState.char, userKey: myState.userKey, phase: "focus", running: true, total: 1500 },
    1400, performance.now() / 1000, { x: 0, y: 150 }
  );
  drawSpriteBody(g, pose);
  drawDeskArt(g);
  drawSpriteFront(g, pose);
  g.restore();
}
setInterval(paintBuddyPreview, 120);

// ---------- STUDY PROFILES & PETS ----------
const levelBadge = $("level-badge");
const pf = {
  modal: $("profile-modal"), canvas: $("pf-pet"), avatar: $("pf-avatar"), name: $("pf-name"), sub: $("pf-sub"),
  level: $("pf-level"), xp: $("pf-xp"), lvlFill: $("pf-lvl-fill"), evolve: $("pf-evolve"), stageFill: $("pf-stage-fill"),
  total: $("pf-total"), today: $("pf-today"), weeksum: $("pf-weeksum"), streak: $("pf-streak"), best: $("pf-best"),
  sessions: $("pf-sessions"), week: $("pf-week"), custom: $("pf-custom"),
};
const pfCtx = pf.canvas.getContext("2d");
pfCtx.imageSmoothingEnabled = false;
let pfKey = null; // whose profile is open
let pfLast = null; // last snapshot of that user (kept if they leave the room while you look)
let pfRaf = 0;
let lastMine = null;
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
const MOOD_LABEL = { happy: "Happy", ok: "Content", sleepy: "Sleepy" };
const pct = (v) => Math.max(0, Math.min(100, v * 100)) + "%";

// celebrate hatching / evolving / levelling up
function onMyProfile(p) {
  setText(levelBadge, String(p.level));
  if (lastMine) {
    const nm = p.pet.name;
    if (p.stage > lastMine.stage) {
      chime();
      toast(p.stage === 1 ? `🐣 ${nm} hatched!` : `✨ ${nm} evolved into a ${STAGE_NAMES[p.stage]}!`);
    } else if (p.level > lastMine.level) toast(`⭐ Level up! You're level ${p.level}.`);
  } else if (!p.total && !p.sessions) {
    try {
      if (!localStorage.getItem("flowsesh-pet-hint")) {
        localStorage.setItem("flowsesh-pet-hint", "1");
        toast("🥚 You have a pet egg! Study to hatch it — tap the paw to see it.");
      }
    } catch (e) {}
  }
  lastMine = p;
}

function renderProfile() {
  const u = remoteUsers[pfKey] || pfLast;
  if (!u || !u.profile) return;
  pfLast = u;
  const p = u.profile;
  const mine = u.userKey === myState.userKey;
  const species = PET_SPECIES.find((s) => s.id === p.pet.species)?.label || "";

  setText(pf.name, u.name + (mine ? " (you)" : ""));
  setText(pf.sub, `${p.pet.name} · ${p.stage ? `${STAGE_NAMES[p.stage]} ${species}` : "Egg"} · ${MOOD_LABEL[p.mood]}`);
  const av = u.avatar || "";
  if (pf.avatar.dataset.av !== av) {
    pf.avatar.dataset.av = av;
    pf.avatar.style.backgroundImage = av ? `url("${av}")` : "";
    pf.avatar.textContent = av ? "" : (u.name || "?")[0].toUpperCase();
  }

  setText(pf.level, `Lv ${p.level}`);
  setText(pf.xp, `${p.xp} XP · ${p.lvNext - p.xp} to Lv ${p.level + 1}`);
  pf.lvlFill.style.width = pct((p.xp - p.lvBase) / (p.lvNext - p.lvBase));
  if (p.stageNext === null) {
    setText(pf.evolve, "Fully grown ✨ Keep studying to level up");
    pf.stageFill.style.width = "100%";
  } else {
    setText(pf.evolve, `${p.stageNext - p.xp} XP until ${p.stage === 0 ? "it hatches" : STAGE_NAMES[p.stage + 1]}`);
    pf.stageFill.style.width = pct((p.xp - p.stageBase) / (p.stageNext - p.stageBase));
  }

  setText(pf.total, fmtDur(p.total));
  setText(pf.today, fmtDur(p.today));
  setText(pf.weeksum, fmtDur(p.week.reduce((a, b) => a + b, 0)));
  setText(pf.streak, plural(p.streak, "day"));
  setText(pf.best, plural(p.best, "day"));
  setText(pf.sessions, String(p.sessions));

  const max = Math.max(1800, ...p.week);
  pf.week.replaceChildren(
    ...p.week.map((secs, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      const col = mkEl("div", "wk" + (i === 6 ? " today" : ""));
      col.title = `${d.toLocaleDateString(undefined, { weekday: "long" })}: ${fmtDur(secs)}`;
      const bar = mkEl("i", secs ? "" : "empty");
      bar.style.height = Math.max(4, Math.round((secs / max) * 50)) + "px";
      col.append(bar, mkEl("span", "", "SMTWTFS"[d.getDay()]));
      return col;
    })
  );
}

// pet customisation is only shown on your own profile; rebuilt only when needed so typing isn't interrupted
function renderPfCustom() {
  pf.custom.replaceChildren();
  const p = pfLast?.profile;
  if (!p || pfKey !== myState.userKey) return;
  const sp = Math.max(0, PET_SPECIES.findIndex((s) => s.id === p.pet.species));
  const row = mkEl("div", "buddy-row");
  row.appendChild(mkEl("label", "", "Name"));
  const input = mkEl("input", "pf-name-input");
  input.maxLength = 16;
  input.value = p.pet.name;
  input.placeholder = "Name your pet";
  const commit = () => {
    const v = input.value.trim();
    if (v && v !== pfLast?.profile.pet.name) setPet({ name: v });
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { commit(); input.blur(); } });
  row.appendChild(input);
  pf.custom.append(
    choiceRow("Pet", PET_SPECIES.map((s) => s.label), sp, (i) => setPet({ species: PET_SPECIES[i].id })),
    swatchRow("Color", PET_COLOR_SWATCHES, p.pet.color, (i) => setPet({ color: i })),
    row
  );
}

async function setPet(change) {
  const r = await post("/api/pet", change);
  if (!r.ok) return toast("Couldn't update your pet.");
  const me = remoteUsers[myState.userKey];
  if (me) me.profile = r.profile;
  if (pfLast && pfLast.userKey === myState.userKey) pfLast = { ...pfLast, profile: r.profile };
  renderPfCustom();
  renderProfile();
}

function pfLoop() {
  if (pf.modal.classList.contains("hidden")) { pfRaf = 0; return; }
  const g = pfCtx;
  const u = remoteUsers[pfKey] || pfLast;
  g.fillStyle = "#223829";
  g.fillRect(0, 0, 200, 170);
  g.fillStyle = "#2a4130";
  g.fillRect(0, 138, 200, 32);
  if (u?.profile) {
    const p = u.profile;
    g.save();
    g.translate(100, 150);
    g.scale(3, 3);
    drawPet(g, p.pet, p.stage, performance.now() / 1000, {
      sleepy: p.mood === "sleepy",
      active: !!u.running && u.phase === "focus",
    });
    g.restore();
  }
  pfRaf = requestAnimationFrame(pfLoop);
}

function openProfile(key) {
  const u = remoteUsers[key];
  if (!u || !u.profile) return toast("Profile is still loading — try again in a moment.");
  pfKey = key;
  pfLast = u;
  renderProfile();
  renderPfCustom();
  pf.modal.classList.remove("hidden");
  if (!pfRaf) pfRaf = requestAnimationFrame(pfLoop);
}
const closeProfile = () => pf.modal.classList.add("hidden");
$("toggle-profile").addEventListener("click", () => openProfile(myState.userKey));
$("pf-close").addEventListener("click", closeProfile);
pf.modal.addEventListener("click", (e) => { if (e.target === pf.modal) closeProfile(); });

// ---------- START ----------
mountIcons();
updateTimerDisplay();
requestAnimationFrame(loop);
initDiscord();