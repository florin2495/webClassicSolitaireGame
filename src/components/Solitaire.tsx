"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { backUrl, cardLabel, faceUrl } from "@/lib/cards";
import { formatTime } from "@/lib/format";
import { cardPositions, computeLayout, dropTarget, pilePosition, type Layout } from "@/lib/layout";
import { canInstall, canInstallServer, promptInstall, subscribeInstall } from "@/lib/pwa";
import { canAutoComplete, canRecycle, findHint, pickCards, samePile, type GameState, type Hint, type Pile } from "@/lib/solitaire";
import { actions, getServerSnapshot, getSnapshot, subscribe } from "@/lib/store";
import { outlook, positionKey, type Outlook } from "@/lib/stuck";
import { Menu } from "./Menu";
import { UpdateButton } from "./UpdateButton";
import { WinCascade, type Launch } from "./WinCascade";
import { btnPrimary, btnSecondary, Modal } from "./ui";

type Pending =
  | { kind: "stock"; id: number; x: number; y: number }
  | { kind: "cards"; id: number; x: number; y: number; from: Pile; index: number | undefined; cards: number[]; moved: boolean };

const pileKey = (p: Pile) => (p.kind === "foundation" ? `f${p.index}` : p.kind === "tableau" ? `t${p.index}` : p.kind);

/** Pile of every card (by card number), to see which cards an action moved. */
function pileKeys(g: GameState): string[] {
  const k: string[] = new Array(52);
  g.stock.forEach((c) => (k[c] = "s"));
  g.waste.forEach((c) => (k[c] = "w"));
  g.foundations.forEach((f, i) => f.forEach((c) => (k[c] = `f${i}`)));
  g.tableau.forEach((col, i) => col.cards.forEach((c) => (k[c] = `t${i}`)));
  return k;
}

/** Launch order of the win animation: kings first, one foundation after the other. */
function launchesOf(g: GameState, l: Layout): Launch[] {
  const out: Launch[] = [];
  for (let r = 12; r >= 0; r--) {
    g.foundations.forEach((f, i) => {
      if (f[r] !== undefined) out.push({ card: f[r], x: l.colX[3 + i], y: l.topY });
    });
  }
  return out;
}

export function Solitaire() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const installable = useSyncExternalStore(subscribeInstall, canInstall, canInstallServer);
  const boardRef = useRef<HTMLDivElement>(null);
  const pending = useRef<Pending | null>(null);
  const liftTimer = useRef<number | undefined>(undefined);
  const hintTimer = useRef<number | undefined>(undefined);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [drag, setDrag] = useState<{ cards: number[]; dx: number; dy: number } | null>(null);
  const [lifted, setLifted] = useState<number[]>([]);
  const [shake, setShake] = useState<number | null>(null);
  const [hint, setHint] = useState<Hint | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmNew, setConfirmNew] = useState(false);
  const [launched, setLaunched] = useState<number[]>([]);

  const game = snap?.game ?? null;
  const layout = useMemo(() => (size ? computeLayout(size.w, size.h) : null), [size]);
  const positions = useMemo(() => (game && layout ? cardPositions(game, layout) : null), [game, layout]);
  const celebrating = !!game && game.won && !game.celebrated;
  const launches = useMemo(() => (game && layout && celebrating ? launchesOf(game, layout) : []), [game, layout, celebrating]);
  // Game lost (proven by src/lib/stuck.ts, checked when the hint has nothing better than "deal a card").
  // Keyed on the position, not on the game object: the clock makes a new game object every second.
  const posKey = useMemo(() => (game ? positionKey(game) : null), [game]);
  const [lostCheck, setLostCheck] = useState<{ key: string; outlook: Outlook } | null>(null);
  const lost = !!game && !game.won && posKey !== null && lostCheck?.key === posKey && lostCheck.outlook === "lost";

  // Board size.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (s && s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Clock: runs while the game is started, not won and the app is on screen.
  const running = !!game && game.started && !game.won;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      if (document.visibilityState === "visible") actions.tick(now - last);
      last = now;
    }, 1000);
    const onVisible = () => {
      last = performance.now();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [running]);

  /** Run a store action; the cards it moved are drawn on top while they slide. */
  function run(action: () => boolean): boolean {
    const before = getSnapshot().game;
    const ok = action();
    if (!ok) return false;
    const a = pileKeys(before);
    const b = pileKeys(getSnapshot().game);
    const moved: number[] = [];
    for (let c = 0; c < 52; c++) if (a[c] !== b[c]) moved.push(c);
    setLifted(moved);
    window.clearTimeout(liftTimer.current);
    liftTimer.current = window.setTimeout(() => setLifted([]), 260);
    setHint(null);
    return true;
  }

  function flash(message: string) {
    setToast(message);
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => {
      setToast(null);
      setHint(null);
    }, 2600);
  }

  function showHint() {
    const { game: g, canUndo } = getSnapshot();
    if (g.won) return;
    // "Înapoi" only when there is something to undo (the history is not kept across a reload).
    const way = canUndo ? "Încearcă „Înapoi” sau un joc nou." : "Începe un joc nou.";
    if (lost) {
      setHint(null);
      flash(`Jocul nu mai poate fi câștigat: nicio mutare nu mai ajută. ${way}`);
      return;
    }
    const h = findHint(g);
    if (!h) {
      setHint(null);
      flash(`Nu mai sunt mutări. ${way}`);
      return;
    }
    setHint(h);
    flash(h.from.kind === "stock" ? "Întoarce o carte din pachet." : "Mută cartea marcată.");
  }

  function askNewGame() {
    const g = getSnapshot().game;
    if (g.started && !g.won) setConfirmNew(true);
    else startNewGame();
  }

  function startNewGame() {
    setConfirmNew(false);
    setMenuOpen(false);
    setHint(null);
    setLaunched([]);
    actions.newGame();
  }

  // Auto-complete: once every card is face up and the stock is empty, the cards go up by themselves.
  const autoComplete = !!game && canAutoComplete(game);
  useEffect(() => {
    if (!autoComplete) return;
    const id = window.setTimeout(() => run(() => actions.autoStep()), 130);
    return () => window.clearTimeout(id);
  }, [autoComplete, game]);

  // Lost? Only worth the search when the hint has no real move; a moment after the move, so the board updates first.
  // Runs once per position: a clock tick changes the game object but not `posKey`.
  useEffect(() => {
    if (posKey === null || autoComplete || lostCheck?.key === posKey) return;
    const g = getSnapshot().game;
    if (g.won) return;
    const h = findHint(g);
    if (h && h.from.kind !== "stock") return;
    // A move before the timeout changes posKey and cancels it, so the game read then is still this position.
    const id = window.setTimeout(() => setLostCheck({ key: posKey, outlook: outlook(getSnapshot().game) }), 200);
    return () => window.clearTimeout(id);
  }, [posKey, autoComplete, lostCheck]);

  // Keyboard (desktop): Ctrl+Z undo, F2 new game, H hint.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, [role=dialog]")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        run(() => actions.undo());
      } else if (e.key === "F2") {
        e.preventDefault();
        askNewGame();
      } else if (e.key.toLowerCase() === "h") {
        showHint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!game || !positions || game.won) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const target = e.target as HTMLElement;
    const cardEl = target.closest<HTMLElement>("[data-card]");
    const slotEl = target.closest<HTMLElement>("[data-slot]");
    let next: Pending | null = null;
    if (cardEl) {
      const card = Number(cardEl.dataset.card);
      const p = positions.get(card);
      if (!p) return;
      if (p.pile.kind === "stock") {
        next = { kind: "stock", id: e.pointerId, x: e.clientX, y: e.clientY };
      } else {
        const index = p.pile.kind === "tableau" ? p.index : undefined;
        const cards = pickCards(game, p.pile, index);
        if (!cards || cards[0] !== card) return;
        next = { kind: "cards", id: e.pointerId, x: e.clientX, y: e.clientY, from: p.pile, index, cards, moved: false };
      }
    } else if (slotEl?.dataset.slot === "stock") {
      next = { kind: "stock", id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (!next) return;
    pending.current = next;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // not supported: moves still arrive while the pointer is over the board
    }
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pending.current;
    if (!p || p.id !== e.pointerId || p.kind !== "cards") return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (!p.moved && Math.hypot(dx, dy) < 8) return;
    p.moved = true;
    setDrag({ cards: p.cards, dx, dy });
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const p = pending.current;
    if (!p || p.id !== e.pointerId) return;
    pending.current = null;
    if (p.kind === "stock") {
      run(() => actions.draw());
      return;
    }
    if (!p.moved) {
      if (!run(() => actions.tap(p.from, p.index))) {
        setShake(p.cards[0]);
        window.setTimeout(() => setShake(null), 520);
      }
      return;
    }
    setDrag(null);
    if (!layout || !positions) return;
    const first = positions.get(p.cards[0]);
    if (!first) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    const tryDrop = (to: Pile | null) => !!to && !samePile(to, p.from) && run(() => actions.move(p.from, p.index, to));
    if (tryDrop(dropTarget(layout, first.x + dx, first.y + dy))) return;
    // Fall back to the pile under the finger.
    const rect = e.currentTarget.getBoundingClientRect();
    tryDrop(dropTarget(layout, e.clientX - rect.left - layout.cardW / 2, e.clientY - rect.top - layout.cardH / 2));
  }

  function onPointerCancel() {
    pending.current = null;
    setDrag(null);
  }

  const settings = snap?.settings;
  const hintCards = new Set<number>();
  let hintSlot: string | null = null;
  if (hint && game) {
    if (hint.from.kind === "stock") hintSlot = "stock";
    else (pickCards(game, hint.from, hint.index) ?? []).forEach((c) => hintCards.add(c));
    if (hint.from.kind === "stock" && game.stock.length > 0) hintCards.add(game.stock[game.stock.length - 1]);
    const t = hint.to;
    if (t.kind === "foundation" || t.kind === "tableau") {
      const dest = t.kind === "foundation" ? game.foundations[t.index] : game.tableau[t.index].cards;
      if (dest.length > 0) hintCards.add(dest[dest.length - 1]);
      else hintSlot = pileKey(t);
    }
  }

  return (
    <div className="flex h-full flex-col" style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}>
      <header
        className="flex min-h-11 shrink-0 items-center gap-3 bg-black/25 px-3 text-sm"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <span className="font-bold tracking-wide">Classic Solitaire</span>
        <span className="flex-1" />
        {game && game.options.scoring !== "none" && (
          <span className="tabular-nums" data-testid="score">
            Scor: <b>{game.score}</b>
          </span>
        )}
        {game && game.options.timed && (
          <span className="tabular-nums" data-testid="time">
            Timp: <b>{formatTime(game.elapsedMs)}</b>
          </span>
        )}
      </header>

      {/* Update / install buttons get their own strip (the board shrinks), so they never cover cards. */}
      <div className="flex shrink-0 flex-wrap justify-center gap-2 px-2 py-1.5 empty:hidden">
        <UpdateButton />
        {installable && (
          <button
            type="button"
            data-testid="install"
            onClick={() => void promptInstall()}
            className="flex min-h-9 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-bold text-green-900 shadow-md"
          >
            📲 Instalează pe telefon
          </button>
        )}
      </div>

      {toast && (
        <div
          className="pointer-events-none fixed inset-x-0 z-[5600] flex justify-center px-3"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 4.5rem)" }}
        >
          <p role="status" data-testid="toast" className="rounded-full bg-black/80 px-4 py-2 text-center text-sm font-semibold">
            {toast}
          </p>
        </div>
      )}

      <main
        ref={boardRef}
        data-testid="board"
        className="relative min-h-0 flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
      >
        {layout && game && positions && settings && (
          <>
            <Slot
              l={layout}
              pile={{ kind: "stock" }}
              testId="stock-slot"
              hint={hintSlot === "stock"}
              label={game.stock.length === 0 ? (canRecycle(game) ? "Întoarce pachetul" : "Pachet terminat") : undefined}
            >
              {game.stock.length === 0 && (
                <span style={{ fontSize: layout.cardW * 0.5 }} aria-hidden>
                  {canRecycle(game) ? "↻" : "✕"}
                </span>
              )}
            </Slot>
            {[0, 1, 2, 3].map((i) => (
              <Slot key={`f${i}`} l={layout} pile={{ kind: "foundation", index: i }} hint={hintSlot === `f${i}`}>
                <span style={{ fontSize: layout.cardW * 0.42 }} className="font-bold opacity-50" aria-hidden>
                  A
                </span>
              </Slot>
            ))}
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <Slot key={`t${i}`} l={layout} pile={{ kind: "tableau", index: i }} hint={hintSlot === `t${i}`} />
            ))}

            {Array.from({ length: 52 }, (_, c) => {
              const p = positions.get(c);
              if (!p) return null;
              const dragging = drag?.cards.includes(c) ?? false;
              const x = p.x + (dragging && drag ? drag.dx : 0);
              const y = p.y + (dragging && drag ? drag.dy : 0);
              const z = p.z + (dragging ? 3000 : lifted.includes(c) ? 1000 : 0);
              const classes = ["card", dragging && "dragging", hintCards.has(c) && "hint", shake === c && "shake"].filter(Boolean).join(" ");
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={c}
                  src={p.faceUp ? faceUrl(c) : backUrl(settings.back)}
                  alt={p.faceUp ? cardLabel(c) : "carte cu fața în jos"}
                  draggable={false}
                  data-card={c}
                  data-pile={pileKey(p.pile)}
                  data-index={p.index}
                  data-up={p.faceUp ? "1" : "0"}
                  className={classes}
                  style={{
                    width: layout.cardW,
                    height: layout.cardH,
                    transform: `translate3d(${x}px, ${y}px, 0)`,
                    zIndex: z,
                    visibility: launched.includes(c) ? "hidden" : undefined,
                  }}
                />
              );
            })}
            {celebrating && (
              <WinCascade
                launches={launches}
                cardW={layout.cardW}
                cardH={layout.cardH}
                onLaunch={(card) => setLaunched((l) => [...l, card])}
                onDone={() => {
                  setLaunched([]);
                  actions.markCelebrated();
                }}
              />
            )}
          </>
        )}
      </main>

      <nav
        className="grid shrink-0 grid-cols-4 gap-1.5 bg-black/25 px-2 pt-1.5"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
      >
        <BarButton testId="new-game" icon="🃏" label="Joc nou" onClick={askNewGame} />
        <BarButton testId="undo" icon="↶" label="Înapoi" onClick={() => run(() => actions.undo())} disabled={!snap?.canUndo} />
        <BarButton testId="hint" icon="💡" label="Indiciu" onClick={showHint} disabled={!game || game.won} />
        <BarButton testId="menu-open" icon="☰" label="Meniu" onClick={() => setMenuOpen(true)} />
      </nav>

      {menuOpen && snap && game && (
        <Menu
          settings={snap.settings}
          stats={snap.stats}
          gameOptions={game.options}
          gameStarted={game.started && !game.won}
          onClose={() => setMenuOpen(false)}
          onNewGame={startNewGame}
        />
      )}

      {confirmNew && (
        <Modal title="Joc nou?" onClose={() => setConfirmNew(false)} testId="confirm-new">
          <p className="mb-4">Jocul de acum nu e terminat. Dacă începi altul, el se pierde.</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btnSecondary} onClick={() => setConfirmNew(false)}>
              Continuă jocul
            </button>
            <button type="button" className={btnPrimary} onClick={startNewGame} data-testid="confirm-new-yes">
              Joc nou
            </button>
          </div>
        </Modal>
      )}

      {game && lost && !game.lostDismissed && !menuOpen && !confirmNew && (
        <Modal title="Nu mai sunt mutări" onClose={() => actions.dismissLost()} testId="lost-dialog">
          <p className="mb-4">
            Am încercat toate mutările posibile, cu toate cărțile din pachet: niciuna nu mai urcă o carte sus și nici nu
            mai întoarce o carte. Jocul acesta nu mai poate fi câștigat.
            {snap?.canUndo && " Poți să te întorci cu „Înapoi” sau să începi un joc nou."}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={btnSecondary} onClick={() => actions.dismissLost()} data-testid="lost-close">
              Mă mai uit
            </button>
            <button type="button" className={btnPrimary} onClick={startNewGame} data-testid="lost-new-game">
              Joc nou
            </button>
          </div>
        </Modal>
      )}

      {game && game.won && game.celebrated && snap && (
        <Modal title="Felicitări! 🎉" onClose={startNewGame} testId="win-dialog">
          <p className="mb-1 text-lg font-semibold">Ai câștigat!</p>
          <dl className="mb-4 grid grid-cols-2 gap-y-1 text-sm">
            {game.options.scoring !== "none" && (
              <>
                <dt>Scor</dt>
                <dd className="text-right font-semibold" data-testid="win-score">
                  {game.score}
                </dd>
              </>
            )}
            {game.bonus > 0 && (
              <>
                <dt>din care bonus de timp</dt>
                <dd className="text-right font-semibold">{game.bonus}</dd>
              </>
            )}
            <dt>Timp</dt>
            <dd className="text-right font-semibold">{formatTime(game.elapsedMs)}</dd>
            <dt>Mutări</dt>
            <dd className="text-right font-semibold">{game.moves}</dd>
            <dt>Câștigate până acum</dt>
            <dd className="text-right font-semibold">
              {snap.stats.won} din {snap.stats.played}
            </dd>
          </dl>
          <button type="button" className={`${btnPrimary} w-full`} onClick={startNewGame} data-testid="win-new-game">
            Joc nou
          </button>
        </Modal>
      )}
    </div>
  );
}

function Slot({
  l,
  pile,
  hint,
  testId,
  label,
  children,
}: {
  l: Layout;
  pile: Pile;
  hint?: boolean;
  testId?: string;
  label?: string;
  children?: ReactNode;
}) {
  const { x, y } = pilePosition(l, pile);
  return (
    <div
      className={`slot${hint ? " hint" : ""}`}
      data-slot={pileKey(pile)}
      data-testid={testId}
      aria-label={label}
      role={pile.kind === "stock" ? "button" : undefined}
      style={{ width: l.cardW, height: l.cardH, transform: `translate(${x}px, ${y}px)` }}
    >
      {children}
    </div>
  );
}

function BarButton({
  icon,
  label,
  onClick,
  disabled,
  testId,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  testId: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-12 flex-col items-center justify-center rounded-xl bg-white/10 px-1 text-xs font-semibold leading-tight active:bg-white/25 disabled:opacity-40"
    >
      <span className="text-xl leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </button>
  );
}
