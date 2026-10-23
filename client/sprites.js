// sprites.js — procedural pixel-art study buddies for the forest canvas.
//
// Everything is drawn with fillRect on a 3px "sprite pixel" grid, so there are no image
// assets to load. A sprite's look (skin, hair colour, hairstyle, hoodie colour) is derived
// from the user's id, and its animation is derived from the synced timer state, so every
// client in the activity sees exactly the same thing without any extra network traffic.
//
// Usage (from main.js, with the canvas already translated to the table centre):
//   const pose = getPose(user, secondsLeft, nowSeconds, fireOffset);
//   drawSpriteBody(ctx, pose);   // head + shoulders (behind the desk)
//   ...draw the desk top...
//   drawSpriteFront(ctx, pose);  // arms, book, mug, stick, marshmallow (in front of the desk)

export const SPRITE_CONFIG = {
  roastEverySec: 15 * 60, // marshmallow break after every 15 minutes of focus
  roastLenSec: 36, // whole roast scene length
  roastCookSec: 28, // part of it spent cooking; the rest is eating
};

const S = 3; // screen px per sprite pixel
const GW = 16; // grid width
const GH = 14; // rows we paint for the body (the desk hides anything lower)
const OX = -24; // grid (0,0) in table-local coordinates
const OY = -66;

// ---------- characters & customisation ----------
// A character is described by a short string "type.color.outfit.accessory.skin.hair"
// (e.g. "cat.2.4.1.0.0"). It is stored locally, synced through the server, and parsed here.
// Anyone who hasn't picked one gets a deterministic look derived from their user id.

export const CHAR_TYPES = [
  { id: "human", label: "Student" },
  { id: "cat", label: "Cat" },
  { id: "frog", label: "Frog" },
];
export const COLOR_LABEL = { human: "Hair", cat: "Fur", frog: "Skin" };
export const ACC_CHOICES = ["None", "Headphones", "Glasses", "Bow"];
export const HAIR_CHOICES = ["Short", "Long", "Bun"];

const SKIN = ["#f8d9bd", "#efc29a", "#d49a6a", "#a8714b", "#7a4a2e"];
const HAIR = [
  ["#2b2118", "#4a3a2c"], ["#5b3a22", "#7e5636"], ["#c98f45", "#e2ae66"],
  ["#b9402f", "#d9644f"], ["#3a3f73", "#5a62a8"], ["#d9709a", "#f09bbc"],
];
const CAT = [
  ["#e0944a", "#f6d0a0"], ["#8f98a8", "#d4d9e2"], ["#3a3a48", "#6e6e84"],
  ["#f1e6d0", "#ffffff"], ["#8a5a3c", "#caa07c"], ["#b4a0e0", "#e4daf8"],
];
const FROG = ["#6fbf5a", "#4aa89a", "#6a9be0", "#e07a9a", "#e3c64a", "#9a7ad6"];
const SHIRT = [
  ["#7fae7a", "#5c8a5a"], ["#e8a07a", "#c97c58"], ["#9a8bd4", "#7767b3"],
  ["#e3c15f", "#c09a3a"], ["#6fb3c9", "#4b90a8"], ["#d98aa6", "#b7647f"],
];

export const COLOR_CHOICES = { human: HAIR.map((h) => h[0]), cat: CAT.map((c) => c[0]), frog: FROG };
export const OUTFIT_CHOICES = SHIRT.map((s) => s[0]);
export const SKIN_CHOICES = SKIN;

const TYPE_IDS = CHAR_TYPES.map((t) => t.id);
const LIMITS = [TYPE_IDS.length, 6, 6, ACC_CHOICES.length, SKIN.length, HAIR_CHOICES.length];

export function parseChar(str) {
  if (typeof str !== "string") return null;
  const p = str.split(".");
  if (p.length !== 6 || !TYPE_IDS.includes(p[0])) return null;
  const n = p.slice(1).map(Number);
  for (let i = 0; i < 5; i++) if (!Number.isInteger(n[i]) || n[i] < 0 || n[i] >= LIMITS[i + 1]) return null;
  return { type: p[0], color: n[0], outfit: n[1], acc: n[2], skin: n[3], hair: n[4] };
}

export const encodeChar = (c) => `${c.type}.${c.color}.${c.outfit}.${c.acc}.${c.skin}.${c.hair}`;

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// what someone looks like before they choose: a varied student, derived from their id
export function defaultChar(userKey) {
  const h = hashStr(String(userKey));
  return {
    type: "human",
    color: (h >>> 4) % 6,
    outfit: (h >>> 8) % 6,
    acc: [0, 0, 1, 2, 3, 0][(h >>> 12) % 6],
    skin: h % 5,
    hair: (h >>> 16) % 3,
  };
}

const mix = (a, b, f) => {
  const p = (x) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, "0")).join("");
};

const lookCache = new Map();
export function lookFor(charStr, userKey) {
  const cacheKey = charStr || "~" + userKey;
  let L = lookCache.get(cacheKey);
  if (L) return L;

  const c = parseChar(charStr) || defaultChar(userKey);
  const pal = {
    o: "#2a1f2d", e: "#2a1f2d", b: "#ef9a9a", m: "#a4483b",
    c: SHIRT[c.outfit][0], d: SHIRT[c.outfit][1], w: "#f4f1de",
    k: "#3d3b5c", q: "#ff8fa3", Q: "#ff5c80",
  };
  if (c.type === "human") {
    Object.assign(pal, { h: HAIR[c.color][0], H: HAIR[c.color][1], s: SKIN[c.skin] });
  } else if (c.type === "cat") {
    Object.assign(pal, { s: CAT[c.color][0], H: CAT[c.color][1], i: "#f0a0b0", n: "#e8788f", x: "#ece6d6" });
  } else {
    const main = FROG[c.color];
    Object.assign(pal, { s: main, H: mix(main, "#ffffff", 0.6), W: "#f4f1de", n: mix(main, "#000000", 0.35) });
  }
  L = { id: cacheKey, type: c.type, acc: c.acc, hair: c.hair, seed: (hashStr(String(userKey)) % 1000) / 100, pal };
  lookCache.set(cacheKey, L);
  return L;
}

// ---------- grid building ----------
const gridCache = new Map();

function newGrid() {
  return Array.from({ length: GH }, () => Array(GW).fill("."));
}

function builder(g) {
  const put = (x, y, ch) => {
    if (x >= 0 && x < GW && y >= 0 && y < GH) g[y][x] = ch;
  };
  const row = (y, str) => {
    const x0 = (GW - str.length) / 2;
    for (let i = 0; i < str.length; i++) if (str[i] !== ".") put(x0 + i, y, str[i]);
  };
  return { put, row };
}

const skinRow = "o" + "s".repeat(10) + "o";

// shared mouth shapes (cat + human + frog use the same cells, frog just wider)
function drawMouth(put, face, wide) {
  if (wide) {
    for (let x = 5; x <= 10; x++) put(x, 9, "m");
    if (face.mouth === "smile") { put(4, 8, "m"); put(11, 8, "m"); }
    if (face.mouth === "open") for (let x = 6; x <= 9; x++) put(x, 10, "m");
    return;
  }
  switch (face.mouth) {
    case "smile": put(6, 9, "m"); put(7, 10, "m"); put(8, 10, "m"); put(9, 9, "m"); break;
    case "open": put(7, 9, "m"); put(8, 9, "m"); put(7, 10, "m"); put(8, 10, "m"); break;
    default: put(7, 9, "m"); put(8, 9, "m");
  }
}

function drawEyes(put, face) {
  const lx = 5 + face.look, rx = 10 + face.look;
  switch (face.eyes) {
    case "closed": put(lx, 8, "e"); put(rx, 8, "e"); break;
    case "down": put(lx, 8, "e"); put(lx, 9, "e"); put(rx, 8, "e"); put(rx, 9, "e"); break;
    case "happy": [lx, rx].forEach((x) => { put(x - 1, 8, "e"); put(x, 7, "e"); put(x + 1, 8, "e"); }); break;
    default: put(lx, 7, "e"); put(lx, 8, "e"); put(rx, 7, "e"); put(rx, 8, "e");
  }
}

function headHuman(look, face, { put, row }) {
  if (look.hair === 1) for (let y = 5; y <= 11; y++) { put(0, y, "o"); put(1, y, "h"); put(14, y, "h"); put(15, y, "o"); }
  if (look.hair === 2) { row(0, "oooo"); row(1, "ohhhho"); }
  row(2, "oooooooo");
  row(3, "ohhhhhhhho");
  row(4, "ohhHHhhhhhho");
  row(5, "ohhhhhhhhhho");
  row(6, "ohssssssssho");
  row(7, skinRow); row(8, skinRow); row(9, skinRow);
  row(10, "o" + "s".repeat(8) + "o");
  put(4, 9, "b"); put(11, 9, "b");
  drawEyes(put, face);
  drawMouth(put, face, false);
}

function headCat(look, face, { put, row }) {
  row(2, "oooooooo");
  row(3, "o" + "s".repeat(10) + "o");
  for (let y = 4; y <= 9; y++) row(y, skinRow);
  row(10, "o" + "s".repeat(8) + "o");
  // pointy ears
  put(3, 0, "o"); put(12, 0, "o");
  put(3, 1, "o"); put(4, 1, "i"); put(5, 1, "o");
  put(12, 1, "o"); put(11, 1, "i"); put(10, 1, "o");
  put(3, 2, "o"); put(4, 2, "i"); put(5, 2, "i"); put(6, 2, "o");
  put(12, 2, "o"); put(11, 2, "i"); put(10, 2, "i"); put(9, 2, "o");
  // forehead stripes
  put(7, 4, "o"); put(8, 4, "o"); put(7, 3, "H"); put(8, 3, "H");
  // light muzzle + nose
  for (let x = 6; x <= 9; x++) put(x, 9, "H");
  for (let x = 6; x <= 9; x++) put(x, 10, "H");
  put(7, 8, "n"); put(8, 8, "n");
  put(4, 9, "b"); put(11, 9, "b");
  drawEyes(put, face);
  drawMouth(put, face, false);
  // whiskers
  [[1, 8], [0, 7], [1, 9], [0, 10], [14, 8], [15, 7], [14, 9], [15, 10]].forEach(([x, y]) => put(x, y, "x"));
}

function headFrog(look, face, { put, row }) {
  row(2, "oooooooo");
  for (let y = 3; y <= 9; y++) row(y, skinRow);
  row(10, "o" + "s".repeat(8) + "o");
  row(3, "o" + "s".repeat(10) + "o");
  for (let x = 5; x <= 10; x++) put(x, 10, "H");
  put(7, 6, "n"); put(8, 6, "n");
  put(4, 9, "b"); put(11, 9, "b");
  // bulging eyes on top
  [[3, 4, 5, 6], [9, 10, 11, 12]].forEach(([x0, xa, xb, x1], i) => {
    put(xa, 0, "o"); put(xb, 0, "o");
    put(x0, 1, "o"); put(x1, 1, "o"); put(x0, 2, "o"); put(x1, 2, "o");
    [xa, xb].forEach((x) => { put(x, 1, "W"); put(x, 2, "W"); });
    const px = Math.max(xa, Math.min(xb, (i === 0 ? xa : xa) + (face.look > 0 ? 1 : 0)));
    if (face.eyes === "closed") { put(xa, 1, "s"); put(xb, 1, "s"); put(xa, 2, "e"); put(xb, 2, "e"); }
    else if (face.eyes === "happy") { put(xa, 1, "e"); put(xb, 1, "e"); put(xa, 2, "s"); put(xb, 2, "s"); }
    else if (face.eyes === "down") put(px, 2, "e");
    else { put(px, 1, "e"); put(px, 2, "e"); }
  });
  drawMouth(put, face, true);
}

function addAccessory(look, { put }) {
  const t = look.type;
  if (look.acc === 1) {
    // headphones
    if (t === "human") {
      for (let x = 5; x <= 10; x++) put(x, 1, "k");
      put(3, 2, "k"); put(4, 2, "k"); put(11, 2, "k"); put(12, 2, "k");
      put(2, 3, "k"); put(13, 3, "k"); put(1, 4, "k"); put(14, 4, "k"); put(1, 5, "k"); put(14, 5, "k");
    } else {
      for (let x = 3; x <= 12; x++) put(x, 3, "k");
      put(2, 4, "k"); put(2, 5, "k"); put(13, 4, "k"); put(13, 5, "k");
    }
    for (let y = 6; y <= 9; y++) { put(0, y, "k"); put(1, y, "q"); put(14, y, "q"); put(15, y, "k"); }
  } else if (look.acc === 2) {
    // glasses
    if (t === "frog") {
      [[3, 4, 5, 6], [9, 10, 11, 12]].forEach(([x0, xa, xb, x1]) => {
        put(xa, 0, "k"); put(xb, 0, "k");
        put(x0, 1, "k"); put(x1, 1, "k"); put(x0, 2, "k"); put(x1, 2, "k");
      });
      put(7, 1, "k"); put(8, 1, "k");
    } else {
      [5, 10].forEach((ex) => {
        for (let x = ex - 1; x <= ex + 1; x++) put(x, 6, "k");
        put(ex - 1, 7, "k"); put(ex - 1, 8, "k"); put(ex + 1, 7, "k"); put(ex + 1, 8, "k");
      });
      put(7, 7, "k"); put(8, 7, "k");
    }
  } else if (look.acc === 3) {
    // bow
    ["qq.qq", "qqQqq", "qq.qq"].forEach((r, y) => [...r].forEach((ch, x) => ch !== "." && put(9 + x, 3 + y, ch)));
  }
}

function buildHead(look, face) {
  const key = `h|${look.id}|${face.eyes}|${face.mouth}|${face.look}`;
  if (gridCache.has(key)) return gridCache.get(key);
  const g = newGrid();
  const b = builder(g);
  if (look.type === "cat") headCat(look, face, b);
  else if (look.type === "frog") headFrog(look, face, b);
  else headHuman(look, face, b);
  addAccessory(look, b);
  gridCache.set(key, g);
  return g;
}

function buildTorso() {
  if (gridCache.has("torso")) return gridCache.get("torso");
  const g = newGrid();
  const { row } = builder(g);
  row(11, "o" + "ccccwccwcccc" + "o");
  row(12, "o" + "d" + "c".repeat(12) + "d" + "o");
  row(13, "o" + "d" + "c".repeat(12) + "d" + "o");
  gridCache.set("torso", g);
  return g;
}

function paintGrid(ctx, g, pal, dy = 0) {
  for (let y = 0; y < g.length; y++) {
    let x = 0;
    while (x < GW) {
      const ch = g[y][x];
      if (ch === "." || !pal[ch]) { x++; continue; }
      let x2 = x + 1;
      while (x2 < GW && g[y][x2] === ch) x2++;
      ctx.fillStyle = pal[ch];
      ctx.fillRect(OX + x * S, OY + (y + dy) * S, (x2 - x) * S, S);
      x = x2;
    }
  }
}

const gbox = (ctx, gx, gy, w, h, color) => {
  ctx.fillStyle = color;
  ctx.fillRect(OX + gx * S, OY + gy * S, w * S, h * S);
};

function gline(x0, y0, x1, y1, fn) {
  let dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    fn(x0, y0);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

function drawArm(ctx, pal, sx, sy, hx, hy) {
  const pts = [];
  gline(sx, sy, hx, hy, (x, y) => pts.push([x, y]));
  pts.forEach(([x, y]) => gbox(ctx, x - 1, y - 1, 4, 4, pal.o));
  pts.forEach(([x, y]) => gbox(ctx, x, y, 2, 2, pal.c));
  gbox(ctx, hx - 1, hy - 1, 4, 4, pal.o);
  gbox(ctx, hx, hy, 2, 2, pal.s);
}

// ---------- activity / pose ----------
function activityOf(u, left) {
  if (!u.running) return { kind: "idle" };
  if (u.phase === "break") return { kind: "break" };

  const { roastEverySec: EVERY, roastLenSec: LEN, roastCookSec: COOK } = SPRITE_CONFIG;
  const elapsed = Math.max(0, (u.total || 0) - left);
  const k = Math.floor(elapsed / EVERY);
  if (k >= 1) {
    const into = elapsed - k * EVERY;
    // only roast if the focus session won't end in the middle of it
    if (into < LEN && left - (LEN - into) >= 10) {
      return into < COOK ? { kind: "roast", p: into / COOK } : { kind: "eat", p: (into - COOK) / (LEN - COOK) };
    }
  }
  return { kind: "study" };
}

export function getPose(u, left, t, fire) {
  const look = lookFor(u.char, u.userKey);
  const tt = t + look.seed;
  const act = activityOf(u, left);
  const pose = {
    look, tt, fire, kind: act.kind, p: act.p ?? 0,
    face: { eyes: "open", mouth: "neutral", look: 0 },
    headDy: 0,
    lArm: [4, 17],
    rArm: [10, 17],
    pencil: false,
    mug: "desk", // "desk" | "mouth"
    bubble: false,
    sparkles: false,
    steam: false,
    stick: null,
    snack: null,
  };

  switch (act.kind) {
    case "idle": {
      pose.headDy = Math.floor(tt / 1.25) % 2;
      pose.face.look = [0, -1, 0, 1][Math.floor(tt / 3) % 4];
      if (tt % 4 < 0.15) pose.face.eyes = "closed";
      break;
    }
    case "study": {
      pose.steam = true;
      const c = tt % 15;
      if (c < 6) {
        // writing notes
        pose.face.eyes = "down";
        pose.headDy = 1;
        pose.rArm = [8 + (Math.floor(tt * 3) % 3), 17 + (Math.floor(tt * 6) % 2)];
        pose.pencil = true;
      } else if (c < 8.5) {
        // thinking
        pose.rArm = [10, 12];
        pose.pencil = true;
        pose.bubble = true;
        pose.face.look = 1;
      } else if (c < 13) {
        // reading
        pose.headDy = 1;
        pose.face.look = (Math.floor(tt * 1.5) % 3) - 1;
      } else {
        // sip of coffee
        pose.face.eyes = "closed";
        pose.mug = "mouth";
        pose.rArm = [10, 13];
      }
      break;
    }
    case "break": {
      pose.steam = true;
      pose.face.mouth = "smile";
      const c = tt % 13;
      if (c < 5 || c >= 8) {
        if (c < 5) {
          pose.face.eyes = "closed";
          pose.mug = "mouth";
          pose.rArm = [10, 13];
        } else {
          pose.face.look = (Math.floor(tt) % 3) - 1;
          pose.rArm = [14, 17];
        }
      } else {
        // stretch + yawn
        pose.face.eyes = "closed";
        pose.face.mouth = "open";
        pose.lArm = [0, 3];
        pose.rArm = [14, 3];
      }
      break;
    }
    case "roast": {
      const right = fire.x >= 0;
      pose.face.look = right ? 1 : -1;
      pose.face.mouth = "smile";
      if (right) { pose.rArm = [15, 14]; pose.lArm = [4, 17]; }
      else { pose.lArm = [0, 14]; pose.rArm = [10, 17]; }
      pose.stick = { from: right ? pose.rArm : pose.lArm, p: act.p };
      break;
    }
    case "eat": {
      pose.face.eyes = "happy";
      pose.face.mouth = Math.floor(tt * 4) % 2 ? "open" : "smile";
      pose.rArm = [10, 12];
      pose.snack = Math.max(0, 1 - act.p * 1.15); // marshmallow shrinks as it's eaten
      pose.sparkles = true;
      break;
    }
  }
  if (look.acc === 2 && look.type !== "frog") pose.face.look = 0; // glasses stay put
  return pose;
}

// ---------- drawing ----------
export function drawSpriteBody(ctx, pose) {
  const pal = pose.look.pal;
  paintGrid(ctx, buildTorso(), pal, 0);
  paintGrid(ctx, buildHead(pose.look, pose.face), pal, pose.headDy);
}

function drawBook(ctx) {
  gbox(ctx, 3, 15, 10, 5, "#6b4a7a");
  gbox(ctx, 4, 15, 8, 4, "#efe8c8");
  gbox(ctx, 7, 15, 2, 4, "#d4c79d");
  [[5, 16], [5, 18], [9, 16], [9, 18]].forEach(([x, y]) => gbox(ctx, x, y, 2, 1, "#b9ae88"));
}

function drawMug(ctx, gx, gy) {
  gbox(ctx, gx, gy, 3, 3, "#f1ebe0");
  gbox(ctx, gx, gy, 3, 1, "#6a4331");
  gbox(ctx, gx + 3, gy + 1, 1, 1, "#f1ebe0");
}

const mixHex = (a, b, f) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v + (B[i] - v) * f).toString(16).padStart(2, "0")).join("");
};
const TOAST = [[0, "#fffaf0"], [0.45, "#f6e2b5"], [0.75, "#e0a443"], [0.93, "#a35a2a"], [1, "#6b3a1f"]];
function toastColor(p) {
  for (let i = 1; i < TOAST.length; i++) {
    if (p <= TOAST[i][0]) {
      const [p0, c0] = TOAST[i - 1], [p1, c1] = TOAST[i];
      return mixHex(c0, c1, (p - p0) / (p1 - p0));
    }
  }
  return TOAST[TOAST.length - 1][1];
}

function drawStickAndMarshmallow(ctx, pose) {
  const { fire, tt } = pose;
  const dist = Math.hypot(fire.x, fire.y) || 1;
  const reach = Math.max(20, dist - 44); // stop just short of the flames
  const ex = Math.round((fire.x / dist * reach - OX) / S);
  const ey = Math.round((fire.y / dist * reach - OY) / S) + (Math.floor(tt * 3) % 2); // tiny wobble
  const [hx, hy] = pose.stick.from;
  gline(hx + 1, hy + 1, ex, ey, (x, y) => gbox(ctx, x, y, 1, 1, "#7a5230"));

  const p = pose.stick.p;
  gbox(ctx, ex - 1, ey - 1, 3, 3, toastColor(p));
  gbox(ctx, ex - 1, ey - 1, 1, 1, mixHex(toastColor(p), "#ffffff", 0.35));
  if (p > 0.9 && Math.floor(tt * 8) % 2) {
    gbox(ctx, ex - 1, ey - 4, 1, 2, "#ff9a3c");
    gbox(ctx, ex, ey - 3, 1, 1, "#ffd36b");
  }
}

export function drawSpriteFront(ctx, pose) {
  const pal = pose.look.pal;
  const { tt } = pose;

  drawBook(ctx);
  if (pose.mug === "desk") drawMug(ctx, 13, 16);

  drawArm(ctx, pal, 2, 12, pose.lArm[0], pose.lArm[1]);
  drawArm(ctx, pal, 13, 12, pose.rArm[0], pose.rArm[1]);

  if (pose.pencil) {
    const [hx, hy] = pose.rArm;
    gbox(ctx, hx + 2, hy - 3, 1, 1, "#ef8a8a");
    gbox(ctx, hx + 2, hy - 2, 1, 3, "#f2c94c");
    gbox(ctx, hx + 2, hy + 1, 1, 1, "#2a1f2d");
  }

  if (pose.mug === "mouth") drawMug(ctx, 8, 10);
  if (pose.stick) drawStickAndMarshmallow(ctx, pose);

  if (pose.snack) {
    const n = pose.snack > 0.66 ? 3 : pose.snack > 0.33 ? 2 : pose.snack > 0.05 ? 1 : 0;
    if (n) {
      gbox(ctx, 11, 11 - n + 1, n, n, "#e0a443");
      gbox(ctx, 11, 11 - n + 1, 1, 1, "#f6e2b5");
    }
  }

  if (pose.steam) {
    const f = Math.floor(tt * 2) % 2;
    const a = "rgba(255,255,255,0.55)";
    if (pose.mug === "desk") {
      gbox(ctx, 14 + f, 14, 1, 1, a);
      gbox(ctx, 14 + (1 - f), 13, 1, 1, a);
    } else {
      gbox(ctx, 9 + f, 8, 1, 1, a);
    }
  }

  if (pose.bubble) {
    const n = 1 + (Math.floor(tt * 2) % 3);
    for (let i = 0; i < n; i++) gbox(ctx, 11 + i * 2, 0, 1, 1, "#f4f1de");
  }

  if (pose.sparkles) {
    const on = Math.floor(tt * 3) % 2;
    [[0, 3], [15, 2], [13, 0]].forEach(([x, y], i) => {
      if ((i + on) % 2) return;
      gbox(ctx, x, y, 1, 1, "#ffe066");
      gbox(ctx, x - 1, y, 1, 1, "#ffe066");
      gbox(ctx, x + 1, y, 1, 1, "#ffe066");
      gbox(ctx, x, y - 1, 1, 1, "#ffe066");
      gbox(ctx, x, y + 1, 1, 1, "#ffe066");
    });
  }
}