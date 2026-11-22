import { describe, expect, it } from "vitest";
import {
  autoStep,
  anyOnEmpty,
  autoTarget,
  canAutoComplete,
  canOnFoundation,
  canOnTableau,
  canRecycle,
  cardOf,
  DEFAULT_OPTIONS,
  draw,
  findHint,
  isValidGame,
  isWon,
  locate,
  move,
  newGame,
  pickCards,
  rankOf,
  shuffledDeck,
  SUITS,
  suitOf,
  tick,
  timePenalty,
  undoTo,
  type GameState,
  type Options,
  type Pile,
} from "./solitaire";

// The classic rule (only a king on an empty column) unless a test says otherwise.
const STD: Options = { drawCount: 1, scoring: "standard", timed: true, kingOnly: true };
const ANY: Options = { ...STD, kingOnly: false };
const W: Pile = { kind: "waste" };
const F = (index: number): Pile => ({ kind: "foundation", index });
const T = (index: number): Pile => ({ kind: "tableau", index });

/** An empty board (cards not on it are simply missing) with the given piles. */
function board(patch: Partial<GameState>, options: Options = STD): GameState {
  const g = newGame(1, options);
  return {
    ...g,
    stock: [],
    waste: [],
    wasteFan: 0,
    foundations: [[], [], [], []],
    tableau: Array.from({ length: 7 }, () => ({ cards: [], hidden: 0 })),
    score: options.scoring === "vegas" ? -52 : 0,
    started: true,
    ...patch,
  };
}

/** Foundations holding A..upTo of every suit, in SUITS order. */
const fullTo = (upTo: number) => SUITS.map((s) => Array.from({ length: upTo }, (_, i) => cardOf(s, i + 1)));

/** Every king on its own column (0-3), the rest on the foundations: one move from a win. */
const nearWin = (options: Options = STD) =>
  board(
    {
      foundations: fullTo(12),
      tableau: [
        ...SUITS.map((s) => ({ cards: [cardOf(s, 13)], hidden: 0 })),
        { cards: [], hidden: 0 },
        { cards: [], hidden: 0 },
        { cards: [], hidden: 0 },
      ],
    },
    options,
  );

describe("deal", () => {
  it("deals 1..7 cards to the columns, the last one face up, and 24 to the stock", () => {
    const g = newGame(123);
    expect(g.tableau.map((c) => c.cards.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(g.tableau.map((c) => c.hidden)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(g.stock).toHaveLength(24);
    expect(g.waste).toHaveLength(0);
    expect(isValidGame(g)).toBe(true);
    expect(g.started).toBe(false);
    expect(g.score).toBe(0);
  });

  it("is deterministic per seed and differs between seeds", () => {
    expect(newGame(7)).toEqual(newGame(7));
    expect(shuffledDeck(7)).not.toEqual(shuffledDeck(8));
    expect(new Set(shuffledDeck(99)).size).toBe(52);
  });

  it("starts Vegas at -52", () => {
    expect(newGame(1, { drawCount: 3, scoring: "vegas", timed: false }).score).toBe(-52);
  });

  it("maps card numbers to suits and ranks", () => {
    expect(rankOf(cardOf("H", 1))).toBe(1);
    expect(rankOf(cardOf("D", 13))).toBe(13);
    expect(suitOf(cardOf("C", 5))).toBe("C");
  });
});

describe("stock", () => {
  it("draw 1 turns one card, draw 3 turns three", () => {
    const one = draw(newGame(5))!;
    expect(one.waste).toHaveLength(1);
    expect(one.stock).toHaveLength(23);
    expect(one.started).toBe(true);
    expect(one.moves).toBe(1);
    const three = draw(newGame(5, { ...STD, drawCount: 3 }))!;
    expect(three.waste).toHaveLength(3);
    expect(three.wasteFan).toBe(3);
    expect(three.waste[2]).toBe(newGame(5).stock[21]);
  });

  it("turning the waste back restores the original stock order and costs 100 points with draw 1", () => {
    let g = newGame(11);
    const original = [...g.stock];
    for (let i = 0; i < 24; i++) g = draw(g)!;
    expect(g.stock).toHaveLength(0);
    expect(canRecycle(g)).toBe(true);
    g = draw({ ...g, score: 150 })!;
    expect(g.stock).toEqual(original);
    expect(g.waste).toHaveLength(0);
    expect(g.score).toBe(50);
    expect(g.recycles).toBe(1);
  });

  it("the score never goes below 0 in standard scoring", () => {
    let g = newGame(11);
    for (let i = 0; i < 24; i++) g = draw(g)!;
    expect(draw(g)!.score).toBe(0);
  });

  it("draw 3 recycles are free twice, then cost 20", () => {
    let g = { ...newGame(3, { ...STD, drawCount: 3 }), score: 100 };
    const cycle = () => {
      while (g.stock.length > 0) g = draw(g)!;
      g = draw(g)!;
    };
    cycle();
    expect(g.score).toBe(100);
    cycle();
    expect(g.score).toBe(100);
    cycle();
    expect(g.score).toBe(80);
  });

  it("Vegas: one pass with draw 1, three passes with draw 3", () => {
    let g = newGame(2, { drawCount: 1, scoring: "vegas", timed: false });
    for (let i = 0; i < 24; i++) g = draw(g)!;
    expect(canRecycle(g)).toBe(false);
    expect(draw(g)).toBeNull();

    let h = newGame(2, { drawCount: 3, scoring: "vegas", timed: false });
    for (let pass = 0; pass < 3; pass++) {
      while (h.stock.length > 0) h = draw(h)!;
      if (pass < 2) h = draw(h)!;
    }
    expect(h.recycles).toBe(2);
    expect(draw(h)).toBeNull();
  });
});

describe("rules", () => {
  it("foundations take an ace, then the same suit one rank up", () => {
    expect(canOnFoundation(cardOf("S", 1), [])).toBe(true);
    expect(canOnFoundation(cardOf("S", 2), [])).toBe(false);
    expect(canOnFoundation(cardOf("S", 2), [cardOf("S", 1)])).toBe(true);
    expect(canOnFoundation(cardOf("C", 2), [cardOf("S", 1)])).toBe(false);
  });

  it("tableau takes the other colour one rank down, and only a king on an empty column", () => {
    const col = { cards: [cardOf("H", 10)], hidden: 0 };
    expect(canOnTableau(cardOf("S", 9), col)).toBe(true);
    expect(canOnTableau(cardOf("C", 9), col)).toBe(true);
    expect(canOnTableau(cardOf("D", 9), col)).toBe(false);
    expect(canOnTableau(cardOf("S", 8), col)).toBe(false);
    expect(canOnTableau(cardOf("S", 13), { cards: [], hidden: 0 })).toBe(true);
    expect(canOnTableau(cardOf("S", 12), { cards: [], hidden: 0 })).toBe(false);
  });

  it("face-down cards cannot be picked up", () => {
    const g = newGame(4);
    expect(pickCards(g, T(6), 0)).toBeNull();
    expect(pickCards(g, T(6), 6)).toEqual([g.tableau[6].cards[6]]);
    expect(pickCards(g, W)).toBeNull();
  });
});

describe("moves and scoring", () => {
  it("waste to foundation +10, tableau to foundation +10 and +5 for the card turned over", () => {
    const hidden = cardOf("C", 9);
    let g = board({ waste: [cardOf("H", 1)], wasteFan: 1, tableau: [{ cards: [hidden, cardOf("H", 2)], hidden: 1 }, ...board({}).tableau.slice(1)] });
    g = move(g, W, undefined, F(0))!;
    expect(g.foundations[0]).toEqual([cardOf("H", 1)]);
    expect(g.score).toBe(10);
    expect(g.waste).toHaveLength(0);
    g = move(g, T(0), undefined, F(0))!;
    expect(g.score).toBe(25);
    expect(g.tableau[0]).toEqual({ cards: [hidden], hidden: 0 });
  });

  it("waste to tableau +5, foundation back to tableau -15 (floored at 0)", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("S", 10)], hidden: 0 };
    let g = board({ waste: [cardOf("H", 9)], wasteFan: 1, tableau: tab, foundations: [[cardOf("D", 1), cardOf("D", 2)], [], [], []] });
    g = move(g, W, undefined, T(0))!;
    expect(g.score).toBe(5);
    tab[1] = { cards: [cardOf("S", 3)], hidden: 0 };
    g = move({ ...g, tableau: g.tableau.map((c, i) => (i === 1 ? tab[1] : c)) }, F(0), undefined, T(1))!;
    expect(g.tableau[1].cards).toEqual([cardOf("S", 3), cardOf("D", 2)]);
    expect(g.score).toBe(0);
  });

  it("Vegas pays 5 per card on a foundation and takes it back when it comes down", () => {
    const vegas: Options = { drawCount: 3, scoring: "vegas", timed: false };
    const tab = board({}, vegas).tableau;
    tab[0] = { cards: [cardOf("S", 3)], hidden: 0 };
    let g = board({ waste: [cardOf("D", 1)], wasteFan: 1, tableau: tab }, vegas);
    g = move(g, W, undefined, F(2))!;
    expect(g.score).toBe(-47);
    expect(move(g, F(2), undefined, T(0))).toBeNull();
  });

  it("moves a whole run and rejects illegal targets", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("C", 4), cardOf("H", 9), cardOf("S", 8), cardOf("D", 7)], hidden: 1 };
    tab[1] = { cards: [cardOf("C", 10)], hidden: 0 };
    tab[2] = { cards: [cardOf("H", 10)], hidden: 0 };
    const g = board({ tableau: tab });
    expect(move(g, T(0), 1, T(2))).toBeNull(); // red 9 on red 10
    const n = move(g, T(0), 1, T(1))!;
    expect(n.tableau[1].cards).toEqual([cardOf("C", 10), cardOf("H", 9), cardOf("S", 8), cardOf("D", 7)]);
    expect(n.tableau[0]).toEqual({ cards: [cardOf("C", 4)], hidden: 0 });
    expect(n.score).toBe(5);
    expect(move(g, T(0), 1, F(0))).toBeNull(); // several cards never go to a foundation
    expect(move(g, T(0), 0, T(1))).toBeNull(); // face down
  });

  it("draw 3: playing the top waste card keeps the rest of the fan", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("S", 10)], hidden: 0 };
    const g = board({ waste: [cardOf("C", 2), cardOf("C", 3), cardOf("H", 9)], wasteFan: 3, tableau: tab }, { ...STD, drawCount: 3 });
    expect(move(g, W, undefined, T(0))!.wasteFan).toBe(2);
  });
});

describe("tap target", () => {
  it("prefers the matching foundation, any empty one for an ace", () => {
    const g = board({ waste: [cardOf("D", 1)], wasteFan: 1, foundations: [[cardOf("S", 1)], [], [], []] });
    expect(autoTarget(g, W)).toEqual(F(1));
    const h = board({ waste: [cardOf("S", 2)], wasteFan: 1, foundations: [[cardOf("H", 1)], [cardOf("S", 1)], [], []] });
    expect(autoTarget(h, W)).toEqual(F(1));
  });

  it("goes to a fitting column, an empty column only for a king that would uncover something", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("C", 5), cardOf("H", 13)], hidden: 1 };
    tab[3] = { cards: [cardOf("D", 13)], hidden: 0 };
    tab[5] = { cards: [cardOf("S", 6)], hidden: 0 };
    tab[6] = { cards: [cardOf("H", 5)], hidden: 0 };
    const g = board({ tableau: tab });
    expect(autoTarget(g, T(0), 1)).toEqual(T(1)); // first empty column after column 0
    expect(autoTarget(g, T(3), 0)).toBeNull(); // king already at the bottom
    expect(autoTarget(g, T(6))).toEqual(T(5)); // red 5 on black 6
    expect(autoTarget(g, T(5))).toBeNull(); // black 6 has nowhere to go
  });
});

describe("winning", () => {
  it("the last card wins; timed standard adds 700000 / seconds", () => {
    const g = { ...nearWin(), elapsedMs: 100_000, score: 500 };
    let s: GameState = g;
    for (let i = 0; i < 3; i++) s = move(s, T(i), undefined, F(i))!;
    expect(s.won).toBe(false);
    s = move(s, T(3), undefined, F(3))!;
    expect(s.won).toBe(true);
    expect(isWon(s)).toBe(true);
    expect(s.bonus).toBe(7000);
    expect(s.score).toBe(500 + 40 + 7000);
    expect(move(s, F(0), undefined, T(0))).toBeNull();
    expect(draw(s)).toBeNull();
  });

  it("no bonus under 30 s or untimed", () => {
    let s: GameState = { ...nearWin(), elapsedMs: 29_000 };
    for (let i = 0; i < 4; i++) s = move(s, T(i), undefined, F(i))!;
    expect(s.bonus).toBe(0);
    let u: GameState = { ...nearWin({ ...STD, timed: false }), elapsedMs: 100_000 };
    for (let i = 0; i < 4; i++) u = move(u, T(i), undefined, F(i))!;
    expect(u.won).toBe(true);
    expect(u.bonus).toBe(0);
  });

  it("auto-complete plays everything up once all cards are face up", () => {
    const tab = board({}).tableau;
    // Kings and queens left, spread over two columns as alternating runs.
    tab[0] = { cards: [cardOf("S", 13), cardOf("H", 12)], hidden: 0 };
    tab[1] = { cards: [cardOf("H", 13), cardOf("S", 12)], hidden: 0 };
    tab[2] = { cards: [cardOf("C", 13), cardOf("D", 12)], hidden: 0 };
    tab[3] = { cards: [cardOf("D", 13), cardOf("C", 12)], hidden: 0 };
    let s = board({ foundations: fullTo(11), tableau: tab });
    expect(canAutoComplete(s)).toBe(true);
    let steps = 0;
    while (!s.won) {
      const n = autoStep(s);
      expect(n).not.toBeNull();
      s = n!;
      steps++;
    }
    expect(steps).toBe(8);
    expect(canAutoComplete(s)).toBe(false);
    expect(autoStep(s)).toBeNull();
  });

  it("no auto-complete while cards are face down or the stock has cards", () => {
    expect(canAutoComplete(newGame(1))).toBe(false);
    expect(canAutoComplete({ ...nearWin(), stock: [0] })).toBe(false);
  });
});

describe("clock", () => {
  it("timed standard loses 2 points per full 10 s, only while started", () => {
    const g = { ...newGame(1), started: true, score: 10 };
    const a = tick(g, 10_000);
    expect(a.score).toBe(8);
    expect(a.elapsedMs).toBe(10_000);
    const b = tick(a, 25_000);
    expect(b.score).toBe(4);
    expect(tick(newGame(1), 5000).elapsedMs).toBe(0);
    expect(tick({ ...g, options: { ...STD, timed: false } }, 60_000).score).toBe(10);
    expect(tick({ ...g, score: 1 }, 10_000).score).toBe(0);
  });

  it("undo gives back the cards and the move score, never the time penalty", () => {
    // Standard, timed: 100 points at 5 s, a deal, then 30 s later (3 penalties) an undo.
    const prev = { ...newGame(3, STD), started: true, score: 100, elapsedMs: 5_000 };
    const dealt = draw(prev)!;
    const later = tick(dealt, 30_000);
    expect(later.score).toBe(94);
    const back = undoTo(prev, later);
    expect(back.stock).toEqual(prev.stock);
    expect(back.waste).toEqual([]);
    expect(back.elapsedMs).toBe(35_000);
    expect(back.score).toBe(94);
    // Deal + undo over and over: the score keeps going down with the clock.
    let g = back;
    for (let i = 0; i < 5; i++) g = undoTo(g, tick(draw(g)!, 10_000));
    expect(g.score).toBe(84);
    // A move score is given back (+10 to a foundation undone), the penalty in between is not.
    const scored = { ...later, score: later.score + 10 };
    expect(undoTo(later, tick(scored, 10_000)).score).toBe(92);
    // Never below 0.
    expect(undoTo({ ...prev, score: 3 }, later).score).toBe(0);
    // Several undos in a row: each history state already holds the penalties up to its own time.
    const a = { ...prev, elapsedMs: 0, score: 50 };
    const b = { ...tick(draw(a)!, 15_000), score: 58 }; // 50 - 2 + 10
    const c = tick({ ...draw(b)!, score: 68 }, 20_000); // at 35 s: -4
    expect(c.score).toBe(64);
    const toB = undoTo(b, c);
    expect(toB.score).toBe(54);
    expect(undoTo(a, toB).score).toBe(44); // 50 - 3 penalties (10, 20, 30 s)
  });

  it("the time penalty only applies to timed standard games", () => {
    expect(timePenalty(STD, 5_000, 35_000)).toBe(6);
    expect(timePenalty(STD, 35_000, 5_000)).toBe(0);
    expect(timePenalty({ ...STD, timed: false }, 0, 60_000)).toBe(0);
    expect(timePenalty({ ...STD, scoring: "vegas" }, 0, 60_000)).toBe(0);
    expect(timePenalty({ ...STD, scoring: "none" }, 0, 60_000)).toBe(0);
    const vegas = { ...newGame(3, { ...STD, scoring: "vegas" }), started: true, elapsedMs: 5_000 };
    expect(undoTo(vegas, tick(draw(vegas)!, 60_000)).score).toBe(-52);
    const untimed = { ...newGame(3, { ...STD, timed: false }), started: true, score: 20 };
    expect(undoTo(untimed, tick(draw(untimed)!, 60_000)).score).toBe(20);
  });
});

describe("hint", () => {
  it("suggests a foundation move first", () => {
    expect(findHint(nearWin())?.to.kind).toBe("foundation");
  });

  it("suggests the stock when nothing else moves, null when the stock is spent too", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("S", 5)], hidden: 0 };
    const g = board({ tableau: tab, stock: [cardOf("S", 9)] });
    expect(findHint(g)).toEqual({ from: { kind: "stock" }, to: { kind: "stock" } });
    expect(findHint({ ...g, stock: [] })).toBeNull();
  });

  it("uncovers face-down cards", () => {
    const tab = board({}).tableau;
    tab[0] = { cards: [cardOf("S", 2), cardOf("H", 9)], hidden: 1 };
    tab[4] = { cards: [cardOf("C", 10)], hidden: 0 };
    const h = findHint(board({ tableau: tab }));
    expect(h).toEqual({ from: T(0), index: 1, to: T(4) });
  });
});

describe("storage shape", () => {
  it("accepts real games and rejects broken ones", () => {
    expect(isValidGame(newGame(5))).toBe(true);
    expect(isValidGame(null)).toBe(false);
    expect(isValidGame({})).toBe(false);
    const g = newGame(5);
    expect(isValidGame({ ...g, stock: g.stock.slice(1) })).toBe(false);
    expect(isValidGame({ ...g, stock: [g.tableau[0].cards[0], ...g.stock.slice(1)] })).toBe(false);
    expect(isValidGame({ ...g, options: { ...g.options, drawCount: 2 } })).toBe(false);
    expect(isValidGame({ ...g, options: { ...g.options, kingOnly: "yes" as unknown as boolean } })).toBe(false);
    // Games saved before the empty-column setting existed have no `kingOnly`: still valid, any card goes.
    const { kingOnly: _drop, ...old } = g.options;
    void _drop;
    expect(isValidGame({ ...g, options: old })).toBe(true);
    expect(anyOnEmpty({ ...g, options: old })).toBe(true);
  });

  it("locates every card", () => {
    const g = newGame(8);
    for (let c = 0; c < 52; c++) expect(locate(g, c)).not.toBeNull();
    expect(locate(g, g.tableau[6].cards[0])).toEqual({ pile: T(6), index: 0, faceUp: false });
  });
});

describe("empty column rule", () => {
  // Column 0: a face-down 5 under a face-up 10 of hearts; column 1 empty; column 2: a lone queen.
  const setup = (options: Options) => {
    const tab = board({}, options).tableau;
    tab[0] = { cards: [cardOf("C", 5), cardOf("H", 10)], hidden: 1 };
    tab[2] = { cards: [cardOf("S", 12)], hidden: 0 };
    return board({ tableau: tab, waste: [cardOf("D", 7)], wasteFan: 1 }, options);
  };

  it("by default any card may start an empty column", () => {
    expect(DEFAULT_OPTIONS.kingOnly).toBe(false);
    expect(anyOnEmpty(newGame(3))).toBe(true);
    expect(canOnTableau(cardOf("S", 12), { cards: [], hidden: 0 }, true)).toBe(true);
    expect(canOnTableau(cardOf("S", 12), { cards: [], hidden: 0 }, false)).toBe(false);
  });

  it("any card: moves, taps and hints use the empty column", () => {
    const g = setup(ANY);
    const n = move(g, T(0), 1, T(1))!;
    expect(n.tableau[1].cards).toEqual([cardOf("H", 10)]);
    expect(n.tableau[0].hidden).toBe(0); // the 5 underneath turned over
    expect(n.score).toBe(5);
    expect(move(g, W, undefined, T(1))!.tableau[1].cards).toEqual([cardOf("D", 7)]);
    expect(autoTarget(g, T(0), 1)).toEqual(T(1));
    expect(autoTarget(g, W)).toEqual(T(1));
    expect(autoTarget(g, T(2), 0)).toBeNull(); // already at the bottom of its column: moving it gains nothing
    expect(findHint(g)).toEqual({ from: T(0), index: 1, to: T(1) });
  });

  it("king only: the same cards may not go there", () => {
    const g = setup(STD);
    expect(move(g, T(0), 1, T(1))).toBeNull();
    expect(move(g, W, undefined, T(1))).toBeNull();
    expect(autoTarget(g, T(0), 1)).toBeNull();
    expect(autoTarget(g, W)).toBeNull();
    expect(findHint(g)?.to.kind).not.toBe("tableau");
  });
});

describe("random games", () => {
  it.each([
    ["any card on an empty column", ANY],
    ["only a king on an empty column", STD],
  ])("keep all 52 cards through hint-driven play, and some of them are won (%s)", (_name, options) => {
    let wins = 0;
    for (let seed = 1; seed <= 150; seed++) {
      let g = newGame(seed, options);
      for (let step = 0; step < 600 && !g.won; step++) {
        const h = findHint(g);
        if (!h) break;
        const next = h.from.kind === "stock" ? draw(g) : move(g, h.from, h.index, h.to);
        expect(next).not.toBeNull();
        g = next!;
        expect(isValidGame(g)).toBe(true);
        while (canAutoComplete(g)) g = autoStep(g)!;
      }
      if (g.won) wins++;
    }
    expect(wins).toBeGreaterThan(0);
  });
});
