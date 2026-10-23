// icons.js — pixel-art button icons. Each icon is a 10x10 grid of palette letters ("." = empty);
// a dark outline and a 1-cell margin are added automatically, giving a 12x12 sprite.

const ART = {
  play: { pal: { g: "#a3d977", l: "#d4f0a8" }, rows: [
    "..........", ".lg.......", ".lggg.....", ".lggggg...", ".lgggggg..",
    ".lgggggg..", ".lggggg...", ".lggg.....", ".lg.......", ".........." ] },
  pause: { pal: { g: "#a3d977", l: "#d4f0a8" }, rows: [
    "..........", ".lg....lg.", ".lg....lg.", ".lg....lg.", ".lg....lg.",
    ".lg....lg.", ".lg....lg.", ".lg....lg.", ".lg....lg.", ".........." ] },
  reset: { pal: { c: "#88c0d0", C: "#e0f4fa" }, rows: [
    "..........", "...cccc...", "..cc..cc..", ".cc..CCCCC", ".c....CCC.",
    ".c.....C..", ".cc....cc.", "..cc..cc..", "...cccc...", ".........." ] },
  people: { pal: { s: "#efc29a", b: "#7fae7a" }, rows: [
    "..........", "...ssss...", "..ssssss..", "..ssssss..", "...ssss...",
    "...bbbb...", "..bbbbbb..", ".bbbbbbbb.", ".bbbbbbbb.", ".bbbbbbbb." ] },
  cards: { pal: { w: "#f4f1de", d: "#8d6b94", k: "#3d3b5c" }, rows: [
    "..........", "...dddddd.", "...dddddd.", ".wwwwwwdd.", ".wwkkkwdd.",
    ".wwwwkwdd.", ".wwwkwwdd.", ".wwwwwwdd.", ".wwwkwww..", ".wwwwww..." ] },
  board: { pal: { f: "#9aa39c", w: "#f4f1de", r: "#e5484d", b: "#2980b9", m: "#8a5e3b" }, rows: [
    "..........", ".ffffffff.", ".fwwwwwwf.", ".fwrrwwwf.", ".fwwrrwbf.",
    ".fwwwrbbf.", ".fwwwwwwf.", ".ffffffff.", "..mmmmmm..", ".........." ] },
  heart: { pal: { r: "#e5484d", p: "#ff9aa2" }, rows: [
    "..........", ".rrr..rrr.", "rpprrrrrrr", "rrrrrrrrrr", "rrrrrrrrrr",
    ".rrrrrrrr.", "..rrrrrr..", "...rrrr...", "....rr....", ".........." ] },
  flame: { pal: { r: "#d94b2b", o: "#f07832", y: "#ffc15a" }, rows: [
    "....y.....", "...yo.....", "...oo.o...", "..ooo.oo..", "..oooooo..",
    ".roooyooo.", ".rooyyyoo.", ".rooyyyor.", "..rooyor..", "...rrrr..." ] },
  mug: { pal: { c: "#f1ebe0", n: "#6a4331" }, rows: [
    "..........", "..........", ".cnnnnc...", ".cccccc.cc", ".cccccc.c.",
    ".cccccc.cc", ".cccccc...", "..cccc....", "..........", ".........." ] },
  dumbbell: { pal: { g: "#8f98a8", l: "#c4cad6", b: "#e8eef2" }, rows: [
    "..........", "..........", ".lg....lg.", ".ggg..ggg.", ".gggbbggg.",
    ".gggbbggg.", ".ggg..ggg.", ".gg....gg.", "..........", ".........." ] },
  star: { pal: { y: "#ffd24a", Y: "#fff0a0" }, rows: [
    "....yy....", "....yy....", "...yyyy...", "Yyyyyyyyyy", ".yyyyyyyy.",
    "..yyyyyy..", "..yyyyyy..", ".yyyy.yyy.", ".yyy..yyy.", ".yy....yy." ] },
  sword: { pal: { w: "#e8eef2", s: "#8f98a8", y: "#e3c15f", b: "#7a5230" }, rows: [
    "....ww....", "....ws....", "....ws....", "....ws....", "....ws....",
    "....ws....", "..yyyyyy..", "....bb....", "....bb....", "....yy...." ] },
  paw: { pal: { p: "#f2b36d", l: "#ffd9a6" }, rows: [
    "..........", "..pp..pp..", "..lp..lp..", "pp......pp", "pl..pp..pp",
    "...pppp...", "..plpppp..", "..pppppp..", "...pppp...", ".........." ] },
  speaker: { pal: { g: "#c4cad6", y: "#a3d977" }, rows: [
    "..........", "..........", "....g...y.", "...gg....y", ".ggggg.y.y",
    ".ggggg.y.y", ".ggggg.y.y", "...gg....y", "....g...y.", ".........." ] },
  rain: { pal: { c: "#aab4c4", b: "#6fb7e8" }, rows: [
    "..........", "..cccc....", ".cccccc.c.", "cccccccccc", ".cccccccc.",
    "..........", "..b..b..b.", ".b..b..b..", "..b..b..b.", ".........." ] },
  tree: { pal: { g: "#43904f", t: "#6b4a30" }, rows: [
    "....gg....", "...gggg...", "..gggggg..", "...gggg...", "..gggggg..",
    ".gggggggg.", "gggggggggg", "....tt....", "....tt....", ".........." ] },
  bird: { pal: { b: "#6fb7e8", e: "#0b120d", y: "#ffc15a" }, rows: [
    "..........", "....bbb...", "...bbbbb..", "...bbebbyy", "..bbbbbbb.",
    ".bbbbbbbb.", "bbbbbbbbb.", "bb.bbbbb..", ".....y.y..", ".........." ] },
  moon: { pal: { p: "#f6e2b5", y: "#ffd24a" }, rows: [
    "..........", "..........", "...ppppp..", "..ppp....y", ".ppp......",
    ".ppp...y..", ".ppp......", "..ppp.....", "...ppppp..", ".........." ] },
  drop: { pal: { b: "#6fb7e8", w: "#e0f4fa" }, rows: [
    "....b.....", "...bbb....", "..bbbbb...", "..bbbbb...", ".bbbbbbb..",
    ".bwbbbbb..", ".bwbbbbb..", ".bbbbbbb..", "..bbbbb...", "...bbb...." ] },
  wave: { pal: { b: "#6fb7e8" }, rows: [
    "..........", "..........", "..bb..bb..", ".b..bb..b.", "b........b",
    "..........", "..bb..bb..", ".b..bb..b.", "b........b", ".........." ] },
  tomato: { pal: { r: "#e5484d", p: "#ff9aa2", g: "#58b25a" }, rows: [
    "....gg....", "..gggggg..", ".rrrgrrrr.", "rpprrrrrrr", "rrrrrrrrrr",
    "rrrrrrrrrr", "rrrrrrrrrr", ".rrrrrrrr.", "..rrrrrr..", ".........." ] },
};
export const ICON_ART = ART;

// Reactions travel through the server as emoji ids; each id is shown as a sprite on every client.
export const REACTION_ICON = { "👏": "heart", "🔥": "flame", "☕": "mug", "💪": "dumbbell", "🎉": "star" };

const cache = new Map();
export function iconCanvas(name) {
  if (cache.has(name)) return cache.get(name);
  const def = ART[name] || ART.star;
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  const g = c.getContext("2d");
  const solid = (x, y) => x >= 0 && y >= 0 && x < 10 && y < 10 && !!def.pal[def.rows[y][x]];
  g.fillStyle = "#0b120d";
  for (let y = -1; y <= 10; y++)
    for (let x = -1; x <= 10; x++)
      if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)))
        g.fillRect(x + 1, y + 1, 1, 1);
  for (let y = 0; y < 10; y++)
    for (let x = 0; x < 10; x++) {
      const col = def.pal[def.rows[y][x]];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  cache.set(name, c);
  return c;
}

// canvas drawing (floating reactions on the forest)
export function drawIcon(ctx, name, x, y, scale = 3) {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(iconCanvas(name), x, y, 12 * scale, 12 * scale);
}

// DOM buttons: paints the icon into a <canvas class="ico"> inside the element (other children are kept)
export function setIcon(el, name) {
  if (el.dataset.painted === name) return;
  const src = iconCanvas(name);
  const c = document.createElement("canvas");
  c.width = c.height = 12;
  c.className = "ico";
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;
  g.drawImage(src, 0, 0);
  const old = el.querySelector(":scope > canvas.ico");
  if (old) old.replaceWith(c);
  else el.prepend(c);
  el.dataset.painted = name;
}

export function mountIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => setIcon(el, el.dataset.icon));
}