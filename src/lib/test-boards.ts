// Fixed positions for the "game lost" tests (unit tests and tests/ui). Not used by the app itself.

import { cardOf, newGame, type GameState, type Options } from "./solitaire";

const OPTS: Options = { drawCount: 1, scoring: "standard", timed: true, kingOnly: false };

/** Every card not listed goes face down under the columns, so the board holds all 52 and only the tops matter. */
function build(tops: number[], stock: number[], foundations: number[][], options: Options): GameState {
  const used = new Set([...tops, ...stock, ...foundations.flat()]);
  const rest = Array.from({ length: 52 }, (_, c) => c).filter((c) => !used.has(c));
  const hidden: number[][] = tops.map(() => []);
  rest.forEach((c, i) => hidden[i % 7].push(c));
  return {
    ...newGame(1, options),
    stock,
    waste: [],
    wasteFan: 0,
    foundations,
    tableau: tops.map((t, i) => ({ cards: [...hidden[i], t], hidden: hidden[i].length })),
    started: true,
  };
}

/**
 * Lost: no ace in sight, no top card fits on another, and none of the stock cards (8♣, 10♦, Q♥, 3♥) fits anywhere.
 */
export function deadEndBoard(options: Options = OPTS): GameState {
  return build(
    [cardOf("C", 9), cardOf("S", 9), cardOf("D", 4), cardOf("H", 4), cardOf("C", 6), cardOf("S", 6), cardOf("C", 7)],
    [cardOf("C", 8), cardOf("D", 10), cardOf("H", 12), cardOf("H", 3)],
    [[], [], [], []],
    options,
  );
}

/**
 * Looks lost (the hint only says "deal a card") but is not: the 5♥ comes back down from its foundation onto a black 6,
 * the 4♣ goes on it, and the card under the 4♣ turns over.
 */
export function rescueBoard(options: Options = OPTS): GameState {
  return build(
    [cardOf("C", 9), cardOf("S", 9), cardOf("D", 4), cardOf("S", 10), cardOf("C", 6), cardOf("S", 6), cardOf("C", 4)],
    [cardOf("C", 8), cardOf("D", 10), cardOf("H", 12), cardOf("H", 11)],
    [[], [1, 2, 3, 4, 5].map((r) => cardOf("H", r)), [], []],
    options,
  );
}
