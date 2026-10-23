// scenery.js — pixel-art forest floor, trees, campfire and desks.

import { PX, BAYER, hash2, cells, art, artGrid, gline, ellipseCells } from "./pixel.js";

// ---------- forest floor (painted once into an offscreen canvas) ----------
const GRASS = ["#2d4f36", "#284832", "#23402c", "#1e3626", "#192d20", "#142419", "#0f1c14"];
const DIRT = ["#4a3c2b", "#43372a", "#3d3226"];

function pineGrid() {
  const H = 20, W = 15;
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  const tiers = [[0, 6, 3], [4, 6, 5], [8, 7, 7]]; // [top row, height, max half-width]
  tiers.forEach(([top, h, hw]) => {
    for (let r = 0; r < h; r++) {
      const half = Math.max(0, Math.round((hw * (r + 0.6)) / h));
      for (let x = -half; x <= half; x++) {
        let ch = x < -half * 0.2 ? "G" : "g";
        if (x === -half || x === half || r === h - 1) ch = "o";
        else if (x < -half * 0.5 && r % 2 === 0) ch = "l";
        g[top + r][7 + x] = ch;
      }
    }
  });
  for (let y = 15; y < 19; y++) { g[y][6] = "T"; g[y][7] = "t"; g[y][8] = "t"; }
  return g;
}

function bushGrid(seed) {
  const W = 12, H = 8;
  const g = Array.from({ length: H }, () => Array(W).fill("."));
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const ex = (x - 5.5) / 6, ey = (y - 3.8) / 4.2;
      const d = ex * ex + ey * ey;
      if (d > 1) continue;
      let ch = d > 0.7 ? "o" : ex + ey < -0.45 ? "l" : ex + ey > 0.35 ? "d" : "m";
      if (ch !== "o" && ch !== "d" && hash2(x + seed, y * 7 + seed) < 0.07) ch = "r"; // berries
      g[y][x] = ch;
    }
  return g;
}

const TREE_PAL = { o: "#0e2014", g: "#1f4a2c", G: "#2e6a3c", l: "#43904f", T: "#6b4a30", t: "#4a3322" };
const BUSH_PAL = { o: "#10281a", d: "#1d4a2c", m: "#2d6a3d", l: "#4a9a56", r: "#d65a5a" };
const PINE = pineGrid();
const BUSHES = [bushGrid(1), bushGrid(5), bushGrid(11)];

export function paintBackground(ctx, W, H, cx, cy) {
  const GWc = Math.ceil(W / PX), GHc = Math.ceil(H / PX);
  const ccx = cx / PX, ccy = cy / PX;
  const maxD = Math.hypot(ccx, ccy);
  const N = GRASS.length;
  const dist = (gx, gy) => Math.hypot(gx + 0.5 - ccx, gy + 0.5 - ccy);

  // 1. dithered vignette
  for (let gy = 0; gy < GHc; gy++) {
    let runStart = 0, runLvl = -1;
    for (let gx = 0; gx <= GWc; gx++) {
      let lvl = -2;
      if (gx < GWc) {
        const t = Math.pow(dist(gx, gy) / maxD, 1.15) * (N - 1) * 1.05;
        lvl = Math.min(N - 1, Math.floor(t + BAYER[gy & 3][gx & 3]));
      }
      if (lvl !== runLvl) {
        if (runLvl >= 0) cells(ctx, runStart, gy, gx - runStart, 1, GRASS[runLvl]);
        runStart = gx;
        runLvl = lvl;
      }
    }
  }

  // 2. worn dirt clearing around the fire
  const dirtR = 19;
  for (let gy = Math.floor(ccy - dirtR - 2); gy <= ccy + dirtR + 2; gy++)
    for (let gx = Math.floor(ccx - dirtR - 2); gx <= ccx + dirtR + 2; gx++) {
      const dd = dist(gx, gy) / dirtR;
      if (dd > 1.15) continue;
      if (dd < 0.8 || BAYER[gy & 3][gx & 3] < (1.15 - dd) / 0.35)
        cells(ctx, gx, gy, 1, 1, DIRT[Math.floor(hash2(gx, gy) * 3)]);
    }
  for (let gy = Math.floor(ccy - 12); gy <= ccy + 12; gy++)
    for (let gx = Math.floor(ccx - 12); gx <= ccx + 12; gx++) {
      const dd = dist(gx, gy) / 11;
      if (dd < 1 && (dd < 0.7 || BAYER[gy & 3][gx & 3] < (1 - dd) / 0.3)) cells(ctx, gx, gy, 1, 1, "#2c2620");
    }

  // 3. dashed pebble ring (where the desks sit)
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const gx = Math.round(ccx + Math.cos(a) * 37), gy = Math.round(ccy + Math.sin(a) * 37);
    ctx.globalAlpha = 0.5;
    cells(ctx, gx, gy, i % 2 ? 2 : 1, 1, "#8a9a6a");
    ctx.globalAlpha = 1;
  }

  // 4. grass tufts, flowers, little rocks
  for (let gy = 1; gy < GHc - 1; gy++)
    for (let gx = 1; gx < GWc - 1; gx++) {
      const d = dist(gx, gy);
      if (d < 22) continue;
      const fade = 1 - (d / maxD) * 0.65;
      const h = hash2(gx, gy);
      if (h < 0.028) {
        ctx.globalAlpha = fade;
        cells(ctx, gx - 1, gy - 1, 1, 1, "#417048");
        cells(ctx, gx + 1, gy - 1, 1, 1, "#417048");
        cells(ctx, gx, gy, 1, 1, "#417048");
        ctx.globalAlpha = 1;
      } else if (hash2(gx + 7, gy + 13) < 0.0035) {
        const col = ["#efe9d2", "#f2a9c2", "#f6d96e", "#a9c8f0"][Math.floor(hash2(gx, gy + 3) * 4)];
        ctx.globalAlpha = fade;
        cells(ctx, gx, gy, 1, 1, col);
        cells(ctx, gx, gy + 1, 1, 1, "#2f6a3b");
        ctx.globalAlpha = 1;
      } else if (hash2(gx + 31, gy + 5) < 0.0012) {
        ctx.globalAlpha = fade;
        cells(ctx, gx, gy, 2, 1, "#7a8074");
        cells(ctx, gx, gy + 1, 2, 1, "#4b5148");
        ctx.globalAlpha = 1;
      }
    }

  // 5. bushes on a ring, trees outside it (painter's order: back to front)
  const items = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + hash2(i, 3) * 0.2;
    const r = 212 + hash2(i, 9) * 26;
    items.push({ kind: "bush", x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, v: i % 3 });
  }
  const step = 54;
  for (let y = -20; y < H + 30; y += step)
    for (let x = -20; x < W + 30; x += step) {
      const jx = x + (hash2(x, y) - 0.5) * 30, jy = y + (hash2(y, x) - 0.5) * 30;
      if (Math.hypot(jx - cx, jy - cy) < 252) continue;
      items.push({ kind: "tree", x: jx, y: jy, v: 0 });
    }
  items.sort((a, b) => a.y - b.y);
  items.forEach((it) => {
    const gx = Math.round(it.x / PX), gy = Math.round(it.y / PX);
    if (it.kind === "tree") {
      ellipseCells(ctx, gx, gy, 6, 2, "rgba(0,0,0,0.28)");
      artGrid(ctx, PINE, TREE_PAL, gx - 7, gy - 18);
    } else {
      ellipseCells(ctx, gx, gy + 1, 5, 1, "rgba(0,0,0,0.25)");
      artGrid(ctx, BUSHES[it.v], BUSH_PAL, gx - 6, gy - 6);
    }
  });
}

// ---------- campfire ----------
const FLAME_PAL = { r: "#d94b2b", o: "#f07832", y: "#ffc15a", w: "#fff0b3" };
const FLAMES = [
  ["....r.....", "....rr....", "...rror...", "...rooor..", "..rroooor.", "..roooyor.", ".rroooyyor", ".roooyyyor", ".rooyyywor", ".rooyywwor", "..rooyyor.", "...rrrrr.."],
  ["...r......", "...rr.....", "..rror....", "..rooor...", "..roooor..", ".rroooyor.", ".roooyyor.", ".rooyyyyor", ".rooyywwor", ".roooywwor", "..rooyyor.", "...rrrrr.."],
  ["......r...", ".....rr...", "....rror..", "...rooor..", "...roooor.", "..rroooyor", ".roooyyyor", ".rooyyyyor", ".rooyywwor", ".rooyywwor", "..rooyyor.", "...rrrrr.."],
];
const FLAME_SEQ = [0, 1, 0, 2];
const STONE_ROWS = [".ll.", "lssd", ".dd."];
const STONE_PAL = { l: "#b9ac8a", s: "#8f836b", d: "#5f5646" };
const GLOW_R = 26;
let glowCanvas = null;

function paintGlow(ctx, ox, oy) {
  ctx.fillStyle = "rgba(255,150,60,0.22)";
  for (let gy = -GLOW_R; gy <= GLOW_R; gy++)
    for (let gx = -GLOW_R; gx <= GLOW_R; gx++) {
      const d = Math.hypot(gx, gy) / GLOW_R;
      if (d >= 1) continue;
      if (BAYER[(gy + GLOW_R) & 3][(gx + GLOW_R) & 3] < Math.pow(1 - d, 1.3) * 0.95)
        ctx.fillRect(ox + (gx + GLOW_R) * PX, oy + (gy + GLOW_R) * PX, PX, PX);
    }
}

export function drawCampfireArt(ctx, cx, cy, t) {
  const fx = Math.round(cx / PX), fy = Math.round(cy / PX);

  // dithered glow, pulsing
  const pulse = 0.8 + Math.sin(t * 7) * 0.1 + Math.sin(t * 3.1) * 0.1;
  ctx.globalAlpha = pulse;
  if (typeof document !== "undefined") {
    if (!glowCanvas) {
      glowCanvas = document.createElement("canvas");
      glowCanvas.width = glowCanvas.height = (GLOW_R * 2 + 1) * PX;
      paintGlow(glowCanvas.getContext("2d"), 0, 0);
    }
    ctx.drawImage(glowCanvas, (fx - GLOW_R) * PX, (fy - GLOW_R) * PX);
  } else paintGlow(ctx, (fx - GLOW_R) * PX, (fy - GLOW_R) * PX);
  ctx.globalAlpha = 1;

  // stones: back half first, front half after the fire so it reads as a ring
  const stones = [];
  for (let i = 0; i < 12; i++) {
    const a = ((i + 0.5) / 12) * Math.PI * 2;
    stones.push({ x: fx + Math.round(Math.cos(a) * 11) - 2, y: fy + Math.round(Math.sin(a) * 8) - 1, front: Math.sin(a) >= 0 });
  }
  stones.filter((s) => !s.front).forEach((s) => art(ctx, STONE_ROWS, STONE_PAL, s.x, s.y));

  // logs
  const log = (x0, y0, x1, y1) => {
    gline(x0, y0, x1, y1, (x, y) => {
      cells(ctx, x, y, 2, 2, "#5c3d26");
      cells(ctx, x, y, 2, 1, "#8a5e3b");
    });
    cells(ctx, x0, y0, 1, 2, "#c9a06a");
    cells(ctx, x1 + 1, y1, 1, 2, "#c9a06a");
  };
  log(fx - 7, fy + 2, fx + 6, fy + 5);
  log(fx - 6, fy + 5, fx + 7, fy + 2);

  // flames
  const frame = FLAME_SEQ[Math.floor(t * 7) % FLAME_SEQ.length];
  art(ctx, FLAMES[frame], FLAME_PAL, fx - 5, fy - 9);

  stones.filter((s) => s.front).forEach((s) => art(ctx, STONE_ROWS, STONE_PAL, s.x, s.y));

  // rising embers
  for (let i = 0; i < 6; i++) {
    const life = (t * 0.45 + i / 6) % 1;
    const ex = fx + Math.round(Math.sin(i * 12.9 + t * 1.3) * 5 * life + (i - 2.5));
    const ey = fy - 6 - Math.round(life * 16);
    ctx.globalAlpha = 1 - life;
    cells(ctx, ex, ey, 1, 1, i % 2 ? "#ffd36b" : "#ff9a3c");
  }
  ctx.globalAlpha = 1;
}

// ---------- desks (drawn around a table-local origin that sits on the pixel grid) ----------
const WOOD = { o: "#2f1d12", hi: "#d1a16b", a: "#a8784a", b: "#9a6c42", seam: "#7a5231", apron: "#69472e", grain: "#855c38" };

export function drawDeskArt(ctx) {
  // 24 x 16 cells, centred on the origin: x -12..11, y -8..7
  const X0 = -12, Y0 = -8, W = 24, H = 16;
  // body without corners (gives the rounded-pixel look)
  cells(ctx, X0 + 1, Y0, W - 2, H, WOOD.o);
  cells(ctx, X0, Y0 + 1, W, H - 2, WOOD.o);
  // top surface
  cells(ctx, X0 + 1, Y0 + 1, W - 2, 1, WOOD.hi);
  for (let r = 0; r < 11; r++) {
    const gy = Y0 + 2 + r;
    const seam = r % 4 === 3;
    cells(ctx, X0 + 1, gy, W - 2, 1, seam ? WOOD.seam : Math.floor(r / 4) % 2 ? WOOD.b : WOOD.a);
  }
  // apron / front edge
  cells(ctx, X0 + 1, Y0 + 13, W - 2, 2, WOOD.apron);
  // grain flecks
  for (let i = 0; i < 14; i++) {
    const gx = X0 + 2 + Math.floor(hash2(i, 77) * (W - 5)), gy = Y0 + 2 + Math.floor(hash2(i, 91) * 10);
    if ((gy - Y0 - 2) % 4 !== 3) cells(ctx, gx, gy, 2, 1, WOOD.grain);
  }
}

export function drawDeskShadow(ctx) {
  ellipseCells(ctx, 1, 3, 15, 9, "rgba(0,0,0,0.28)");
}

function drawStool(ctx, gx, gy) {
  ellipseCells(ctx, gx, gy, 3, 2, "#3b2616");
  ellipseCells(ctx, gx, gy, 2, 1, "#8a6340");
  cells(ctx, gx - 1, gy - 1, 2, 1, "#bd9361");
}

export function drawEmptyTableArt(ctx) {
  drawDeskShadow(ctx);
  [[-8, -9], [8, -9], [-8, 9], [8, 9]].forEach(([x, y]) => drawStool(ctx, x, y));
  drawDeskArt(ctx);
  // paper + pencil left on the desk
  cells(ctx, -6, -4, 7, 6, "#7b7656");
  cells(ctx, -5, -5, 7, 6, "#d9d2a3");
  cells(ctx, -4, -3, 4, 1, "#9a946e");
  cells(ctx, -4, -1, 4, 1, "#9a946e");
  gline(3, 4, 8, -1, (x, y) => cells(ctx, x, y, 1, 1, "#e6c75a"));
  cells(ctx, 9, -2, 1, 1, "#2a1f2d");
}