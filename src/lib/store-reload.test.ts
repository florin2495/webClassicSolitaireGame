import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cardOf, newGame, SUITS, type GameState } from "./solitaire";

// A reload = a fresh copy of the store module reading the same localStorage (stubbed here, Node has none).
class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const KEY_GAME = "solitaire:game:v1";

/** Every king on its own column, the rest on the foundations: four auto steps win it. Not started yet. */
function nearWin(): GameState {
  const g = newGame(1, { drawCount: 1, scoring: "standard", timed: true, kingOnly: false });
  return {
    ...g,
    stock: [],
    waste: [],
    foundations: SUITS.map((s) => Array.from({ length: 12 }, (_, i) => cardOf(s, i + 1))),
    tableau: [...SUITS.map((s) => ({ cards: [cardOf(s, 13)], hidden: 0 })), ...[0, 1, 2].map(() => ({ cards: [], hidden: 0 }))],
    elapsedMs: 60_000,
  };
}

async function reloadStore() {
  vi.resetModules();
  return import("./store");
}

describe("win animation and reload", () => {
  let storage: MemoryStorage;
  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("a reload during the cascade goes straight to the result, the win counted once", async () => {
    storage.setItem(KEY_GAME, JSON.stringify(nearWin()));
    let store = await reloadStore();
    expect(store.getSnapshot().game.won).toBe(false);
    for (let i = 0; i < 4; i++) expect(store.actions.autoStep()).toBe(true);
    let s = store.getSnapshot();
    expect(s.game.won).toBe(true);
    expect(s.cascading).toBe(true);
    expect(s.canUndo).toBe(false);
    expect(s.stats).toMatchObject({ played: 1, won: 1 });
    // Already saved as celebrated, while the animation still runs.
    expect((JSON.parse(storage.getItem(KEY_GAME)!) as GameState).celebrated).toBe(true);

    store = await reloadStore();
    s = store.getSnapshot();
    expect(s.game.won).toBe(true);
    expect(s.cascading).toBe(false);
    expect(s.stats).toMatchObject({ played: 1, won: 1 });
  });

  it("the cascade ends on a tap (or at its end) without touching the stats", async () => {
    storage.setItem(KEY_GAME, JSON.stringify(nearWin()));
    const store = await reloadStore();
    for (let i = 0; i < 4; i++) store.actions.autoStep();
    const stats = store.getSnapshot().stats;
    store.actions.endCascade();
    expect(store.getSnapshot().cascading).toBe(false);
    expect(store.getSnapshot().stats).toBe(stats);
    store.actions.newGame(3);
    expect(store.getSnapshot().cascading).toBe(false);
    expect(store.getSnapshot().game.won).toBe(false);
  });

  it("a game saved during the cascade by an older version also opens on the result", async () => {
    const won: GameState = {
      ...nearWin(),
      foundations: SUITS.map((s) => Array.from({ length: 13 }, (_, i) => cardOf(s, i + 1))),
      tableau: Array.from({ length: 7 }, () => ({ cards: [], hidden: 0 })),
      started: true,
      won: true,
      celebrated: false,
    };
    storage.setItem(KEY_GAME, JSON.stringify(won));
    const s = (await reloadStore()).getSnapshot();
    expect(s.game.won).toBe(true);
    expect(s.game.celebrated).toBe(true);
    expect(s.cascading).toBe(false);
  });
});
