import { describe, expect, it } from "vitest";
import { cardPositions, computeLayout, dropTarget } from "./layout";
import { ZOOMS } from "./cards";
import { cardOf, newGame, type GameState } from "./solitaire";

/** A column as long as it can get: 6 face-down cards and a full king-to-ace run. */
function longColumn(): GameState {
  const g = newGame(1);
  const run = Array.from({ length: 13 }, (_, i) => cardOf(i % 2 === 0 ? "S" : "H", 13 - i));
  const used = new Set(run);
  const others = Array.from({ length: 52 }, (_, c) => c).filter((c) => !used.has(c));
  return {
    ...g,
    tableau: [{ cards: [...others.slice(0, 6), ...run], hidden: 6 }, ...g.tableau.slice(1).map(() => ({ cards: [], hidden: 0 }))],
    stock: others.slice(6),
    waste: [],
  };
}

const SIZES: [number, number, string][] = [
  [360, 600, "phone portrait"],
  [412, 760, "large phone portrait"],
  [740, 250, "phone landscape"],
  [1280, 700, "desktop"],
];

describe("layout", () => {
  for (const [w, h, name] of SIZES) for (const zoom of ZOOMS) {
    it(`fits 7 columns and the longest column on a ${name} (${w}x${h}), zoom ${zoom}`, () => {
      const l = computeLayout(w, h, zoom);
      expect(l.colX[0]).toBeGreaterThanOrEqual(0);
      expect(l.colX[6] + l.cardW).toBeLessThanOrEqual(w + 0.01);
      expect(l.tabY).toBeGreaterThan(l.topY + l.cardH);
      const pos = cardPositions(longColumn(), l);
      expect(pos.size).toBe(52);
      for (const p of pos.values()) expect(p.y + l.cardH).toBeLessThanOrEqual(h + 0.01);
    });
  }

  it("uses big cards on a phone in portrait", () => {
    const l = computeLayout(360, 600);
    expect(l.cardW).toBeGreaterThan(44);
    expect(l.cardH / l.cardW).toBeCloseTo(1.4);
  });

  it("places the dealt cards: stock face down, last card of every column face up", () => {
    const g = newGame(3);
    const l = computeLayout(400, 700);
    const pos = cardPositions(g, l);
    for (const c of g.stock) expect(pos.get(c)).toMatchObject({ faceUp: false, x: l.colX[0], y: l.topY });
    g.tableau.forEach((col, i) => {
      const last = pos.get(col.cards[col.cards.length - 1])!;
      expect(last.faceUp).toBe(true);
      expect(last.x).toBe(l.colX[i]);
      expect(last.z).toBeGreaterThanOrEqual(pos.get(col.cards[0])!.z);
    });
  });

  it("Zoom in 2x shows more of every covered card; the zoomed draw-3 fan stays clear of the foundations", () => {
    const l0 = computeLayout(360, 640);
    const l2 = computeLayout(360, 640, 2);
    expect(l2.cardW).toBe(l0.cardW);
    expect(l2.upStep).toBeGreaterThan(l0.upStep);
    for (const z of ZOOMS) {
      const l = computeLayout(360, 640, z);
      expect(l.colX[1] + 2 * l.fanStep + l.cardW).toBeLessThanOrEqual(l.colX[3]);
    }
  });

  it("fans up to 3 waste cards with draw 3", () => {
    const g = newGame(3, { drawCount: 3, scoring: "standard", timed: true });
    const n = { ...g, waste: g.stock.slice(0, 5), stock: g.stock.slice(5), wasteFan: 3 };
    const l = computeLayout(400, 700);
    const pos = cardPositions(n, l);
    const xs = n.waste.map((c) => pos.get(c)!.x);
    expect(xs).toEqual([l.colX[1], l.colX[1], l.colX[1], l.colX[1] + l.fanStep, l.colX[1] + 2 * l.fanStep]);
  });

  it("drops on the column under the card: foundations up top, tableau below", () => {
    const l = computeLayout(400, 700);
    expect(dropTarget(l, l.colX[4], l.topY)).toEqual({ kind: "foundation", index: 1 });
    expect(dropTarget(l, l.colX[1], l.topY)).toBeNull();
    expect(dropTarget(l, l.colX[2] + 3, l.tabY + 100)).toEqual({ kind: "tableau", index: 2 });
    expect(dropTarget(l, -500, l.tabY)).toBeNull();
  });
});
