// Klondike solitaire rules. Pure functions: every move returns a new state (or null when illegal), nothing is mutated.
//
// Cards are numbers 0..51: suit = floor(c / 13) in SUITS order, rank = c % 13 + 1 (1 = ace, 13 = king).
// Piles keep their top card LAST. Scoring follows the classic desktop game:
//   standard: waste->tableau +5, waste->foundation +10, tableau->foundation +10, card turned over +5,
//             foundation->tableau -15, recycling the waste -100 (draw 1) or -20 from the 3rd recycle on (draw 3),
//             timed games lose 2 points every 10 s and get 700000 / seconds as a bonus on a win of 30 s or more.
//             The score never drops below 0.
//   vegas:    starts at -52, +5 for every card put on a foundation (-5 when one comes back), one pass through
//             the stock with draw 1, three passes with draw 3.
//   none:     no score.

export const SUITS = ["S", "H", "C", "D"] as const;
export type Suit = (typeof SUITS)[number];
export type DrawCount = 1 | 3;
export type Scoring = "standard" | "vegas" | "none";

export interface Options {
  drawCount: DrawCount;
  scoring: Scoring;
  timed: boolean;
  /** Only a king may go on an empty column (the classic rule). Missing or false: any card may. */
  kingOnly?: boolean;
}

export interface Column {
  cards: number[];
  /** The first `hidden` cards are face down. */
  hidden: number;
}

export interface GameState {
  v: 1;
  seed: number;
  options: Options;
  stock: number[];
  waste: number[];
  /** How many waste cards are fanned out on top (draw 3 shows up to 3). */
  wasteFan: number;
  /** Four piles; any ace may start any pile. */
  foundations: number[][];
  tableau: Column[];
  score: number;
  /** Time bonus added on a timed standard win. */
  bonus: number;
  recycles: number;
  moves: number;
  elapsedMs: number;
  /** First move made: the clock runs and the game counts in the statistics. */
  started: boolean;
  won: boolean;
  /** The win has been celebrated: set the moment the game is won (src/lib/store.ts), so a reload during the win
   *  animation goes straight to the result instead of replaying it. */
  celebrated: boolean;
  /** The player closed the "no more moves" dialog ("Mă mai uit"): not shown again for this game, also after a reload.
   *  Missing in games saved before 0.1.7 = not closed. */
  lostDismissed?: boolean;
}

export type Pile =
  | { kind: "stock" }
  | { kind: "waste" }
  | { kind: "foundation"; index: number }
  | { kind: "tableau"; index: number };

export const DEFAULT_OPTIONS: Options = { drawCount: 1, scoring: "standard", timed: true, kingOnly: false };

export const suitIndex = (c: number) => Math.floor(c / 13);
export const suitOf = (c: number): Suit => SUITS[suitIndex(c)];
export const rankOf = (c: number) => (c % 13) + 1;
export const isRed = (c: number) => suitIndex(c) % 2 === 1;
export const cardOf = (suit: Suit, rank: number) => SUITS.indexOf(suit) * 13 + rank - 1;
const top = <T>(a: T[]): T | undefined => a[a.length - 1];

/** Small, fast, deterministic PRNG: the same seed always deals the same game. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledDeck(seed: number): number[] {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 2_000_000_000) + 1;
}

export function newGame(seed: number, options: Options = DEFAULT_OPTIONS): GameState {
  const deck = shuffledDeck(seed);
  const tableau: Column[] = Array.from({ length: 7 }, (_, i) => ({ cards: [], hidden: i }));
  let k = 0;
  for (let row = 0; row < 7; row++) for (let col = row; col < 7; col++) tableau[col].cards.push(deck[k++]);
  return {
    v: 1,
    seed,
    options: { ...options },
    stock: deck.slice(k),
    waste: [],
    wasteFan: 0,
    foundations: [[], [], [], []],
    tableau,
    score: options.scoring === "vegas" ? -52 : 0,
    bonus: 0,
    recycles: 0,
    moves: 0,
    elapsedMs: 0,
    started: false,
    won: false,
    celebrated: false,
  };
}

function clone(s: GameState): GameState {
  return {
    ...s,
    options: { ...s.options },
    stock: [...s.stock],
    waste: [...s.waste],
    foundations: s.foundations.map((f) => [...f]),
    tableau: s.tableau.map((c) => ({ cards: [...c.cards], hidden: c.hidden })),
  };
}

function finish(n: GameState): GameState {
  n.moves++;
  n.started = true;
  if (n.options.scoring === "standard") n.score = Math.max(0, n.score);
  return n;
}

/** Recycles allowed (stock empty -> waste turned back into the stock). */
export function maxRecycles(o: Options): number {
  if (o.scoring !== "vegas") return Infinity;
  return o.drawCount === 1 ? 0 : 2;
}

export function canRecycle(s: GameState): boolean {
  return !s.won && s.stock.length === 0 && s.waste.length > 0 && s.recycles < maxRecycles(s.options);
}

/** Tap on the stock: deal 1 or 3 cards to the waste, or turn the waste over when the stock is empty. */
export function draw(s: GameState): GameState | null {
  if (s.won) return null;
  if (s.stock.length === 0) {
    if (!canRecycle(s)) return null;
    const n = clone(s);
    n.stock = [...s.waste].reverse();
    n.waste = [];
    n.wasteFan = 0;
    n.recycles++;
    if (s.options.scoring === "standard") {
      const penalty = s.options.drawCount === 1 ? 100 : n.recycles >= 3 ? 20 : 0;
      n.score -= penalty;
    }
    return finish(n);
  }
  const n = clone(s);
  const k = Math.min(s.options.drawCount, s.stock.length);
  for (let i = 0; i < k; i++) n.waste.push(n.stock.pop()!);
  n.wasteFan = k;
  return finish(n);
}

export function canOnFoundation(card: number, pile: number[]): boolean {
  const t = top(pile);
  if (t === undefined) return rankOf(card) === 1;
  return suitIndex(t) === suitIndex(card) && rankOf(card) === rankOf(t) + 1;
}

/** `anyCard`: any card may start an empty column, not only a king. */
export function canOnTableau(card: number, col: Column, anyCard = false): boolean {
  const t = top(col.cards);
  if (t === undefined) return anyCard || rankOf(card) === 13;
  if (col.hidden >= col.cards.length) return false;
  return isRed(t) !== isRed(card) && rankOf(card) === rankOf(t) - 1;
}

/** The game's empty-column rule, for `canOnTableau`. */
export const anyOnEmpty = (s: GameState): boolean => s.options.kingOnly !== true;

/** A face-up run where every card goes on the one before it. */
export function isRun(cards: number[]): boolean {
  for (let i = 1; i < cards.length; i++) {
    if (isRed(cards[i]) === isRed(cards[i - 1]) || rankOf(cards[i]) !== rankOf(cards[i - 1]) - 1) return false;
  }
  return true;
}

/** Cards that would move when picking `from` (for the tableau: from `index` to the end). */
export function pickCards(s: GameState, from: Pile, index?: number): number[] | null {
  switch (from.kind) {
    case "waste": {
      const t = top(s.waste);
      return t === undefined ? null : [t];
    }
    case "foundation": {
      const t = top(s.foundations[from.index] ?? []);
      return t === undefined ? null : [t];
    }
    case "tableau": {
      const col = s.tableau[from.index];
      if (!col) return null;
      const i = index ?? col.cards.length - 1;
      if (i < col.hidden || i < 0 || i >= col.cards.length) return null;
      const cards = col.cards.slice(i);
      return isRun(cards) ? cards : null;
    }
    default:
      return null;
  }
}

export function samePile(a: Pile, b: Pile): boolean {
  if (a.kind !== b.kind) return false;
  return (a.kind !== "foundation" && a.kind !== "tableau") || a.index === (b as { index: number }).index;
}

function moveScore(scoring: Scoring, from: Pile["kind"], to: Pile["kind"]): number {
  if (scoring === "standard") {
    if (from === "waste" && to === "tableau") return 5;
    if (to === "foundation" && from !== "foundation") return 10;
    if (from === "foundation" && to === "tableau") return -15;
    return 0;
  }
  if (scoring === "vegas") {
    if (to === "foundation" && from !== "foundation") return 5;
    if (from === "foundation" && to !== "foundation") return -5;
  }
  return 0;
}

export function isWon(s: GameState): boolean {
  return s.foundations.every((f) => f.length === 13);
}

/** Move the card(s) picked at `from` / `index` onto `to`. Null when the move is not allowed. */
export function move(s: GameState, from: Pile, index: number | undefined, to: Pile): GameState | null {
  if (s.won || samePile(from, to)) return null;
  const cards = pickCards(s, from, index);
  if (!cards) return null;
  const first = cards[0];
  if (to.kind === "foundation") {
    if (cards.length !== 1 || !s.foundations[to.index] || !canOnFoundation(first, s.foundations[to.index])) return null;
  } else if (to.kind === "tableau") {
    if (!s.tableau[to.index] || !canOnTableau(first, s.tableau[to.index], anyOnEmpty(s))) return null;
  } else {
    return null;
  }

  const n = clone(s);
  if (from.kind === "waste") {
    n.waste.pop();
    n.wasteFan = Math.max(Math.min(1, n.waste.length), s.wasteFan - 1);
  } else if (from.kind === "foundation") {
    n.foundations[from.index].pop();
  } else if (from.kind === "tableau") {
    const col = n.tableau[from.index];
    col.cards.splice(col.cards.length - cards.length);
  }
  if (to.kind === "foundation") n.foundations[to.index].push(first);
  else n.tableau[to.index].cards.push(...cards);

  n.score += moveScore(s.options.scoring, from.kind, to.kind);
  if (from.kind === "tableau") {
    const col = n.tableau[from.index];
    if (col.cards.length > 0 && col.hidden >= col.cards.length) {
      col.hidden = col.cards.length - 1;
      if (s.options.scoring === "standard") n.score += 5;
    } else if (col.cards.length === 0) {
      col.hidden = 0;
    }
  }
  finish(n);
  if (isWon(n)) {
    n.won = true;
    if (n.options.scoring === "standard" && n.options.timed) {
      const sec = Math.floor(n.elapsedMs / 1000);
      if (sec >= 30) {
        n.bonus = Math.floor(700000 / sec);
        n.score += n.bonus;
      }
    }
  }
  return n;
}

/** Where a tap sends a card: a foundation first, then a tableau column (non-empty before empty). */
export function autoTarget(s: GameState, from: Pile, index?: number): Pile | null {
  if (s.won) return null;
  const cards = pickCards(s, from, index);
  if (!cards) return null;
  const first = cards[0];
  if (cards.length === 1 && from.kind !== "foundation") {
    const same = s.foundations.findIndex((f) => f.length > 0 && canOnFoundation(first, f));
    if (same >= 0) return { kind: "foundation", index: same };
    if (rankOf(first) === 1) return { kind: "foundation", index: s.foundations.findIndex((f) => f.length === 0) };
  }
  const start = from.kind === "tableau" ? from.index + 1 : 0;
  let empty: number | null = null;
  for (let k = 0; k < 7; k++) {
    const c = (start + k) % 7;
    if (from.kind === "tableau" && c === from.index) continue;
    const col = s.tableau[c];
    if (!canOnTableau(first, col, anyOnEmpty(s))) continue;
    if (col.cards.length === 0) {
      empty ??= c;
      continue;
    }
    return { kind: "tableau", index: c };
  }
  // A card that already sits at the bottom of its column gains nothing from an empty column.
  if (empty !== null && !(from.kind === "tableau" && (index ?? 0) === 0)) return { kind: "tableau", index: empty };
  return null;
}

/** Stock and waste are empty and every card is face up: the rest can be played to the foundations by itself. */
export function canAutoComplete(s: GameState): boolean {
  return (
    !s.won &&
    s.stock.length === 0 &&
    s.waste.length === 0 &&
    s.tableau.every((c) => c.hidden === 0) &&
    s.tableau.some((c) => c.cards.length > 0)
  );
}

/** One auto-complete step: the lowest tableau card that fits a foundation goes up. */
export function autoStep(s: GameState): GameState | null {
  let col = -1;
  let bestRank = 99;
  for (let i = 0; i < 7; i++) {
    const t = top(s.tableau[i].cards);
    if (t === undefined || !s.foundations.some((f) => canOnFoundation(t, f))) continue;
    if (rankOf(t) < bestRank) {
      bestRank = rankOf(t);
      col = i;
    }
  }
  if (col < 0) return null;
  const to = autoTarget(s, { kind: "tableau", index: col });
  if (!to || to.kind !== "foundation") return null;
  return move(s, { kind: "tableau", index: col }, undefined, to);
}

/** Points a timed standard game loses on the clock going from `fromMs` to `toMs` (2 every full 10 seconds). */
export function timePenalty(o: Options, fromMs: number, toMs: number): number {
  if (o.scoring !== "standard" || !o.timed) return 0;
  return 2 * Math.max(0, Math.floor(toMs / 10000) - Math.floor(fromMs / 10000));
}

/** Advance the clock. Timed standard games lose 2 points every full 10 seconds. */
export function tick(s: GameState, ms: number): GameState {
  if (!s.started || s.won || ms <= 0) return s;
  const elapsedMs = s.elapsedMs + ms;
  const penalty = timePenalty(s.options, s.elapsedMs, elapsedMs);
  return { ...s, elapsedMs, score: penalty > 0 ? Math.max(0, s.score - penalty) : s.score };
}

/**
 * Undo from `cur` back to `prev` (an earlier state of the same game): the cards and move score of `prev`, the clock
 * of `cur`. The clock keeps running, and the time penalty paid since `prev` stays paid (else deal + undo would win
 * the points back).
 */
export function undoTo(prev: GameState, cur: GameState): GameState {
  const penalty = timePenalty(prev.options, prev.elapsedMs, cur.elapsedMs);
  const n: GameState = { ...prev, elapsedMs: cur.elapsedMs, score: penalty > 0 ? Math.max(0, prev.score - penalty) : prev.score, started: true };
  // The "no more moves" dialog stays closed for the whole game.
  if (cur.lostDismissed) n.lostDismissed = true;
  return n;
}

export interface Hint {
  from: Pile;
  index?: number;
  /** `stock` = deal from the stock. */
  to: Pile;
}

/** A useful next move, or null when nothing is left (stock exhausted too). */
export function findHint(s: GameState): Hint | null {
  if (s.won) return null;
  const waste: Pile = { kind: "waste" };
  const wasteTop = top(s.waste);
  // 1. Anything onto a foundation.
  if (wasteTop !== undefined) {
    const to = autoTarget(s, waste);
    if (to?.kind === "foundation") return { from: waste, to };
  }
  for (let c = 0; c < 7; c++) {
    if (s.tableau[c].cards.length === 0) continue;
    const from: Pile = { kind: "tableau", index: c };
    const to = autoTarget(s, from);
    if (to?.kind === "foundation") return { from, to };
  }
  // 2. A tableau run that uncovers a face-down card (or a king run that frees its column for nothing: skipped).
  for (let c = 0; c < 7; c++) {
    const col = s.tableau[c];
    if (col.hidden === 0 || col.cards.length === 0) continue;
    const card = col.cards[col.hidden];
    for (let d = 0; d < 7; d++) {
      if (d === c || !canOnTableau(card, s.tableau[d], anyOnEmpty(s))) continue;
      return { from: { kind: "tableau", index: c }, index: col.hidden, to: { kind: "tableau", index: d } };
    }
  }
  // 3. The waste card onto the tableau.
  if (wasteTop !== undefined) {
    const to = autoTarget(s, waste);
    if (to?.kind === "tableau") return { from: waste, to };
  }
  // 4. Deal from the stock.
  if (s.stock.length > 0 || canRecycle(s)) return { from: { kind: "stock" }, to: { kind: "stock" } };
  return null;
}

/** Where a card is right now. */
export function locate(s: GameState, card: number): { pile: Pile; index: number; faceUp: boolean } | null {
  let i = s.stock.indexOf(card);
  if (i >= 0) return { pile: { kind: "stock" }, index: i, faceUp: false };
  i = s.waste.indexOf(card);
  if (i >= 0) return { pile: { kind: "waste" }, index: i, faceUp: true };
  for (let f = 0; f < 4; f++) {
    i = s.foundations[f].indexOf(card);
    if (i >= 0) return { pile: { kind: "foundation", index: f }, index: i, faceUp: true };
  }
  for (let c = 0; c < 7; c++) {
    i = s.tableau[c].cards.indexOf(card);
    if (i >= 0) return { pile: { kind: "tableau", index: c }, index: i, faceUp: i >= s.tableau[c].hidden };
  }
  return null;
}

/** Shape check for a state read back from storage: the right fields and each of the 52 cards exactly once. */
export function isValidGame(x: unknown): x is GameState {
  if (!x || typeof x !== "object") return false;
  const s = x as GameState;
  if (s.v !== 1 || typeof s.seed !== "number" || !s.options) return false;
  if (s.options.drawCount !== 1 && s.options.drawCount !== 3) return false;
  if (!["standard", "vegas", "none"].includes(s.options.scoring)) return false;
  if (s.options.kingOnly !== undefined && typeof s.options.kingOnly !== "boolean") return false;
  if (s.lostDismissed !== undefined && typeof s.lostDismissed !== "boolean") return false;
  if (!Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.foundations) || !Array.isArray(s.tableau)) return false;
  if (s.foundations.length !== 4 || s.tableau.length !== 7) return false;
  for (const n of [s.wasteFan, s.score, s.bonus, s.recycles, s.moves, s.elapsedMs]) if (typeof n !== "number" || !Number.isFinite(n)) return false;
  const all: number[] = [...s.stock, ...s.waste];
  for (const f of s.foundations) {
    if (!Array.isArray(f)) return false;
    all.push(...f);
  }
  for (const c of s.tableau) {
    if (!c || !Array.isArray(c.cards) || typeof c.hidden !== "number" || c.hidden < 0) return false;
    if (c.cards.length > 0 && c.hidden >= c.cards.length) return false;
    all.push(...c.cards);
  }
  if (all.length !== 52) return false;
  const seen = new Set(all);
  return seen.size === 52 && all.every((c) => Number.isInteger(c) && c >= 0 && c < 52);
}
