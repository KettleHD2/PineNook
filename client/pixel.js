// pixel.js — shared helpers for drawing crisp pixel art on the forest canvas.
//
// The whole scene lives on a PX-sized grid ("cells"). Helpers take cell coordinates unless
// they say otherwise, and only ever use fillRect, so nothing is anti-aliased.

export const PX = 3;
export const snap = (v) => Math.round(v / PX) * PX;

// 4x4 ordered-dither thresholds in (0,1) — gives that classic pixel-art gradient look
export const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
].map((r) => r.map((v) => (v + 0.5) / 16));

// deterministic pseudo-random in [0,1) for a cell
export function hash2(x, y) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function cells(ctx, gx, gy, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(gx * PX, gy * PX, w * PX, h * PX);
}

// Draw string-art: rows of chars mapped through a palette ("." = transparent)
export function art(ctx, rows, pal, gx, gy) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      if (ch === "." || !pal[ch]) { x++; continue; }
      let x2 = x + 1;
      while (x2 < row.length && row[x2] === ch) x2++;
      ctx.fillStyle = pal[ch];
      ctx.fillRect((gx + x) * PX, (gy + y) * PX, (x2 - x) * PX, PX);
      x = x2;
    }
  }
}

// Same, from a 2D array of chars
export function artGrid(ctx, grid, pal, gx, gy) {
  art(ctx, grid.map((r) => r.join("")), pal, gx, gy);
}

export function gline(x0, y0, x1, y1, fn) {
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
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

// Filled pixel ellipse centred on cell (cx, cy)
export function ellipseCells(ctx, cx, cy, rx, ry, color) {
  ctx.fillStyle = color;
  for (let dy = -ry; dy <= ry; dy++) {
    const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / ((ry + 0.5) * (ry + 0.5)))));
    ctx.fillRect((cx - half) * PX, (cy + dy) * PX, (half * 2 + 1) * PX, PX);
  }
}

// Pixel disc of radius r cells centred on the corner between cells (-1,-1),(0,0),... i.e. on the origin
export function discCells(ctx, r, color) {
  ctx.fillStyle = color;
  for (let gy = -Math.ceil(r); gy < Math.ceil(r); gy++) {
    let x0 = null, x1 = null;
    for (let gx = -Math.ceil(r); gx < Math.ceil(r); gx++) {
      if ((gx + 0.5) ** 2 + (gy + 0.5) ** 2 <= r * r) { if (x0 === null) x0 = gx; x1 = gx; }
    }
    if (x0 !== null) ctx.fillRect(x0 * PX, gy * PX, (x1 - x0 + 1) * PX, PX);
  }
}

const ringCache = new Map();
// Cells in the ring between radii r0 < d <= r1, each with its clockwise-from-top angle (0..2π)
export function ringCells(r0, r1) {
  const key = r0 + "|" + r1;
  if (ringCache.has(key)) return ringCache.get(key);
  const list = [];
  const n = Math.ceil(r1) + 1;
  for (let gy = -n; gy < n; gy++)
    for (let gx = -n; gx < n; gx++) {
      const d2 = (gx + 0.5) ** 2 + (gy + 0.5) ** 2;
      if (d2 > r0 * r0 && d2 <= r1 * r1) {
        let ang = Math.atan2(gx + 0.5, -(gy + 0.5));
        if (ang < 0) ang += Math.PI * 2;
        list.push({ gx, gy, ang });
      }
    }
  ringCache.set(key, list);
  return list;
}

// ---------- 3x5 bitmap font ----------
const G = {
  A: [".X.", "X.X", "XXX", "X.X", "X.X"], B: ["XX.", "X.X", "XX.", "X.X", "XX."],
  C: [".XX", "X..", "X..", "X..", ".XX"], D: ["XX.", "X.X", "X.X", "X.X", "XX."],
  E: ["XXX", "X..", "XX.", "X..", "XXX"], F: ["XXX", "X..", "XX.", "X..", "X.."],
  G: [".XX", "X..", "X.X", "X.X", ".XX"], H: ["X.X", "X.X", "XXX", "X.X", "X.X"],
  I: ["XXX", ".X.", ".X.", ".X.", "XXX"], J: ["..X", "..X", "..X", "X.X", ".X."],
  K: ["X.X", "X.X", "XX.", "X.X", "X.X"], L: ["X..", "X..", "X..", "X..", "XXX"],
  M: ["X.X", "XXX", "XXX", "X.X", "X.X"], N: ["XX.", "X.X", "X.X", "X.X", "X.X"],
  O: [".X.", "X.X", "X.X", "X.X", ".X."], P: ["XX.", "X.X", "XX.", "X..", "X.."],
  Q: [".X.", "X.X", "X.X", "XXX", ".XX"], R: ["XX.", "X.X", "XX.", "X.X", "X.X"],
  S: [".XX", "X..", ".X.", "..X", "XX."], T: ["XXX", ".X.", ".X.", ".X.", ".X."],
  U: ["X.X", "X.X", "X.X", "X.X", "XXX"], V: ["X.X", "X.X", "X.X", "X.X", ".X."],
  W: ["X.X", "X.X", "XXX", "XXX", "X.X"], X: ["X.X", "X.X", ".X.", "X.X", "X.X"],
  Y: ["X.X", "X.X", ".X.", ".X.", ".X."], Z: ["XXX", "..X", ".X.", "X..", "XXX"],
  0: ["XXX", "X.X", "X.X", "X.X", "XXX"], 1: [".X.", "XX.", ".X.", ".X.", "XXX"],
  2: ["XX.", "..X", ".X.", "X..", "XXX"], 3: ["XX.", "..X", ".X.", "..X", "XX."],
  4: ["X.X", "X.X", "XXX", "..X", "..X"], 5: ["XXX", "X..", "XX.", "..X", "XX."],
  6: [".XX", "X..", "XXX", "X.X", "XXX"], 7: ["XXX", "..X", ".X.", ".X.", ".X."],
  8: ["XXX", "X.X", "XXX", "X.X", "XXX"], 9: ["XXX", "X.X", "XXX", "..X", "XX."],
  " ": ["...", "...", "...", "...", "..."], ".": ["...", "...", "...", "...", ".X."],
  ",": ["...", "...", "...", ".X.", "X.."], ":": ["...", ".X.", "...", ".X.", "..."],
  "!": [".X.", ".X.", ".X.", "...", ".X."], "?": ["XX.", "..X", ".X.", "...", ".X."],
  "-": ["...", "...", "XXX", "...", "..."], _: ["...", "...", "...", "...", "XXX"],
  "+": ["...", ".X.", "XXX", ".X.", "..."], "/": ["..X", "..X", ".X.", "X..", "X.."],
  "'": [".X.", ".X.", "...", "...", "..."], "(": [".X.", "X..", "X..", "X..", ".X."],
  ")": [".X.", "..X", "..X", "..X", ".X."], "#": ["X.X", "XXX", "X.X", "XXX", "X.X"],
  "*": ["X.X", ".X.", "XXX", ".X.", "X.X"], "%": ["X.X", "..X", ".X.", "X..", "X.X"],
  "=": ["...", "XXX", "...", "XXX", "..."], ">": ["X..", ".X.", "..X", ".X.", "X.."],
  "<": ["..X", ".X.", "X..", ".X.", "..X"], "|": [".X.", ".X.", ".X.", ".X.", ".X."],
  ";": ["...", ".X.", "...", ".X.", "X.."], "&": [".X.", "X.X", ".XX", "X.X", ".XX"],
  "@": ["XXX", "X.X", "XXX", "X..", "XXX"], "[": ["XX.", "X..", "X..", "X..", "XX."],
  "]": [".XX", "..X", "..X", "..X", ".XX"], '"': ["X.X", "X.X", "...", "...", "..."],
  "~": ["...", ".XX", "XX.", "...", "..."], "$": [".XX", "XX.", ".XX", "XX.", ".X."],
};

// Reduce a string to what the bitmap font can show (accents stripped, upper-cased, max length).
export function cleanText(raw, max = 99) {
  let s = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
  s = [...s].map((c) => (G[c] ? c : "?")).join("");
  if (s.length > max) s = s.slice(0, max - 1) + ".";
  return s;
}

export const textWidth = (s, scale = 2) => (s.length ? s.length * 4 * scale - scale : 0);

// Draw bitmap text with its top-left (or top-centre) at pixel position (x, y).
export function pixelText(ctx, str, x, y, color, { align = "left", scale = 2, shadow = false } = {}) {
  const w = textWidth(str, scale);
  let x0 = align === "center" ? Math.round(x - w / 2) : align === "right" ? x - w : x;
  const pass = (ox, oy, col) => {
    ctx.fillStyle = col;
    for (let i = 0; i < str.length; i++) {
      const glyph = G[str[i]] || G["?"];
      for (let r = 0; r < 5; r++) {
        const row = glyph[r];
        let c = 0;
        while (c < 3) {
          if (row[c] !== "X") { c++; continue; }
          let c2 = c + 1;
          while (c2 < 3 && row[c2] === "X") c2++;
          ctx.fillRect(x0 + ox + (i * 4 + c) * scale, y + oy + r * scale, (c2 - c) * scale, scale);
          c = c2;
        }
      }
    }
  };
  if (shadow) pass(scale, scale, "#0b120d");
  pass(0, 0, color);
}

// Fallback for text the bitmap font can't show (emoji, non-Latin names): rasterise tiny, hard-threshold
// the alpha so there is no anti-aliasing, and scale it up with nearest-neighbour.
const rasterCache = new Map();
export function rasterText(raw, color = "#ffffff", size = 9) {
  if (typeof document === "undefined") return null;
  const key = `${raw}|${color}|${size}`;
  if (rasterCache.has(key)) return rasterCache.get(key);
  const c = document.createElement("canvas");
  const g = c.getContext("2d", { willReadFrequently: true });
  g.font = `bold ${size}px sans-serif`;
  const w = Math.max(1, Math.ceil(g.measureText(raw).width) + 2);
  const h = size + 4;
  c.width = w;
  c.height = h;
  g.font = `bold ${size}px sans-serif`;
  g.textBaseline = "top";
  g.fillStyle = color;
  g.fillText(raw, 1, 1);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 110 ? 255 : 0;
  g.putImageData(img, 0, 0);
  if (rasterCache.size > 200) rasterCache.clear();
  rasterCache.set(key, c);
  return c;
}

export function drawRasterText(ctx, raw, x, y, color, { align = "center", scale = 2, size = 9 } = {}) {
  const c = rasterText(raw, color, size);
  if (!c) return;
  const w = c.width * scale;
  const x0 = align === "center" ? Math.round(x - w / 2) : x;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(c, x0, y, w, c.height * scale);
}

// Names: bitmap font if possible, otherwise the raster fallback (e.g. Japanese names)
export function drawName(ctx, raw, x, y, color, opts = {}) {
  const s = cleanText(raw, opts.max ?? 12);
  const hasLatin = /[A-Z0-9]/.test(s);
  if (hasLatin || !String(raw ?? "").trim()) pixelText(ctx, s, x, y, color, { align: "center", shadow: true, ...opts });
  else {
    const t = [...String(raw)].slice(0, opts.max ?? 12).join("");
    drawRasterText(ctx, t, x + 2, y + 2, "#0b120d", { align: "center", scale: 2 });
    drawRasterText(ctx, t, x, y, color, { align: "center", scale: 2 });
  }
}

// ---------- tiny icons ----------
export const ICONS = {
  tomato: { rows: [".ggg.", "rrgrr", "rrrrr", "rrrrr", ".rrr."], pal: { r: "#e5484d", g: "#58b25a" } },
  mug: { rows: ["wccw..", "wwwwww", "wwwww.", "wwwwww", ".www.."], pal: { w: "#f1ebe0", c: "#8a5a3c" } },
};

// A notched pixel "pill" centred horizontally on x=0 with optional icon and text.
export function drawPill(ctx, cy, text, bg, icon, { scale = 2, fg = "#ffffff" } = {}) {
  const iconW = icon ? icon.rows[0].length * scale + 4 : 0;
  const tw = textWidth(text, scale);
  const w = Math.ceil((tw + iconW + 12) / PX) * PX;
  const h = 6 * PX;
  const x0 = -Math.round(w / 2 / PX) * PX;
  const y0 = Math.round((cy - h / 2) / PX) * PX;

  const notched = (ox, oy, ww, hh, col) => {
    ctx.fillStyle = col;
    ctx.fillRect(x0 + ox + PX, y0 + oy, ww - 2 * PX, hh);
    ctx.fillRect(x0 + ox, y0 + oy + PX, ww, hh - 2 * PX);
  };
  notched(-PX, -PX, w + 2 * PX, h + 2 * PX, "#0b120d"); // outline
  notched(0, 0, w, h, bg);

  let tx = x0 + 6;
  if (icon) {
    const ih = icon.rows.length * scale;
    const iy = y0 + Math.round((h - ih) / 2);
    for (let r = 0; r < icon.rows.length; r++)
      for (let c = 0; c < icon.rows[r].length; c++) {
        const col = icon.pal[icon.rows[r][c]];
        if (!col) continue;
        ctx.fillStyle = col;
        ctx.fillRect(tx + c * scale, iy + r * scale, scale, scale);
      }
    tx += iconW;
  }
  pixelText(ctx, text, tx, y0 + Math.round((h - 5 * scale) / 2), fg, { scale });
}