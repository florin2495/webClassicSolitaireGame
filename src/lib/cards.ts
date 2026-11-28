// Card artwork, drawn here as SVG (original design, no images from any other game).
// Every face is a 100 x 140 SVG. The page shows them as <img> data URLs and the win animation draws the same
// images on a canvas. Suits are SVG shapes, never the ♠♥♦♣ characters: Android may draw those as emoji.
import { isRed, rankOf, suitOf, type Suit } from "./solitaire";

export const RANK_LABEL = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const SUIT_NAME: Record<Suit, string> = { S: "pică", H: "inimă roșie", C: "treflă", D: "romb" };

/**
 * Menu setting "Zoom in" (for older eyes): 0 = off, 1 = bigger corner index (layout unchanged), 2 = index about twice
 * the normal size, no bottom corner, and one big suit with the rank on it instead of the pips (more of every covered
 * card shows, see `computeLayout`).
 */
export type Zoom = 0 | 1 | 2;
export const ZOOMS: readonly Zoom[] = [0, 1, 2];
export const isZoom = (x: unknown): x is Zoom => x === 0 || x === 1 || x === 2;

const RED = "#c8102e";
const BLACK = "#141414";
const FONT = "Arial, Helvetica, sans-serif";

/** Suit shapes in a 100 x 100 box. */
const SUIT_SHAPE: Record<Suit, string> = {
  S:
    '<path d="M50 3C42 20 5 38 5 62c0 15 11 25 25 25 8 0 14-4 17-10-1 10-7 17-17 20v0h40v0c-10-3-16-10-17-20 3 6 9 10 17 10 14 0 25-10 25-25C95 38 58 20 50 3z"/>',
  H: '<path d="M50 95C37 80 4 59 4 32 4 16 16 5 30 5c10 0 17 6 20 15 3-9 10-15 20-15 14 0 26 11 26 27 0 27-33 48-46 63z"/>',
  D: '<path d="M50 2 88 50 50 98 12 50z"/>',
  C:
    '<circle cx="50" cy="27" r="21"/><circle cx="26" cy="58" r="21"/><circle cx="74" cy="58" r="21"/>' +
    '<path d="M42 40h16v18H42z"/><path d="M46 55c0 20-6 32-16 41h40c-10-9-16-21-16-41z"/>',
};

function symbols(color: string): string {
  return (["S", "H", "C", "D"] as Suit[])
    .map((s) => `<symbol id="${s}" viewBox="0 0 100 100"><g fill="${color}">${SUIT_SHAPE[s]}</g></symbol>`)
    .join("");
}

const pip = (s: Suit, cx: number, cy: number, size: number, flip = false) =>
  `<use href="#${s}" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}"${
    flip ? ` transform="rotate(180 ${cx} ${cy})"` : ""
  }/>`;

// Pip centres for 2..10 inside the area left free by the corner indices (x 22..78, y 32..108).
const L = 33;
const M = 50;
const R = 67;
const PIPS: Record<number, [number, number][]> = {
  2: [[M, 40], [M, 100]],
  3: [[M, 40], [M, 70], [M, 100]],
  4: [[L, 40], [R, 40], [L, 100], [R, 100]],
  5: [[L, 40], [R, 40], [M, 70], [L, 100], [R, 100]],
  6: [[L, 40], [R, 40], [L, 70], [R, 70], [L, 100], [R, 100]],
  7: [[L, 40], [R, 40], [M, 55], [L, 70], [R, 70], [L, 100], [R, 100]],
  8: [[L, 40], [R, 40], [M, 55], [L, 70], [R, 70], [M, 85], [L, 100], [R, 100]],
  9: [[L, 40], [R, 40], [L, 60], [R, 60], [M, 70], [L, 80], [R, 80], [L, 100], [R, 100]],
  10: [[L, 40], [R, 40], [M, 50], [L, 60], [R, 60], [L, 80], [R, 80], [M, 90], [L, 100], [R, 100]],
};

// Head-wear for the court cards (simple original drawings).
const CROWN: Record<number, string> = {
  11: '<path d="M35 52c2-9 8-14 15-14s13 5 15 14z" fill="#3d6fb6"/><circle cx="50" cy="37" r="3.5" fill="#e3b23c"/><path d="M33 52h34v4H33z" fill="#e3b23c"/>',
  12: '<path d="M35 54l3-13 7 7 5-11 5 11 7-7 3 13z" fill="#e3b23c"/><circle cx="38" cy="40" r="2.5" fill="#fff"/><circle cx="50" cy="35" r="2.5" fill="#fff"/><circle cx="62" cy="40" r="2.5" fill="#fff"/>',
  13: '<path d="M33 55l2-17 8 8 7-12 7 12 8-8 2 17z" fill="#e3b23c"/><path d="M33 55h34v4H33z" fill="#b8860b"/><circle cx="50" cy="44" r="2.5" fill="' + RED + '"/>',
};

// Corner index per zoom level: rank on the left, suit on the right, all inside the strip a covered tableau card
// shows (27% of the height, 36% at zoom 2).
const CORNER: Record<Zoom, { x: number; y: number; size: number; tenSize: number; tenSpacing: number; pip: [number, number, number] }> = {
  0: { x: 5, y: 25, size: 25, tenSize: 25, tenSpacing: -2, pip: [84, 15, 20] },
  1: { x: 4, y: 37, size: 42, tenSize: 40, tenSpacing: -4, pip: [80, 21, 30] },
  2: { x: 3, y: 48, size: 54, tenSize: 52, tenSpacing: -5, pip: [79, 26, 36] },
};

function corner(label: string, s: Suit, zoom: Zoom): string {
  const c = CORNER[zoom];
  const ten = label === "10";
  const spacing = ten ? ` letter-spacing="${c.tenSpacing}"` : "";
  return (
    `<text x="${c.x}" y="${c.y}" font-family="${FONT}" font-weight="700" font-size="${ten ? c.tenSize : c.size}"${spacing} fill="currentColor">${label}</text>` +
    pip(s, ...c.pip)
  );
}

// Zoom 2: one big suit (y 62..134) with the rank on it in white. Fraction of the shape's height where its widest
// part sits, so the rank lands there.
const BIG_TOP = 62;
const BIG_SIZE = 72;
const BIG_CENTRE: Record<Suit, number> = { S: 0.6, H: 0.4, C: 0.5, D: 0.5 };

function bigSuit(s: Suit, label: string): string {
  const ten = label === "10";
  const fs = ten ? 30 : 34;
  // 0.358 = half the cap height of Arial bold, so the text is centred vertically.
  const y = (BIG_TOP + BIG_SIZE * BIG_CENTRE[s] + fs * 0.358).toFixed(1);
  return (
    pip(s, 50, BIG_TOP + BIG_SIZE / 2, BIG_SIZE) +
    `<text x="50" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="${fs}"${
      ten ? ' letter-spacing="-2"' : ""
    } fill="#fff">${label}</text>`
  );
}

export function cardFaceSvg(card: number, zoom: Zoom = 0): string {
  const s = suitOf(card);
  const r = rankOf(card);
  const color = isRed(card) ? RED : BLACK;
  const label = RANK_LABEL[r];
  // Zoom 1: the big corners take the top and bottom 40 units, so the pips move closer to the middle and get smaller.
  const pipY = (y: number) => (zoom === 1 ? 70 + (y - 70) * 0.75 : y);
  let middle = "";
  if (zoom === 2) {
    middle = bigSuit(s, label);
  } else if (r === 1) {
    middle = pip(s, 50, 72, zoom === 1 ? (s === "S" ? 42 : 36) : s === "S" ? 50 : 42);
  } else if (r <= 10) {
    middle = PIPS[r].map(([x, y]) => pip(s, x, pipY(y), zoom === 1 ? 14 : 17, y > 72)).join("");
  } else {
    middle =
      `<rect x="19" y="31" width="62" height="78" rx="5" fill="#fbf2d5" stroke="${color}" stroke-width="1.5"/>` +
      CROWN[r] +
      `<text x="50" y="92" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="36" fill="${color}">${label}</text>` +
      pip(s, 28, 100, 10) +
      pip(s, 72, 100, 10);
    if (zoom === 1) middle = `<g transform="translate(50 70) scale(0.7) translate(-50 -70)">${middle}</g>`;
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 100 140" color="${color}">` +
    `<defs>${symbols(color)}</defs>` +
    `<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="7" fill="#fff" stroke="#8a8a8a" stroke-width="1.5"/>` +
    corner(label, s, zoom) +
    // Zoom 2 has no upside-down corner: the big suit sits there.
    (zoom === 2 ? "" : `<g transform="rotate(180 50 70)">${corner(label, s, zoom)}</g>`) +
    middle +
    `</svg>`
  );
}

export const BACKS = {
  blue: { name: "Albastru", base: "#1f4e9c", light: "#8fb3ee" },
  red: { name: "Roșu", base: "#a3162b", light: "#f0a0aa" },
  green: { name: "Verde", base: "#1c6b3a", light: "#9fdcb2" },
} as const;
export type BackId = keyof typeof BACKS;
export const isBackId = (x: unknown): x is BackId => typeof x === "string" && x in BACKS;

export function cardBackSvg(back: BackId): string {
  const { base, light } = BACKS[back];
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="280" viewBox="0 0 100 140">` +
    `<defs><pattern id="p" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="8" height="8" fill="${base}"/><path d="M0 0H8M0 0V8" stroke="${light}" stroke-width="1.4" opacity="0.7"/></pattern></defs>` +
    `<rect x="0.75" y="0.75" width="98.5" height="138.5" rx="7" fill="#fff" stroke="#8a8a8a" stroke-width="1.5"/>` +
    `<rect x="6" y="6" width="88" height="128" rx="4" fill="url(#p)"/>` +
    `<rect x="6" y="6" width="88" height="128" rx="4" fill="none" stroke="${base}" stroke-width="2"/>` +
    `<rect x="10" y="10" width="80" height="120" rx="3" fill="none" stroke="${light}" stroke-width="1"/>` +
    `<path d="M50 48 66 70 50 92 34 70z" fill="${base}" stroke="${light}" stroke-width="2"/>` +
    `<path d="M50 60 58 70 50 80 42 70z" fill="${light}"/>` +
    `</svg>`
  );
}

export const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

const faceCache = new Map<number, string>();
export function faceUrl(card: number, zoom: Zoom = 0): string {
  const key = zoom * 52 + card;
  let u = faceCache.get(key);
  if (!u) {
    u = svgUrl(cardFaceSvg(card, zoom));
    faceCache.set(key, u);
  }
  return u;
}

const backCache = new Map<BackId, string>();
export function backUrl(back: BackId): string {
  let u = backCache.get(back);
  if (!u) {
    u = svgUrl(cardBackSvg(back));
    backCache.set(back, u);
  }
  return u;
}

/** Text for screen readers, e.g. "10 inimă roșie". */
export function cardLabel(card: number): string {
  return `${RANK_LABEL[rankOf(card)]} ${SUIT_NAME[suitOf(card)]}`;
}
