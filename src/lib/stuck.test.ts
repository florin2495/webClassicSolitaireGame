import { describe, expect, it } from "vitest";
import { draw, findHint, isValidGame, move, newGame, tick } from "./solitaire";
import { outlook, positionKey, successors } from "./stuck";
import { deadEndBoard, rescueBoard } from "./test-boards";

describe("game lost", () => {
  it("the test boards are real games (all 52 cards, once each)", () => {
    expect(isValidGame(deadEndBoard())).toBe(true);
    expect(isValidGame(rescueBoard())).toBe(true);
  });

  it("a fresh deal is (almost always) open", () => {
    // About 1 deal in 400 has no move at all, so allow one.
    const lost = Array.from({ length: 20 }, (_, i) => outlook(newGame(i + 1))).filter((o) => o === "lost");
    expect(lost.length).toBeLessThanOrEqual(1);
  });

  it("no move anywhere, the whole stock seen: lost (any card or king only on empty columns, draw 1 or 3, Vegas)", () => {
    const g = deadEndBoard();
    expect(findHint(g)?.from.kind).toBe("stock");
    expect(outlook(g)).toBe("lost");
    expect(outlook(deadEndBoard({ ...g.options, kingOnly: true }))).toBe("lost");
    expect(outlook(deadEndBoard({ ...g.options, drawCount: 3 }))).toBe("lost");
    expect(outlook(deadEndBoard({ ...g.options, scoring: "vegas" }))).toBe("lost");
    // Still lost halfway through the stock, and with it turned over.
    const d = draw(draw(g)!)!;
    expect(outlook(d)).toBe("lost");
  });

  it("the hint only says 'deal a card', yet a card taken back down from a foundation saves the game", () => {
    const g = rescueBoard();
    expect(findHint(g)?.from.kind).toBe("stock");
    expect(outlook(g)).toBe("open");
    // The way out: 5♥ down onto the 6♣ (column 4), the 4♣ (column 6) onto it, a face-down card turns over.
    const down = move(g, { kind: "foundation", index: 1 }, undefined, { kind: "tableau", index: 4 })!;
    const up = move(down, { kind: "tableau", index: 6 }, undefined, { kind: "tableau", index: 4 })!;
    expect(up.tableau[6].hidden).toBe(g.tableau[6].hidden - 1);
  });

  it("too many positions to look at: unknown, never a wrong 'lost'", () => {
    expect(outlook(deadEndBoard(), 1)).toBe("unknown");
  });

  it("successors are exactly the legal actions", () => {
    const g = rescueBoard();
    const next = successors(g);
    // A deal, and the 5♥ down onto either black 6.
    expect(next).toHaveLength(3);
    for (const n of next) expect(isValidGame(n)).toBe(true);
  });

  it("the position key ignores the clock and the score, so a tick does not re-run the search", () => {
    const g = deadEndBoard();
    const later = tick(g, 25_000);
    expect(later).not.toBe(g);
    expect(later.elapsedMs).toBe(g.elapsedMs + 25_000);
    expect(positionKey(later)).toBe(positionKey(g));
    expect(positionKey({ ...g, score: 999, moves: 7 })).toBe(positionKey(g));
    // A deal, a different rule or a recycle count is a different position.
    expect(positionKey(draw(g)!)).not.toBe(positionKey(g));
    expect(positionKey({ ...g, options: { ...g.options, kingOnly: true } })).not.toBe(positionKey(g));
    expect(positionKey({ ...g, recycles: 1 })).not.toBe(positionKey(g));
  });

  it("a won game is not lost", () => {
    const g = { ...newGame(2), won: true };
    expect(outlook(g)).toBe("open");
  });
});
