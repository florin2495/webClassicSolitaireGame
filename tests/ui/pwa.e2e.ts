import { expect, test, type Page } from "@playwright/test";
import { autoTarget, draw, move, newGame, type GameState } from "../../src/lib/solitaire";
import { BASE, expectBoard, openSeed, STD } from "./helpers";

// Desktop Chromium only: service worker, offline start, the update button, and drag & drop with a mouse.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop-chromium", "desktop-only checks");
});

test("installable: manifest with its own id and scope, icons, service worker script", async ({ request }) => {
  const res = await request.get(`${BASE}/manifest.webmanifest`);
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m).toMatchObject({ id: "/solitaire/", start_url: "/solitaire", scope: "/solitaire", display: "standalone" });
  expect(m.icons).toHaveLength(3);
  for (const icon of m.icons as { src: string }[]) {
    const r = await request.get(new URL(icon.src, BASE).toString());
    expect(r.status(), icon.src).toBe(200);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
  const sw = await request.get(`${BASE}/sw.js`);
  expect(sw.status()).toBe(200);
  expect(sw.headers()["content-type"]).toContain("javascript");
  expect(sw.headers()["service-worker-allowed"]).toBe("/solitaire");
  expect(await sw.text()).toContain("SKIP_WAITING");
});

test("works offline once it has been opened", async ({ page, context }) => {
  await page.goto(BASE);
  await expect(page.locator("[data-card]")).toHaveCount(52);
  const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
  expect(new URL(scope).pathname).toBe("/solitaire");
  // Second load under the worker's control caches every asset the page uses.
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(page.locator("[data-card]")).toHaveCount(52);
  const saved = await page.evaluate(() => localStorage.getItem("solitaire:game:v1"));

  await context.setOffline(true);
  await page.reload();
  await expect(page.locator("[data-card]")).toHaveCount(52);
  // Same game as before, and it still plays: the stock turns a card.
  expect(await page.evaluate(() => localStorage.getItem("solitaire:game:v1"))).toBe(saved);
  const before = await page.locator('[data-pile="waste"]').count();
  await page.locator('[data-pile="stock"]').last().click({ position: { x: 10, y: 5 } });
  await expect(page.locator('[data-pile="waste"]')).toHaveCount(before + 1);
  await context.setOffline(false);
});

test("shows a separate reload button when a newer version is live, and reloading keeps the game", async ({ page }) => {
  await page.route("**/solitaire/api/version", (route) => route.fulfill({ json: { version: "999.0.0" } }));
  await openSeed(page, 77);
  await page.locator('[data-pile="stock"]').last().click({ position: { x: 10, y: 5 } });
  const afterDraw = draw(newGame(77, STD))!;
  await expectBoard(page, afterDraw);

  const button = page.getByTestId("update-reload");
  await expect(button).toBeVisible();
  await expect(button).toContainText("v999.0.0");
  await Promise.all([page.waitForEvent("load"), button.click()]);
  await expect(page.locator("[data-card]")).toHaveCount(52);
  await expectBoard(page, afterDraw);
});

/** Drag a card with the mouse from its top strip to the middle of another element. */
async function dragCard(page: Page, card: number, onto: string) {
  const from = (await page.locator(`[data-card="${card}"]`).boundingBox())!;
  const to = (await page.locator(onto).boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + 6);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 20, from.y + 26, { steps: 3 });
  await page.mouse.move(to.x + to.width / 2, to.y + 6, { steps: 8 });
  await page.mouse.up();
}

test("drag and drop: a legal drop moves the card, an illegal one puts it back", async ({ page }) => {
  // A deal where the first card off the stock fits on a column.
  let seed = 1;
  let g: GameState = newGame(seed, STD);
  for (; seed < 5000; seed++) {
    g = draw(newGame(seed, STD))!;
    if (autoTarget(g, { kind: "waste" })?.kind === "tableau") break;
  }
  const to = autoTarget(g, { kind: "waste" })!;
  expect(to.kind).toBe("tableau");
  await openSeed(page, seed);
  await page.locator('[data-pile="stock"]').last().click({ position: { x: 10, y: 5 } });
  await expectBoard(page, g);

  const wasteCard = g.waste[g.waste.length - 1];
  const target = to.kind === "tableau" ? g.tableau[to.index].cards : [];
  await dragCard(page, wasteCard, `[data-card="${target[target.length - 1]}"]`);
  const moved = move(g, { kind: "waste" }, undefined, to)!;
  await expectBoard(page, moved);

  // Column 0's card dropped on a foundation slot it cannot go to: nothing changes.
  const c0 = moved.tableau[0].cards[moved.tableau[0].cards.length - 1];
  if (move(moved, { kind: "tableau", index: 0 }, undefined, { kind: "foundation", index: 3 }) === null) {
    await dragCard(page, c0, '[data-slot="f3"]');
    await expectBoard(page, moved);
  }
});
