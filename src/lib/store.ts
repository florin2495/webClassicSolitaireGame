// Client-side game store for useSyncExternalStore: the current game, undo history, settings and statistics.
// Everything is kept in localStorage, so closing the app (or reloading for an update) never loses a game.
import { isBackId, type BackId } from "./cards";
import {
  autoStep,
  draw,
  isValidGame,
  move,
  newGame,
  randomSeed,
  tick,
  autoTarget,
  type GameState,
  type Options,
  type Pile,
} from "./solitaire";

export interface Settings extends Options {
  kingOnly: boolean;
  back: BackId;
}

export interface Stats {
  played: number;
  won: number;
  bestScore: number | null;
  bestTimeMs: number | null;
  streak: number;
  bestStreak: number;
}

export interface Snapshot {
  game: GameState;
  settings: Settings;
  stats: Stats;
  canUndo: boolean;
}

export const KEY_GAME = "solitaire:game:v1";
export const KEY_SETTINGS = "solitaire:settings:v1";
export const KEY_STATS = "solitaire:stats:v1";
const HISTORY_MAX = 500;

export const DEFAULT_SETTINGS: Settings = { drawCount: 1, scoring: "standard", timed: true, kingOnly: false, back: "blue" };
export const EMPTY_STATS: Stats = { played: 0, won: 0, bestScore: null, bestTimeMs: null, streak: 0, bestStreak: 0 };

let snap: Snapshot | null = null;
let history: GameState[] = [];
const listeners = new Set<() => void>();

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full or blocked: the game keeps running in memory
  }
}

export function parseSettings(x: unknown): Settings {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Settings>;
  return {
    drawCount: o.drawCount === 3 ? 3 : 1,
    scoring: o.scoring === "vegas" || o.scoring === "none" ? o.scoring : "standard",
    timed: o.timed !== false,
    kingOnly: o.kingOnly === true,
    back: isBackId(o.back) ? o.back : DEFAULT_SETTINGS.back,
  };
}

export function parseStats(x: unknown): Stats {
  const o = (x && typeof x === "object" ? x : {}) as Partial<Stats>;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
  const opt = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    played: n(o.played),
    won: n(o.won),
    bestScore: opt(o.bestScore),
    bestTimeMs: opt(o.bestTimeMs),
    streak: n(o.streak),
    bestStreak: n(o.bestStreak),
  };
}

const optionsOf = (s: Settings): Options => ({ drawCount: s.drawCount, scoring: s.scoring, timed: s.timed, kingOnly: s.kingOnly });

/** `?seed=123` (and optionally `&draw=3`) deals a fixed game: used by the end-to-end tests. */
function seedFromUrl(): { seed: number; draw?: 1 | 3 } | null {
  try {
    const q = new URLSearchParams(window.location.search);
    const seed = Number(q.get("seed"));
    if (!Number.isInteger(seed) || seed <= 0) return null;
    const d = q.get("draw");
    q.delete("seed");
    q.delete("draw");
    const rest = q.toString();
    window.history.replaceState(null, "", window.location.pathname + (rest ? `?${rest}` : "") + window.location.hash);
    return { seed, draw: d === "3" ? 3 : d === "1" ? 1 : undefined };
  } catch {
    return null;
  }
}

function load(): Snapshot {
  let settings = parseSettings(readJson(KEY_SETTINGS));
  const stats = parseStats(readJson(KEY_STATS));
  const fixed = seedFromUrl();
  if (fixed?.draw) settings = { ...settings, drawCount: fixed.draw };
  const saved = readJson(KEY_GAME);
  const game = fixed ? newGame(fixed.seed, optionsOf(settings)) : isValidGame(saved) ? saved : newGame(randomSeed(), optionsOf(settings));
  const next = { game, settings, stats, canUndo: false };
  writeJson(KEY_GAME, game);
  writeJson(KEY_SETTINGS, settings);
  return next;
}

export function getSnapshot(): Snapshot {
  if (!snap) snap = load();
  return snap;
}

export function getServerSnapshot(): Snapshot | null {
  return null;
}

export function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** `notify` false: saved and returned by the next getSnapshot(), but nothing on screen needs to change now. */
function commit(next: Snapshot, saveGame = true, notify = true) {
  const prev = snap;
  snap = next;
  if (saveGame) writeJson(KEY_GAME, next.game);
  if (prev?.settings !== next.settings) writeJson(KEY_SETTINGS, next.settings);
  if (prev?.stats !== next.stats) writeJson(KEY_STATS, next.stats);
  if (notify) listeners.forEach((l) => l());
}

/** Statistics after the game went from `prev` to `next`. */
export function updateStats(stats: Stats, prev: GameState, next: GameState): Stats {
  let s = stats;
  if (!prev.started && next.started) s = { ...s, played: s.played + 1 };
  if (!prev.won && next.won) {
    const streak = s.streak + 1;
    s = {
      ...s,
      won: s.won + 1,
      streak,
      bestStreak: Math.max(s.bestStreak, streak),
      bestScore: next.options.scoring === "none" ? s.bestScore : Math.max(s.bestScore ?? -Infinity, next.score),
      bestTimeMs: s.bestTimeMs === null ? next.elapsedMs : Math.min(s.bestTimeMs, next.elapsedMs),
    };
  }
  return s;
}

/** Apply a new game state as a player move (undoable). */
function apply(next: GameState | null): boolean {
  if (!next) return false;
  const cur = getSnapshot();
  history.push(cur.game);
  if (history.length > HISTORY_MAX) history = history.slice(-HISTORY_MAX);
  commit({ ...cur, game: next, stats: updateStats(cur.stats, cur.game, next), canUndo: !next.won });
  return true;
}

export const actions = {
  draw(): boolean {
    return apply(draw(getSnapshot().game));
  },
  move(from: Pile, index: number | undefined, to: Pile): boolean {
    return apply(move(getSnapshot().game, from, index, to));
  },
  /** Tap on a card: send it where it fits best (foundation first). */
  tap(from: Pile, index?: number): boolean {
    const g = getSnapshot().game;
    const to = autoTarget(g, from, index);
    return to ? apply(move(g, from, index, to)) : false;
  },
  autoStep(): boolean {
    return apply(autoStep(getSnapshot().game));
  },
  undo(): boolean {
    const cur = getSnapshot();
    const prev = history.pop();
    if (!prev || cur.game.won) return false;
    // The clock keeps running: undo restores the cards and the score, not the time.
    commit({ ...cur, game: { ...prev, elapsedMs: cur.game.elapsedMs, started: true }, canUndo: history.length > 0 });
    return true;
  },
  tick(ms: number) {
    const cur = getSnapshot();
    const game = tick(cur.game, ms);
    // Without the timer the clock is not on screen (it still counts, for the best time): no re-render every second.
    if (game !== cur.game) commit({ ...cur, game }, true, game.options.timed);
  },
  newGame(seed: number = randomSeed()) {
    const cur = getSnapshot();
    // Leaving a started, unfinished game breaks the winning streak.
    const stats = cur.game.started && !cur.game.won ? { ...cur.stats, streak: 0 } : cur.stats;
    history = [];
    commit({ ...cur, stats, game: newGame(seed, optionsOf(cur.settings)), canUndo: false });
  },
  /** Draw/scoring/timer changes apply to the next deal (right away when no card has moved yet).
   *  The empty-column rule applies at once, also to the undo history (an undo must not bring the old rule back). */
  updateSettings(patch: Partial<Settings>) {
    let cur = getSnapshot();
    const settings = parseSettings({ ...cur.settings, ...patch });
    const ruleChanged = settings.kingOnly !== (cur.game.options.kingOnly === true);
    if (ruleChanged) {
      const withRule = (g: GameState): GameState => ({ ...g, options: { ...g.options, kingOnly: settings.kingOnly } });
      history = history.map(withRule);
      cur = { ...cur, game: withRule(cur.game) };
    }
    const rules = settings.drawCount !== cur.settings.drawCount || settings.scoring !== cur.settings.scoring || settings.timed !== cur.settings.timed;
    if (rules && !cur.game.started) {
      history = [];
      commit({ ...cur, settings, game: newGame(cur.game.seed, optionsOf(settings)), canUndo: false });
    } else {
      commit({ ...cur, settings }, ruleChanged);
    }
  },
  markCelebrated() {
    const cur = getSnapshot();
    if (cur.game.won && !cur.game.celebrated) commit({ ...cur, game: { ...cur.game, celebrated: true } });
  },
  resetStats() {
    const cur = getSnapshot();
    commit({ ...cur, stats: { ...EMPTY_STATS } }, false);
  },
};
