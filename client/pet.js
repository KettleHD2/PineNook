// pet.js — your study pet. It starts as an egg and evolves as you study.
//
// drawPet() draws in cell units (PX per cell, same grid as the rest of the forest) with the origin at the
// pet's feet, centre-bottom. Callers translate() to where it should stand and may scale() by an integer.

import { PX, art, cells, ellipseCells, pixelText } from "./pixel.js";

export const STAGE_NAMES = ["Egg", "Hatchling", "Youngster", "Adult", "Legend"];
export const PET_SPECIES = [
  { id: "fox", label: "Fox" },
  { id: "owl", label: "Owl" },
  { id: "sprout", label: "Sprout" },
];

const COLORS = [
  { name: "Amber", b: "#f0a04b", d: "#c0702c", l: "#ffd9a0" },
  { name: "Sky", b: "#6fb7e8", d: "#3f86b8", l: "#c4e6fa" },
  { name: "Lilac", b: "#b48ee0", d: "#8461b5", l: "#e2d0f7" },
  { name: "Rose", b: "#ee7f9a", d: "#bd5470", l: "#ffc2d0" },
  { name: "Mint", b: "#6fd08c", d: "#3fa05f", l: "#c2f3d0" },
];
export const PET_COLOR_SWATCHES = COLORS.map((c) => c.b);
export const PET_COLOR_NAMES = COLORS.map((c) => c.name);

const INK = "#0b120d";
const GOLD = "#ffc15a";
const STEM = "#2e7d3c";

const EGG = [
  "..oooo..",
  ".ohhsso.",
  "ohssssso",
  "osspssso",
  "osssssso",
  "osssspso",
  "osssssso",
  ".osssso.",
  "..oooo..",
];
const EAR = [".o.", "obo", "oio", "obo"];
const TUFT_L = ["o..", "obo", "obb"];
const TUFT_R = ["..o", "obo", "bbo"];
const LEAF_R = ["..oo", "oggo", "ooo."];
const LEAF_L = ["oo..", "oggo", ".ooo"];
const LEAF_PAL = { o: INK, g: "#58b25a" };
const FLOWER = [".y.", "yry", ".y."];
const FLOWER_PAL = { y: "#ff9aa2", r: "#ffd24a" };
const CROWN = ["y.y.y", "yYyYy"];
const CROWN_PAL = { y: "#ffd24a", Y: "#fff0a0" };

// half-width / half-height of the body in cells, per stage
const DIM = { 1: { rx: 3, ry: 3 }, 2: { rx: 4, ry: 3 }, 3: { rx: 5, ry: 4 }, 4: { rx: 5, ry: 4 } };

export function drawPet(ctx, pet, stage, t = 0, { sleepy = false, active = false } = {}) {
  const c = COLORS[pet?.color] || COLORS[0];
  const species = PET_SPECIES.some((s) => s.id === pet?.species) ? pet.species : "fox";
  stage = Math.max(0, Math.min(4, stage | 0));

  if (stage === 0) {
    ellipseCells(ctx, 0, 0, 5, 1, "rgba(0,0,0,0.28)");
    const jig = active && Math.floor(t * 5) % 10 === 0 ? 1 : 0; // the egg wobbles while you study
    art(ctx, EGG, { o: INK, s: c.l, h: "#ffffff", p: c.b }, -4 + jig, -9);
    return;
  }

  const { rx, ry } = DIM[stage];
  const cy = -(ry + 2); // body centre row; the outline's bottom row is -1
  const hop = active && !sleepy && Math.floor(t * 1.6) % 4 === 0 ? 1 : 0;
  const eyeD = rx >= 5 ? 3 : 2;
  const ey = cy - 1;
  const blink = sleepy || t % 4.3 < 0.16;
  const pal = { o: INK, b: c.b, d: c.d, i: c.l };
  const bigEyes = species === "owl" && stage >= 2;
  const topY = cy - ry - 2;

  ellipseCells(ctx, 0, 0, rx + 2, 1, "rgba(0,0,0,0.28)");
  ctx.save();
  ctx.translate(0, -hop * PX);

  // ----- behind the body -----
  if (species === "fox") {
    [-1, 1].forEach((s) => art(ctx, EAR, pal, s * (rx - 1) - 1, cy - ry - 3));
    const wag = Math.floor(t * 2.5) % 2;
    const tx = rx + 2, ty = cy + 1 - wag, th = stage >= 3 ? 4 : 3;
    ellipseCells(ctx, tx, ty, 2, th, INK);
    ellipseCells(ctx, tx, ty, 1, th - 1, c.b);
    cells(ctx, tx, ty - th + 1, 1, 2, c.l);
  } else if (species === "owl") {
    art(ctx, TUFT_L, pal, -rx, cy - ry - 3);
    art(ctx, TUFT_R, pal, rx - 2, cy - ry - 3);
  } else {
    cells(ctx, 0, topY - 1, 1, 3, STEM);
    art(ctx, LEAF_R, LEAF_PAL, 1, topY - 2);
    if (stage >= 2) art(ctx, LEAF_L, LEAF_PAL, -4, topY - 2);
  }

  // ----- body -----
  ellipseCells(ctx, 0, cy, rx + 1, ry + 1, INK);
  ellipseCells(ctx, 0, cy, rx, ry, c.b);
  cells(ctx, -(rx - 2), cy - ry + 1, 2, 1, c.l); // shine
  if (species !== "sprout") ellipseCells(ctx, 0, cy + 1, Math.max(1, rx - 2), Math.max(1, ry - 1), c.l); // belly
  if (species === "owl") {
    [-1, 1].forEach((s) => {
      ellipseCells(ctx, s * (rx + 1), cy + 1, 1, ry, INK);
      ellipseCells(ctx, s * (rx + 1), cy + 1, 0, ry - 1, c.d); // wings
    });
    if (stage >= 2) { cells(ctx, -1, cy + 2, 1, 1, c.b); cells(ctx, 1, cy + 2, 1, 1, c.b); cells(ctx, 0, cy + 3, 1, 1, c.b); }
  }

  // ----- face -----
  [-eyeD, eyeD].forEach((gx) => {
    if (bigEyes) {
      if (blink) { cells(ctx, gx - 1, ey - 1, 3, 3, c.b); cells(ctx, gx - 1, ey, 3, 1, INK); }
      else { cells(ctx, gx - 1, ey - 1, 3, 3, "#ffffff"); cells(ctx, gx, ey, 1, 2, INK); }
    } else if (blink) cells(ctx, gx, ey + 1, 1, 1, INK);
    else cells(ctx, gx, ey, 1, 2, INK);
  });
  if (species === "fox") cells(ctx, 0, ey + 2, 1, 1, INK);
  else if (species === "owl") cells(ctx, 0, ey + 1, 1, bigEyes ? 2 : 1, GOLD);
  else if (!sleepy) { cells(ctx, -1, ey + 2, 1, 1, INK); cells(ctx, 1, ey + 2, 1, 1, INK); cells(ctx, 0, ey + 3, 1, 1, INK); }
  if (!sleepy && species !== "owl") { cells(ctx, -eyeD, ey + 2, 1, 1, "#ff9aa2"); cells(ctx, eyeD, ey + 2, 1, 1, "#ff9aa2"); }

  // ----- finishing touches -----
  if (species === "sprout") {
    if (stage === 3) cells(ctx, 0, topY - 2, 1, 1, "#ffd24a");
    if (stage === 4) { cells(ctx, 0, topY - 3, 1, 2, STEM); art(ctx, FLOWER, FLOWER_PAL, -1, topY - 5); }
  } else if (stage === 4) art(ctx, CROWN, CROWN_PAL, -2, cy - ry - 2);

  if (stage === 4) {
    for (let i = 0; i < 4; i++) {
      const a = t * 1.2 + (i * Math.PI) / 2;
      const sx = Math.round(Math.cos(a) * (rx + 5)), sy = cy + Math.round(Math.sin(a) * (ry + 4));
      const col = i % 2 ? "#fff0a0" : "#ffd24a";
      cells(ctx, sx, sy, 1, 1, col);
      if ((Math.floor(t * 3) + i) % 2) {
        cells(ctx, sx - 1, sy, 1, 1, col); cells(ctx, sx + 1, sy, 1, 1, col);
        cells(ctx, sx, sy - 1, 1, 1, col); cells(ctx, sx, sy + 1, 1, 1, col);
      }
    }
  }

  if (sleepy) {
    for (let i = 0; i < 2; i++) {
      const life = (t * 0.5 + i * 0.5) % 1;
      ctx.globalAlpha = 1 - life;
      pixelText(ctx, "Z", (rx + 1) * PX + i * 6, (cy - ry - 2) * PX - life * 18, "#cfe3d4", { scale: 1 + i });
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}