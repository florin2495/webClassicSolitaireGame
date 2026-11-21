import { expect, type Page } from "@playwright/test";
import { cardOf, locate, newGame, SUITS, type GameState, type Options, type Pile } from "../../src/lib/solitaire";

export const BASE = (process.env.E2E_BASE_URL ?? "https://games.hailatat.icu/classicsolitaire").replace(/\/+$/, "");
export const KEY_GAME = "solitaire:game:v1";
export const STD: Options = { drawCount: 1, scoring: "standard", timed: true };

export const pileKey = (p: Pile) => (p.kind === "foundation" ? `f${p.index}` : p.kind === "tableau" ? `t${p.index}` : p.kind);

/** "pile:index:faceUp" for every card, as the engine sees it. */
export function expectedBoard(g: GameState): Record<number, string> {
  const out: Record<number, string> = {};
  for (let c = 0; c < 52; c++) {
    const l = locate(g, c)!;
    out[c] = `${pileKey(l.pile)}:${l.index}:${l.faceUp ? 1 : 0}`;
  }
  return out;
}

/** The same, read from the page (data-* attributes of the card images). */
export async function uiBoard(page: Page): Promise<Record<number, string>> {
  const rows = await page
    .locator("[data-card]")
    .evaluateAll((els) => els.map((e) => [Number((e as HTMLElement).dataset.card), `${(e as HTMLElement).dataset.pile}:${(e as HTMLElement).dataset.index}:${(e as HTMLElement).dataset.up}`] as const));
  return Object.fromEntries(rows);
}

export async function expectBoard(page: Page, g: GameState) {
  await expect.poll(() => uiBoard(page), { timeout: 5000 }).toEqual(expectedBoard(g));
}

/** Open a fixed deal (fresh browser context = empty storage). */
export async function openSeed(page: Page, seed: number, draw: 1 | 3 = 1) {
  await page.goto(`${BASE}?seed=${seed}&draw=${draw}`);
  await expect(page.locator("[data-card]")).toHaveCount(52);
}

/** Put a saved game in storage and reload, as if the player had left it there. */
export async function loadState(page: Page, g: GameState) {
  await page.goto(BASE);
  await expect(page.locator("[data-card]")).toHaveCount(52);
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY_GAME, JSON.stringify(g)] as const);
  await page.reload();
  await expect(page.locator("[data-card]")).toHaveCount(52);
}

/** Tap / click a card on its top strip (the only part of a covered tableau card that shows). */
export async function hitCard(page: Page, card: number, touch: boolean) {
  const el = page.locator(`[data-card="${card}"]`);
  const box = (await el.boundingBox())!;
  const position = { x: box.width / 2, y: Math.min(6, box.height / 4) };
  if (touch) await el.tap({ position });
  else await el.click({ position });
}

/** Click the top card of the stock. The images are in card-number order, so `.last()` is usually a covered card. */
export async function clickStockTop(page: Page) {
  const n = await page.locator('[data-pile="stock"]').count();
  await page.locator(`[data-pile="stock"][data-index="${n - 1}"]`).click({ position: { x: 10, y: 5 } });
}

export async function hitStock(page: Page, g: GameState, touch: boolean) {
  if (g.stock.length > 0) return hitCard(page, g.stock[g.stock.length - 1], touch);
  const slot = page.getByTestId("stock-slot");
  if (touch) await slot.tap();
  else await slot.click();
}

/** Every king on its own column, everything else on the foundations: the auto-finish wins it. */
export function nearWin(): GameState {
  const g = newGame(1, STD);
  return {
    ...g,
    stock: [],
    waste: [],
    foundations: SUITS.map((s) => Array.from({ length: 12 }, (_, i) => cardOf(s, i + 1))),
    tableau: [
      ...SUITS.map((s) => ({ cards: [cardOf(s, 13)], hidden: 0 })),
      { cards: [], hidden: 0 },
      { cards: [], hidden: 0 },
      { cards: [], hidden: 0 },
    ],
    elapsedMs: 60_000,
  };
}

/** No horizontal scroll and nothing sticking out of the viewport sideways. */
export async function expectNoHorizontalScroll(page: Page) {
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
}
