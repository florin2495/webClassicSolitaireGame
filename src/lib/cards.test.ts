import { describe, expect, it } from "vitest";
import { backUrl, BACKS, cardBackSvg, cardFaceSvg, cardLabel, faceUrl, RANK_LABEL, ZOOMS, type BackId } from "./cards";
import { cardOf, rankOf } from "./solitaire";

const uses = (svg: string) => svg.split("<use ").length - 1;

describe("card art", () => {
  it("draws every face with its rank and the right number of suit marks", () => {
    for (let c = 0; c < 52; c++) {
      const svg = cardFaceSvg(c);
      const r = rankOf(c);
      expect(svg.startsWith("<svg")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain(`>${RANK_LABEL[r]}</text>`);
      // 2 corner marks + the middle: 1 for an ace, r pips for 2-10, 2 small ones for court cards.
      const middle = r === 1 ? 1 : r <= 10 ? r : 2;
      expect(uses(svg)).toBe(2 + middle);
    }
  });

  it("Zoom in 1x: bigger corners, still every pip", () => {
    for (let c = 0; c < 52; c++) {
      const r = rankOf(c);
      const svg = cardFaceSvg(c, 1);
      expect(svg).toContain(`>${RANK_LABEL[r]}</text>`);
      expect(svg).toMatch(/font-size="4[02]"/);
      expect(uses(svg)).toBe(2 + (r === 1 ? 1 : r <= 10 ? r : 2));
    }
  });

  it("Zoom in 2x: a big corner and one big suit with the rank on it, for every card", () => {
    for (let c = 0; c < 52; c++) {
      const r = rankOf(c);
      const svg = cardFaceSvg(c, 2);
      expect(svg).toMatch(/font-size="5[24]"/);
      // The corner mark + one big suit, no upside-down corner.
      expect(uses(svg)).toBe(2);
      expect(svg).not.toContain("rotate(180 50 70)");
      expect(svg).toContain(`fill="#fff">${RANK_LABEL[r]}</text>`);
    }
  });

  it("caches one face per card and zoom level", () => {
    const urls = ZOOMS.map((z) => faceUrl(5, z));
    expect(new Set(urls).size).toBe(3);
    expect(faceUrl(5, 2)).toBe(urls[2]);
    expect(faceUrl(5)).toBe(urls[0]);
  });

  it("colours hearts and diamonds red, the others black", () => {
    expect(cardFaceSvg(cardOf("H", 5))).toContain('color="#c8102e"');
    expect(cardFaceSvg(cardOf("D", 5))).toContain('color="#c8102e"');
    expect(cardFaceSvg(cardOf("S", 5))).toContain('color="#141414"');
  });

  it("never uses the suit characters (Android may show them as emoji)", () => {
    for (const z of ZOOMS) for (let c = 0; c < 52; c++) expect(cardFaceSvg(c, z)).not.toMatch(/[♠-♧]/);
  });

  it("builds data URLs for faces and every back", () => {
    expect(faceUrl(0).startsWith("data:image/svg+xml")).toBe(true);
    expect(faceUrl(0)).toBe(faceUrl(0));
    for (const b of Object.keys(BACKS) as BackId[]) {
      expect(cardBackSvg(b)).toContain(BACKS[b].base);
      expect(backUrl(b).startsWith("data:image/svg+xml")).toBe(true);
    }
  });

  it("labels cards in Romanian for screen readers", () => {
    expect(cardLabel(cardOf("H", 10))).toBe("10 inimă roșie");
    expect(cardLabel(cardOf("S", 1))).toBe("A pică");
  });
});
