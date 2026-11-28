import { beforeEach, describe, expect, it } from "vitest";
import { newGame } from "./solitaire";
import { actions, clearedStats, EMPTY_STATS, getSnapshot, parseSettings, parseStats, subscribe, updateStats } from "./store";

// Runs in Node: no window / localStorage, so the store keeps everything in memory (the same code path as blocked storage).
describe("store", () => {
  beforeEach(() => {
    actions.newGame(42);
    actions.updateSettings({ drawCount: 1, scoring: "standard", timed: true, kingOnly: false });
    actions.newGame(42);
    actions.resetStats();
  });

  it("deals the requested seed with the current settings", () => {
    const s = getSnapshot();
    expect(s.game.seed).toBe(42);
    expect(s.game.options.drawCount).toBe(1);
    expect(s.canUndo).toBe(false);
  });

  it("counts a game as played at the first move and undoes moves", () => {
    const before = getSnapshot().game;
    expect(actions.draw()).toBe(true);
    expect(getSnapshot().stats.played).toBe(1);
    expect(getSnapshot().canUndo).toBe(true);
    expect(actions.draw()).toBe(true);
    expect(getSnapshot().stats.played).toBe(1);
    expect(actions.undo()).toBe(true);
    expect(actions.undo()).toBe(true);
    expect(getSnapshot().game.stock).toEqual(before.stock);
    expect(getSnapshot().game.waste).toEqual([]);
    expect(getSnapshot().canUndo).toBe(false);
    expect(actions.undo()).toBe(false);
  });

  it("re-deals right away when the rules change before the first move, later only on the next game", () => {
    actions.updateSettings({ drawCount: 3 });
    expect(getSnapshot().game.options.drawCount).toBe(3);
    expect(getSnapshot().game.seed).toBe(42);
    actions.draw();
    actions.updateSettings({ drawCount: 1 });
    expect(getSnapshot().game.options.drawCount).toBe(3);
    expect(getSnapshot().settings.drawCount).toBe(1);
    actions.newGame(7);
    expect(getSnapshot().game.options.drawCount).toBe(1);
  });

  it("the empty-column rule defaults to any card and switches at once, also for undo", () => {
    expect(getSnapshot().settings.kingOnly).toBe(false);
    expect(getSnapshot().game.options.kingOnly).toBe(false);
    actions.draw();
    actions.updateSettings({ kingOnly: true });
    expect(getSnapshot().game.options.kingOnly).toBe(true);
    expect(getSnapshot().game.seed).toBe(42); // same game, no re-deal
    expect(getSnapshot().stats.played).toBe(1);
    expect(actions.undo()).toBe(true);
    expect(getSnapshot().game.options.kingOnly).toBe(true);
    actions.updateSettings({ kingOnly: false });
    expect(getSnapshot().game.options.kingOnly).toBe(false);
    expect(parseSettings({}).kingOnly).toBe(false);
    expect(parseSettings({ kingOnly: true }).kingOnly).toBe(true);
    expect(parseSettings({ kingOnly: "yes" }).kingOnly).toBe(false);
  });

  it("wiping the stats keeps the game in progress counted as played", () => {
    actions.resetStats();
    expect(getSnapshot().stats.played).toBe(0);
    actions.draw();
    expect(getSnapshot().stats.played).toBe(1);
    actions.resetStats();
    expect(getSnapshot().stats).toEqual({ ...EMPTY_STATS, played: 1 });
    // Next game counts on top of it.
    actions.newGame(9);
    actions.draw();
    expect(getSnapshot().stats.played).toBe(2);
  });

  it("closing the 'no more moves' dialog is kept with the game, through undo, until the next deal", () => {
    expect(getSnapshot().game.lostDismissed).toBeUndefined();
    actions.draw();
    actions.dismissLost();
    expect(getSnapshot().game.lostDismissed).toBe(true);
    expect(actions.undo()).toBe(true);
    expect(getSnapshot().game.lostDismissed).toBe(true);
    actions.draw();
    expect(getSnapshot().game.lostDismissed).toBe(true);
    actions.newGame(5);
    expect(getSnapshot().game.lostDismissed).toBeUndefined();
  });

  it("an abandoned game breaks the winning streak", () => {
    actions.draw();
    actions.newGame(8);
    expect(getSnapshot().stats.streak).toBe(0);
    expect(getSnapshot().stats.played).toBe(1);
  });

  it("the clock re-renders the page only when the timer is on screen", () => {
    let calls = 0;
    const off = subscribe(() => calls++);
    actions.tick(1000);
    expect(calls).toBe(0); // not started: the clock does not run
    actions.draw();
    calls = 0;
    actions.tick(1000);
    expect(calls).toBe(1);
    expect(getSnapshot().game.elapsedMs).toBe(1000);
    actions.updateSettings({ timed: false });
    actions.newGame(42);
    actions.draw();
    calls = 0;
    actions.tick(1000);
    actions.tick(1000);
    expect(calls).toBe(0);
    // Still counted (and saved) for the best time.
    expect(getSnapshot().game.elapsedMs).toBe(2000);
    off();
  });

  it("a tap that fits nowhere leaves the game unchanged", () => {
    const g = getSnapshot().game;
    for (let col = 0; col < 7; col++) {
      const before = getSnapshot().game;
      const moved = actions.tap({ kind: "tableau", index: col });
      if (!moved) expect(getSnapshot().game).toBe(before);
    }
    expect(g.seed).toBe(42);
  });
});

describe("stats", () => {
  it("records wins, streaks, best score and time", () => {
    const g = newGame(1);
    const started = { ...g, started: true };
    let s = updateStats(EMPTY_STATS, g, started);
    expect(s.played).toBe(1);
    s = updateStats(s, started, { ...started, won: true, score: 900, elapsedMs: 120_000 });
    expect(s).toMatchObject({ won: 1, streak: 1, bestStreak: 1, bestScore: 900, bestTimeMs: 120_000 });
    s = updateStats(s, started, { ...started, won: true, score: 500, elapsedMs: 90_000 });
    expect(s).toMatchObject({ won: 2, streak: 2, bestScore: 900, bestTimeMs: 90_000 });
  });

  it("wiping the stats during a started game, then winning it: never more won than played", () => {
    const g = newGame(1);
    const started = { ...g, started: true };
    expect(clearedStats(g)).toEqual(EMPTY_STATS);
    expect(clearedStats(started)).toEqual({ ...EMPTY_STATS, played: 1 });
    expect(clearedStats({ ...started, won: true })).toEqual(EMPTY_STATS);
    // The win of that game after the wipe: 1 of 1.
    const s = updateStats(clearedStats(started), started, { ...started, won: true, score: 100, elapsedMs: 60_000 });
    expect(s).toMatchObject({ played: 1, won: 1 });
    // Even from stats that lost the played count somehow, a win never leaves won > played.
    expect(updateStats(EMPTY_STATS, started, { ...started, won: true })).toMatchObject({ played: 1, won: 1 });
  });

  it("reads back stored settings and stats defensively", () => {
    expect(parseSettings(null)).toEqual({ drawCount: 1, scoring: "standard", timed: true, kingOnly: false, back: "blue", zoom: 1 });
    expect(parseSettings({ drawCount: 3, scoring: "vegas", timed: false, back: "red" })).toEqual({
      drawCount: 3,
      scoring: "vegas",
      timed: false,
      kingOnly: false,
      back: "red",
      zoom: 1,
    });
    // "Zoom in": 1x when missing (older saves) or unknown, otherwise what the phone kept.
    expect(parseSettings({ zoom: 0 }).zoom).toBe(0);
    expect(parseSettings({ zoom: 2 }).zoom).toBe(2);
    expect(parseSettings({ zoom: 5 }).zoom).toBe(1);
    expect(parseSettings({ zoom: "2" }).zoom).toBe(1);
    expect(parseSettings({ drawCount: 7, scoring: "x", back: "pink" })).toMatchObject({ drawCount: 1, scoring: "standard", back: "blue" });
    expect(parseStats({ played: -3, won: "x", bestScore: 12 })).toMatchObject({ played: 0, won: 0, bestScore: 12, bestTimeMs: null });
  });
});
