// Board geometry: where every pile and every card sits, for a board of the given size (CSS pixels).
// Top row: stock, waste (fanned for draw 3), an empty slot, 4 foundations. Below: 7 tableau columns.
import type { Zoom } from "./cards";
import type { GameState, Pile } from "./solitaire";

export const CARD_RATIO = 1.4;

export interface Layout {
  width: number;
  height: number;
  cardW: number;
  cardH: number;
  gap: number;
  colX: number[];
  topY: number;
  tabY: number;
  /** Vertical step between face-down / face-up tableau cards before squeezing. */
  downStep: number;
  upStep: number;
  /** Horizontal step between the fanned waste cards (draw 3). */
  fanStep: number;
}

// Per "Zoom in" level: how much of a covered face-up tableau card shows (its corner index has to fit) and how far the
// draw-3 waste cards fan out (so the bigger rank is not hidden under the next card).
const UP_STEP: Record<Zoom, number> = { 0: 0.27, 1: 0.27, 2: 0.36 };
const FAN_STEP: Record<Zoom, number> = { 0: 0.3, 1: 0.45, 2: 0.55 };

export function computeLayout(width: number, height: number, zoom: Zoom = 0): Layout {
  const pad = Math.max(4, Math.min(16, width * 0.015));
  // Width-bound: 7 cards and 6 gaps of 12% of a card.
  let cardW = (width - 2 * pad) / (7 + 6 * 0.12);
  // Height-bound: the top row plus about 3 card heights of tableau must fit (landscape phones).
  cardW = Math.min(cardW, (height - 2 * pad) / (CARD_RATIO * 3.6));
  cardW = Math.max(20, Math.min(cardW, 120));
  const cardH = cardW * CARD_RATIO;
  const gap = cardW * 0.12;
  const boardW = 7 * cardW + 6 * gap;
  const left = Math.max(pad, (width - boardW) / 2);
  const colX = Array.from({ length: 7 }, (_, i) => left + i * (cardW + gap));
  const topY = pad;
  const tabY = topY + cardH + Math.max(gap * 1.5, 8);
  return {
    width,
    height,
    cardW,
    cardH,
    gap,
    colX,
    topY,
    tabY,
    downStep: cardH * 0.11,
    upStep: cardH * UP_STEP[zoom],
    fanStep: cardW * FAN_STEP[zoom],
  };
}

export interface CardPos {
  x: number;
  y: number;
  z: number;
  faceUp: boolean;
  pile: Pile;
  index: number;
}

/** Steps for one column, squeezed so the column ends above the bottom edge. */
export function columnSteps(l: Layout, hidden: number, total: number): { down: number; up: number } {
  const ups = Math.max(0, total - hidden - 1);
  const room = Math.max(0, l.height - l.tabY - l.cardH - 4);
  if (hidden * l.downStep + ups * l.upStep <= room) return { down: l.downStep, up: l.upStep };
  if (ups === 0) return { down: Math.min(l.downStep, room / hidden), up: l.upStep };
  // Squeeze the face-up cards first; when they would get thinner than a fifth of a card, squeeze the face-down ones too.
  let down = l.downStep;
  let up = (room - hidden * down) / ups;
  if (up < l.cardH * 0.2) {
    down = Math.min(l.downStep, l.cardH * 0.04);
    up = (room - hidden * down) / ups;
  }
  return { down, up: Math.max(0, Math.min(l.upStep, up)) };
}

export function pilePosition(l: Layout, pile: Pile): { x: number; y: number } {
  switch (pile.kind) {
    case "stock":
      return { x: l.colX[0], y: l.topY };
    case "waste":
      return { x: l.colX[1], y: l.topY };
    case "foundation":
      return { x: l.colX[3 + pile.index], y: l.topY };
    case "tableau":
      return { x: l.colX[pile.index], y: l.tabY };
  }
}

/** Position of every card, keyed by card number. */
export function cardPositions(s: GameState, l: Layout): Map<number, CardPos> {
  const out = new Map<number, CardPos>();
  s.stock.forEach((c, i) => {
    out.set(c, { x: l.colX[0], y: l.topY, z: 10 + i, faceUp: false, pile: { kind: "stock" }, index: i });
  });
  const fan = s.options.drawCount === 3 ? Math.min(s.wasteFan, s.waste.length, 3) : Math.min(1, s.waste.length);
  s.waste.forEach((c, i) => {
    const fromTop = s.waste.length - 1 - i;
    const slot = fromTop < fan ? fan - 1 - fromTop : 0;
    out.set(c, { x: l.colX[1] + slot * l.fanStep, y: l.topY, z: 100 + i, faceUp: true, pile: { kind: "waste" }, index: i });
  });
  s.foundations.forEach((f, fi) => {
    f.forEach((c, i) => {
      out.set(c, { x: l.colX[3 + fi], y: l.topY, z: 200 + i, faceUp: true, pile: { kind: "foundation", index: fi }, index: i });
    });
  });
  s.tableau.forEach((col, ci) => {
    const { down, up } = columnSteps(l, col.hidden, col.cards.length);
    let y = l.tabY;
    col.cards.forEach((c, i) => {
      out.set(c, { x: l.colX[ci], y, z: 300 + i, faceUp: i >= col.hidden, pile: { kind: "tableau", index: ci }, index: i });
      y += i < col.hidden ? down : up;
    });
  });
  return out;
}

/**
 * Pile a dragged card was dropped on, from the centre of the dragged card: the nearest column, top row or tableau
 * by height. Only foundations (columns 3-6) and tableau columns can receive cards.
 */
export function dropTarget(l: Layout, x: number, y: number): Pile | null {
  const cx = x + l.cardW / 2;
  const cy = y + l.cardH / 2;
  let col = 0;
  let best = Infinity;
  l.colX.forEach((cx0, i) => {
    const d = Math.abs(cx0 + l.cardW / 2 - cx);
    if (d < best) {
      best = d;
      col = i;
    }
  });
  if (best > l.cardW) return null;
  if (cy < l.tabY - l.gap / 2) return col >= 3 ? { kind: "foundation", index: col - 3 } : null;
  return { kind: "tableau", index: col };
}
