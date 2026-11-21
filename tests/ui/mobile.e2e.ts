import { expect, test } from "@playwright/test";
import { draw, newGame } from "../../src/lib/solitaire";
import { BASE, expectBoard, expectNoHorizontalScroll, hitStock, openSeed, STD } from "./helpers";

// Android phone (Pixel 7, touch) only: the game must fit the screen and be big enough for a finger.
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "android-chromium", "phone-only checks");
});

test("fits the phone screen, big cards and buttons, taps work", async ({ page }) => {
  await openSeed(page, 4242);
  await expectNoHorizontalScroll(page);
  const vp = page.viewportSize()!;
  const board = (await page.getByTestId("board").boundingBox())!;
  expect(board.x).toBeGreaterThanOrEqual(0);
  expect(board.x + board.width).toBeLessThanOrEqual(vp.width + 0.5);

  // Every card inside the screen, at least 44 px wide on this phone.
  const boxes = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (const b of boxes) {
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.left).toBeGreaterThanOrEqual(0);
    expect(b.right).toBeLessThanOrEqual(vp.width + 0.5);
    expect(b.bottom).toBeLessThanOrEqual(vp.height + 0.5);
  }

  // Bottom buttons are thumb-sized.
  for (const id of ["new-game", "undo", "hint", "menu-open"]) {
    const b = (await page.getByTestId(id).boundingBox())!;
    expect(b.height, id).toBeGreaterThanOrEqual(44);
    expect(b.y + b.height, id).toBeLessThanOrEqual(vp.height + 0.5);
  }

  const g = newGame(4242, STD);
  await hitStock(page, g, true);
  await expectBoard(page, draw(g)!);
});

test("landscape still shows every card inside the screen", async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.goto(`${BASE}?seed=99`);
  await expect(page.locator("[data-card]")).toHaveCount(52);
  await expectNoHorizontalScroll(page);
  const boxes = await page.locator("[data-card]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
  for (const b of boxes) {
    expect(b.right).toBeLessThanOrEqual(915.5);
    expect(b.bottom).toBeLessThanOrEqual(412.5);
  }
});
