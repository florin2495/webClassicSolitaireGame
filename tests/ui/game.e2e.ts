import { expect, test } from "@playwright/test";
import { autoTarget, canAutoComplete, draw, findHint, move, newGame, type GameState } from "../../src/lib/solitaire";
import { deadEndBoard, rescueBoard } from "../../src/lib/test-boards";
import { expectBoard, hitCard, hitStock, loadState, nearWin, openSeed, STD } from "./helpers";

const SEED = 20261121;

test.describe("Classic Solitaire", () => {
  test("plays a fixed deal by taps exactly like the rules engine, undoes, and keeps the game after a reload", async ({ page }, info) => {
    const touch = info.project.name === "android-chromium";
    await openSeed(page, SEED);
    let g: GameState = newGame(SEED, STD);
    await expectBoard(page, g);
    await expect(page.getByTestId("undo")).toBeDisabled();

    // Follow the hints, the way a player would tap: the page must end up exactly where the engine does.
    const history: GameState[] = [];
    for (let step = 0; step < 30 && !g.won && !canAutoComplete(g); step++) {
      const h = findHint(g);
      if (!h) break;
      history.push(g);
      if (h.from.kind === "stock") {
        await hitStock(page, g, touch);
        g = draw(g)!;
      } else {
        const index = h.from.kind === "tableau" ? h.index : undefined;
        const col = h.from.kind === "tableau" ? g.tableau[h.from.index].cards : h.from.kind === "waste" ? g.waste : [];
        const card = index !== undefined ? col[index] : col[col.length - 1];
        await hitCard(page, card, touch);
        const to = autoTarget(g, h.from, index)!;
        g = move(g, h.from, index, to)!;
      }
      await expectBoard(page, g);
    }
    expect(history.length).toBeGreaterThan(5);
    await expect(page.getByTestId("score")).toBeVisible();
    await expect(page.getByTestId("time")).toContainText(/\d:\d\d/);

    // Undo twice.
    await page.getByTestId("undo").click();
    await page.getByTestId("undo").click();
    g = history[history.length - 2];
    await expectBoard(page, g);

    // Closing / reloading the app keeps the game.
    await page.reload();
    await expect(page.locator("[data-card]")).toHaveCount(52);
    await expectBoard(page, g);
  });

  test("two quick taps on the stock deal two cards (the card still sliding does not catch the second tap)", async ({ page }, info) => {
    const touch = info.project.name === "android-chromium";
    await openSeed(page, SEED);
    const g = newGame(SEED, STD);
    const box = (await page.locator(`[data-card="${g.stock[g.stock.length - 1]}"]`).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    for (let i = 0; i < 2; i++) {
      if (touch) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
    }
    await expectBoard(page, draw(draw(g)!)!);
  });

  test("a tap on a card that fits nowhere leaves everything in place", async ({ page }, info) => {
    const touch = info.project.name === "android-chromium";
    await openSeed(page, SEED);
    const g = newGame(SEED, STD);
    // Find a face-up column card with no legal target.
    const col = g.tableau.findIndex((_, i) => autoTarget(g, { kind: "tableau", index: i }) === null);
    test.skip(col < 0, "every top card of this deal can move");
    const card = g.tableau[col].cards[g.tableau[col].cards.length - 1];
    await hitCard(page, card, touch);
    await expectBoard(page, g);
  });

  test("empty column: any card by default, only a king after switching the menu setting", async ({ page }, info) => {
    const touch = info.project.name === "android-chromium";
    // A fresh deal with column 0 emptied (its card goes under the stock, so all 52 cards stay in play).
    const d = newGame(SEED, STD);
    const g: GameState = {
      ...d,
      stock: [d.tableau[0].cards[0], ...d.stock],
      tableau: [{ cards: [], hidden: 0 }, ...d.tableau.slice(1)],
    };
    const T0 = { kind: "tableau", index: 0 } as const;
    // A column whose top card the engine sends to the empty column (not a king, so the rule matters).
    const col = [1, 2, 3, 4, 5, 6].find((c) => {
      const cards = g.tableau[c].cards;
      const t = autoTarget(g, { kind: "tableau", index: c });
      return t?.kind === "tableau" && t.index === 0 && cards[cards.length - 1] % 13 !== 12;
    });
    test.skip(col === undefined, "no top card of this deal goes to the empty column");
    const from = { kind: "tableau", index: col! } as const;
    const card = g.tableau[col!].cards[g.tableau[col!].cards.length - 1];
    await loadState(page, g);

    await hitCard(page, card, touch);
    await expectBoard(page, move(g, from, g.tableau[col!].cards.length - 1, T0)!);

    await page.getByTestId("undo").click();
    await expectBoard(page, g);
    await page.getByTestId("menu-open").click();
    await page.getByTestId("setting-empty").getByRole("button", { name: "Doar Popa (K)" }).click();
    await page.getByRole("button", { name: "Închide" }).click();
    // Nothing else fitted that card (that is why it went to the empty column), so now it stays put.
    expect(autoTarget({ ...g, options: { ...g.options, kingOnly: true } }, from)).toBeNull();
    await hitCard(page, card, touch);
    await expectBoard(page, g);
  });

  test("a lost game says so once; a game that only looks lost does not", async ({ page }, info) => {
    const touch = info.project.name === "android-chromium";
    const dialog = page.getByTestId("lost-dialog");
    // The hint only says "deal a card" here, but a card can come back down from a foundation: not lost.
    await loadState(page, rescueBoard());
    await page.waitForTimeout(1500);
    await expect(dialog).toHaveCount(0);

    const g = deadEndBoard();
    await loadState(page, g);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText("nu mai poate fi câștigat");
    // It stays put while the clock runs (it used to vanish for 200 ms every second).
    for (let i = 0; i < 25; i++) {
      expect(await dialog.isVisible()).toBe(true);
      await page.waitForTimeout(100);
    }
    await page.getByTestId("lost-close").click();
    await expect(dialog).toBeHidden();
    // Closed for good: a reload does not bring it back.
    await page.reload();
    await expect(page.locator("[data-card]")).toHaveCount(52);
    await page.waitForTimeout(1500);
    await expect(dialog).toHaveCount(0);
    // Nothing to undo after a reload: the hint does not suggest "Înapoi".
    await expect(page.getByTestId("undo")).toBeDisabled();
    await page.getByTestId("hint").click();
    await expect(page.getByTestId("toast")).toContainText("nu mai poate fi câștigat");
    await expect(page.getByTestId("toast")).not.toContainText("Înapoi");
    // Dealing more cards in the same lost game does not bring the dialog back.
    await hitStock(page, g, touch);
    await page.waitForTimeout(1000);
    await expect(dialog).toHaveCount(0);
    // Now there is a move to undo, and the hint says so.
    await page.getByTestId("hint").click();
    await expect(page.getByTestId("toast")).toContainText("Înapoi");

    // "Joc nou" from the dialog deals a fresh game.
    await loadState(page, deadEndBoard());
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await page.getByTestId("lost-new-game").click();
    await expect(dialog).toBeHidden();
    await expect(page.locator('[data-pile="stock"]')).toHaveCount(24);
  });

  test("draw 3 fans three cards, and new game asks first when a game is running", async ({ page }) => {
    await openSeed(page, SEED, 3);
    const g = newGame(SEED, { ...STD, drawCount: 3 });
    await page.locator(`[data-card="${g.stock[g.stock.length - 1]}"]`).click({ position: { x: 10, y: 5 } });
    const after = draw(g)!;
    await expectBoard(page, after);
    const xs = await Promise.all(after.waste.map(async (c) => (await page.locator(`[data-card="${c}"]`).boundingBox())!.x));
    expect(new Set(xs.map((x) => Math.round(x))).size).toBe(3);

    await page.getByTestId("new-game").click();
    await expect(page.getByTestId("confirm-new")).toBeVisible();
    await page.getByTestId("confirm-new-yes").click();
    await expect(page.getByTestId("confirm-new")).toBeHidden();
    await expect(page.locator('[data-pile="waste"]')).toHaveCount(0);
    await expect(page.locator('[data-pile="stock"]')).toHaveCount(24);
    await expect(page.locator('[data-pile="t6"]')).toHaveCount(7);
  });

  test("the hint marks a move", async ({ page }) => {
    await openSeed(page, SEED);
    await page.getByTestId("hint").click();
    await expect(page.getByTestId("toast")).toBeVisible();
    await expect(page.locator(".card.hint, .slot.hint").first()).toBeVisible();
  });

  test("winning: the cards go up by themselves, bounce off the screen, then the result shows", async ({ page }) => {
    await loadState(page, nearWin());
    await expect(page.getByTestId("win-cascade")).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('[data-pile^="f"]')).toHaveCount(52);
    await page.waitForTimeout(1500);
    await page.getByTestId("win-cascade").click();
    const dialog = page.getByTestId("win-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Ai câștigat");
    const score = Number(await page.getByTestId("win-score").textContent());
    expect(score).toBeGreaterThan(10_000); // 4 x 10 + time bonus 700000 / ~60 s
    await expect(dialog).toContainText("1 din 1");

    // The win stays won after a reload (no second animation), and "Joc nou" deals a fresh game.
    await page.reload();
    await expect(page.getByTestId("win-dialog")).toBeVisible();
    await expect(page.getByTestId("win-cascade")).toHaveCount(0);
    await page.getByTestId("win-new-game").click();
    await expect(page.getByTestId("win-dialog")).toBeHidden();
    await expect(page.locator('[data-pile="stock"]')).toHaveCount(24);
  });

  test("menu: rules for the next game, card backs, statistics, version", async ({ page }) => {
    await openSeed(page, SEED);
    await hitStock(page, newGame(SEED, STD), false);
    await page.getByTestId("menu-open").click();
    const menu = page.getByTestId("menu");
    await expect(menu).toBeVisible();
    await expect(page.getByTestId("app-version")).toContainText(/Versiunea \d+\.\d+\.\d+/);
    await expect(page.getByTestId("stat-played")).toHaveText("1");

    await page.getByTestId("setting-draw").getByRole("button", { name: "Câte 3 cărți" }).click();
    await page.getByTestId("menu-new-game").click();
    await expect(menu).toBeHidden();

    // Wiping the statistics asks first (in the app, not a browser dialog); "Renunță" keeps them.
    await page.getByTestId("menu-open").click();
    await expect(page.getByTestId("stat-played")).toHaveText("1");
    await page.getByTestId("stats-reset").click();
    await expect(page.getByTestId("confirm-reset")).toBeVisible();
    await page.getByTestId("confirm-reset-no").click();
    await expect(page.getByTestId("confirm-reset")).toBeHidden();
    await expect(menu).toBeVisible();
    await expect(page.getByTestId("stat-played")).toHaveText("1");
    await page.getByTestId("stats-reset").click();
    await page.getByTestId("confirm-reset-yes").click();
    await expect(page.getByTestId("confirm-reset")).toBeHidden();
    await expect(page.getByTestId("stat-played")).toHaveText("0");
    await expect(page.getByTestId("stat-won")).toHaveText("0 (0%)");
    await page.getByRole("button", { name: "Închide" }).click();
    await expect(menu).toBeHidden();
    const stockTop = page.locator('[data-pile="stock"][data-index="23"]');
    await stockTop.click({ position: { x: 10, y: 5 } });
    await expect(page.locator('[data-pile="waste"]')).toHaveCount(3);

    // Card back choice changes the face-down images.
    const before = await page.locator('[data-pile="t6"][data-index="0"]').getAttribute("src");
    await page.getByTestId("menu-open").click();
    await page.getByRole("button", { name: "Roșu" }).click();
    await page.getByRole("button", { name: "Închide" }).click();
    await expect(page.locator('[data-pile="t6"][data-index="0"]')).not.toHaveAttribute("src", before ?? "");
  });
});
