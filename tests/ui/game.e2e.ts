import { expect, test } from "@playwright/test";
import { autoTarget, canAutoComplete, draw, findHint, move, newGame, type GameState } from "../../src/lib/solitaire";
import { expectBoard, hitCard, hitStock, loadState, nearWin, openSeed, STD } from "./helpers";

const SEED = 20261121;

test.describe("Solitaire", () => {
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
