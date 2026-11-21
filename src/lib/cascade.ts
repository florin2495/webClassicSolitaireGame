// Physics of the win cascade (drawn by src/components/WinCascade.tsx), kept pure so it can be unit-tested.
//
// The classic look: every frame of a falling card stays painted, so the trail is a pile of card copies, each one
// covered by the next except for a strip as wide as the card moved. Every copy has a black outline. A fast card leaves
// separate thin black lines; a slow one (1-2 px a step) packs the outlines so tightly that they merge into a black
// band. In the original about 30% of the cards came down like that; here it is 35% (the user's choice, 2026-11-21).

/** Share of the cards that come down slowly, as a black band. */
export const SLOW_SHARE = 0.35;
/** Sideways speeds, in px per step for the classic 71 px card (scaled by `s` for bigger cards). */
export const SLOW_SPEEDS = [1, 2] as const;
export const FAST_SPEEDS = [3, 4, 5, 6, 7] as const;

export interface Velocity {
  vx: number;
  vy: number;
  /** The card's trail will be a black band. */
  slow: boolean;
}

/** Launch speed for one card. `rnd` returns [0, 1) like Math.random; `s` = card width / 71. */
export function launchVelocity(rnd: () => number, s: number): Velocity {
  const dir = rnd() < 0.5 ? -1 : 1;
  const slow = rnd() < SLOW_SHARE;
  const speeds: readonly number[] = slow ? SLOW_SPEEDS : FAST_SPEEDS;
  const speed = speeds[Math.min(speeds.length - 1, Math.floor(rnd() * speeds.length))];
  return { vx: dir * speed * s, vy: -rnd() * 7 * s, slow };
}

/** The outline grows with the card, so a slow card's band stays dark on big screens too. */
export function outlineWidth(s: number): number {
  return Math.max(1, s);
}
