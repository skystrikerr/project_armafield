import * as THREE from "three";

/**
 * Pixel-art emote icons drawn straight onto a canvas so the sim ships with no
 * image assets. Each icon is a 9x9 grid of colour keys.
 */

const ART: Record<string, { rows: string[]; colors: Record<string, string> }> = {
  heart: {
    rows: [
      ".........",
      ".XX...XX.",
      "XxxX.XxxX",
      "XxxxXxxxX",
      "XxxxxxxxX",
      ".XxxxxxX.",
      "..XxxxX..",
      "...XxX...",
      "....X....",
    ],
    colors: { X: "#c62b4a", x: "#ff5d78" },
  },
  apple: {
    rows: [
      "....G....",
      "...GG....",
      "..XXXXX..",
      ".XxxXxxX.",
      ".XxxxxxX.",
      ".XxxxxxX.",
      ".XxxxxxX.",
      "..XxxxX..",
      "...XXX...",
    ],
    colors: { X: "#a8231f", x: "#e8433c", G: "#3f7a2f" },
  },
  droplet: {
    rows: [
      "....X....",
      "....X....",
      "...XxX...",
      "..XxxxX..",
      "..XxxxX..",
      ".XxxxwxX.",
      ".XxxxwxX.",
      "..XxxxX..",
      "...XXX...",
    ],
    colors: { X: "#2f7fae", x: "#5fc4ea", w: "#dff4ff" },
  },
  wood: {
    rows: [
      ".........",
      "XXXXXXXX.",
      "XwwXwwwX.",
      "XwXwwXwX.",
      "XXXXXXXX.",
      ".XXXXXXXX",
      ".XwwXwwwX",
      ".XwXwwXwX",
      ".XXXXXXXX",
    ],
    colors: { X: "#6b4726", w: "#a9763f" },
  },
  spark: {
    rows: [
      "....X....",
      "..X.X.X..",
      "...XXX...",
      ".XXXwXXX.",
      "XXXwwwXXX",
      ".XXXwXXX.",
      "...XXX...",
      "..X.X.X..",
      "....X....",
    ],
    colors: { X: "#f2b705", w: "#fff6c9" },
  },
  clash: {
    rows: [
      "X.......X",
      ".X.....X.",
      "..X...X..",
      "...XwX...",
      "..XwWwX..",
      "...XwX...",
      "..X...X..",
      ".X.....X.",
      "X.......X",
    ],
    colors: { X: "#c9342b", w: "#ff8a5c", W: "#fff3d0" },
  },
  faith: {
    rows: [
      "....X....",
      "...XwX...",
      "..XwwwX..",
      ".XXXwXXX.",
      "....w....",
      "....w....",
      "...XwX...",
      "..XwwwX..",
      "...XXX...",
    ],
    colors: { X: "#8f6bd8", w: "#e6d6ff" },
  },
  zzz: {
    rows: [
      "XXXX.....",
      "...X.....",
      "..X..XXX.",
      ".X...X...",
      "XXXX..X..",
      ".....X...",
      ".....XXX.",
      ".........",
      ".........",
    ],
    colors: { X: "#dff1ff" },
  },
};

function toTexture(name: string): THREE.Texture {
  const spec = ART[name];
  const px = 8;
  const canvas = document.createElement("canvas");
  canvas.width = 9 * px;
  canvas.height = 9 * px;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  spec.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = spec.colors[row[x]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x * px, y * px, px, px);
    }
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let cache: Record<string, THREE.Texture> | null = null;

export function emoteTextures() {
  if (!cache) {
    cache = {};
    for (const k of Object.keys(ART)) cache[k] = toTexture(k);
  }
  return cache;
}
