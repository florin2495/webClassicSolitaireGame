// "Is this game lost?" - a proof, not a guess.
//
// The hint only looks at the obvious moves, so "the hint only says: deal a card" does not prove a game lost: a card
// taken back down from a foundation, or part of a run moved to another column, can still open the game. Here every
// state reachable from the current one is explored (deals and recycles of the stock, every legal move, foundation to
// tableau included). Winning needs more cards on the foundations, so if no reachable state ever has more foundation
// cards than now, or fewer face-down cards, the game cannot be won any more.

import { draw, maxRecycles, move, type GameState, type Pile } from "./solitaire";

const FOUNDATIONS = [0, 1, 2, 3].map((index) => ({ kind: "foundation" as const, index }));
const COLUMNS = [0, 1, 2, 3, 4, 5, 6].map((index) => ({ kind: "tableau" as const, index }));
const WASTE: Pile = { kind: "waste" };

const hiddenCount = (s: GameState) => s.tableau.reduce((n, c) => n + c.hidden, 0);
const foundationCount = (s: GameState) => s.foundations.reduce((n, f) => n + f.length, 0);

/** Every state one action away (a deal from the stock, or any legal move). */
export function successors(s: GameState): GameState[] {
  const out: GameState[] = [];
  const dealt = draw(s);
  if (dealt) out.push(dealt);
  const add = (from: Pile, index: number | undefined, to: Pile) => {
    const n = move(s, from, index, to);
    if (n) out.push(n);
  };
  for (const to of [...FOUNDATIONS, ...COLUMNS]) add(WASTE, undefined, to);
  // Foundation to foundation (an ace changing places) changes nothing: skipped.
  for (const from of FOUNDATIONS) for (const to of COLUMNS) add(from, undefined, to);
  for (const from of COLUMNS) {
    const col = s.tableau[from.index];
    for (let i = col.hidden; i < col.cards.length; i++) {
      if (i === col.cards.length - 1) for (const to of FOUNDATIONS) add(from, i, to);
      for (const to of COLUMNS) {
        // A whole column moved to another empty column is the same position: skipped.
        if (i === 0 && s.tableau[to.index].cards.length === 0) continue;
        add(from, i, to);
      }
    }
  }
  return out;
}

export type Outlook = "open" | "lost" | "unknown";

/**
 * "lost": proven, no reachable state gets a card further. "open": some sequence does (not a promise of a win).
 * "unknown": more than `limit` positions to look at (then nothing is shown to the player).
 */
export function outlook(s: GameState, limit = 4000): Outlook {
  if (s.won) return "open";
  const hidden0 = hiddenCount(s);
  const found0 = foundationCount(s);
  // With unlimited recycles the recycle count only changes the score: leave it out, or the deals never repeat.
  const unlimited = maxRecycles(s.options) === Infinity;
  const key = (g: GameState) =>
    `${g.stock.join(",")}/${g.waste.join(",")}/${g.foundations.map((f) => f.join(",")).join("|")}/` +
    `${g.tableau.map((c) => `${c.hidden}:${c.cards.join(",")}`).join("|")}/${unlimited ? "" : g.recycles}`;
  const seen = new Set<string>([key(s)]);
  const todo: GameState[] = [s];
  while (todo.length > 0) {
    const g = todo.pop()!;
    for (const n of successors(g)) {
      if (n.won || hiddenCount(n) < hidden0 || foundationCount(n) > found0) return "open";
      const k = key(n);
      if (seen.has(k)) continue;
      if (seen.size >= limit) return "unknown";
      seen.add(k);
      todo.push(n);
    }
  }
  return "lost";
}
