import { describe, expect, it } from "vitest";
import { FAST_SPEEDS, launchVelocity, outlineWidth, SLOW_SHARE, SLOW_SPEEDS } from "./cascade";

/** Feeds fixed numbers in place of Math.random: direction, slow or not, speed, upward kick. */
const seq = (...xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};

describe("win cascade launch", () => {
  it("a slow card moves 1-2 px a step, a fast one 3-7, either way, scaled to the card", () => {
    expect(launchVelocity(seq(0.2, 0.1, 0, 0.5), 1)).toEqual({ vx: -1, vy: -3.5, slow: true });
    expect(launchVelocity(seq(0.7, 0.34, 0.99, 0.5), 1)).toEqual({ vx: 2, vy: -3.5, slow: true });
    expect(launchVelocity(seq(0.7, 0.35, 0, 0.5), 1)).toEqual({ vx: 3, vy: -3.5, slow: false });
    expect(launchVelocity(seq(0.2, 0.9, 0.99, 0.5), 1)).toEqual({ vx: -7, vy: -3.5, slow: false });
    expect(launchVelocity(seq(0.7, 0.1, 0.9, 0.5), 2).vx).toBe(4); // speed 2 on a card twice the classic size
  });

  it("35% of the cards come down slowly (a black band)", () => {
    expect(SLOW_SHARE).toBe(0.35);
    const N = 10_000;
    let slow = 0;
    for (let k = 0; k < N; k++) {
      // Evenly spread numbers instead of Math.random, so the share is exact.
      const v = launchVelocity(seq(0.5, (k + 0.5) / N, (k * 7919 % N) / N, 0.5), 1);
      const speed = Math.abs(v.vx);
      expect((v.slow ? SLOW_SPEEDS : FAST_SPEEDS) as readonly number[]).toContain(speed);
      if (v.slow) slow++;
    }
    expect(slow / N).toBe(0.35);
  });

  it("the outline grows with the card, never under 1 px", () => {
    expect(outlineWidth(0.8)).toBe(1);
    expect(outlineWidth(1.7)).toBe(1.7);
  });
});
