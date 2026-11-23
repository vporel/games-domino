import { describe, expect, it } from "vitest";
import { autoPlay, createGame, GameState } from "./engine";
import { LaidTile, layoutChain, Rect, ROW_LIMIT } from "./layout";
import { chainOf, seeded } from "./test-utils";

const EPS = 1e-9;

function box(r: Rect) {
  const [w, h] = r.vertical ? [0.5, 1] : [1, 0.5];
  return { x1: r.x - w, x2: r.x + w, y1: r.y - h, y2: r.y + h };
}

function overlap(a: Rect, b: Rect): boolean {
  const p = box(a);
  const q = box(b);
  return Math.min(p.x2, q.x2) - Math.max(p.x1, q.x1) > EPS && Math.min(p.y2, q.y2) - Math.max(p.y1, q.y1) > EPS;
}

function touch(a: Rect, b: Rect): boolean {
  const p = box(a);
  const q = box(b);
  const gapX = Math.max(p.x1, q.x1) - Math.min(p.x2, q.x2);
  const gapY = Math.max(p.y1, q.y1) - Math.min(p.y2, q.y2);
  return gapX <= EPS && gapY <= EPS && !overlap(a, b);
}

/** The two halves of a laid tile with their values. */
function cells(t: LaidTile) {
  return t.vertical
    ? [{ x: t.x, y: t.y - 0.5, v: t.a }, { x: t.x, y: t.y + 0.5, v: t.b }]
    : [{ x: t.x - 0.5, y: t.y, v: t.a }, { x: t.x + 0.5, y: t.y, v: t.b }];
}

function finishedGames(count: number): GameState[] {
  const games: GameState[] = [];
  for (let seed = 1; seed <= count; seed++) {
    let s = createGame(["a", "b", "c", "d"].slice(0, 2 + (seed % 3)), seeded(seed), "g");
    while (s.phase === "play") s = autoPlay(s);
    games.push(s);
  }
  return games;
}

/** A long chain played entirely on one end, to force several turns. */
const longRight = chainOf([6, 6], [6, 5], [5, 5], [5, 4], [4, 4], [4, 3], [3, 3], [3, 2], [2, 2], [2, 1], [1, 1], [1, 0], [0, 0], [0, 6], [6, 1], [1, 5], [5, 2], [2, 6]);

describe("layoutChain", () => {
  it("puts the opening tile at the center, across if it is a double", () => {
    expect(layoutChain(chainOf([6, 6]), 0).tiles[0]).toEqual({ index: 0, x: 0, y: 0, vertical: true, a: 6, b: 6 });
    expect(layoutChain(chainOf([3, 5]), 0).tiles[0]).toEqual({ index: 0, x: 0, y: 0, vertical: false, a: 3, b: 5 });
  });

  it("runs the right arm to the right and the left arm to the left", () => {
    const chain = chainOf([1, 3], [3, 4], [4, 6]);
    const { tiles } = layoutChain(chain, 1);
    const byIndex = (i: number) => tiles.find((t) => t.index === i)!;
    expect(byIndex(0)).toMatchObject({ x: -2, y: 0, vertical: false, a: 1, b: 3 });
    expect(byIndex(2)).toMatchObject({ x: 2, y: 0, vertical: false, a: 4, b: 6 });
  });

  it("lays every tile exactly once", () => {
    const { tiles } = layoutChain(longRight, 0);
    expect(tiles.map((t) => t.index).sort((a, b) => a - b)).toEqual(longRight.map((_, i) => i));
  });

  it("turns at the row limit and snakes down on the right, up on the left", () => {
    const right = layoutChain(longRight, 0);
    expect(Math.max(...right.tiles.map((t) => box(t).x2))).toBeLessThanOrEqual(ROW_LIMIT + 1);
    expect(Math.max(...right.tiles.map((t) => t.y))).toBeGreaterThan(2);
    expect(right.tiles.every((t) => t.y >= 0 || t.index === 0)).toBe(true);

    const reversed = [...longRight].reverse().map((p) => ({ tile: p.tile, left: p.right, right: p.left }));
    const left = layoutChain(reversed, reversed.length - 1);
    expect(Math.min(...left.tiles.map((t) => t.y))).toBeLessThan(-2);
    expect(left.tiles.every((t) => t.y <= 0)).toBe(true);
  });

  it("never overlaps tiles, and each tile touches the next one", () => {
    for (const s of [...finishedGames(150), { chain: longRight, origin: 0 } as GameState]) {
      const { tiles, ghosts } = layoutChain(s.chain, s.origin);
      const sorted = [...tiles].sort((a, b) => a.index - b.index);
      for (let i = 0; i < sorted.length; i++) {
        for (let j = i + 1; j < sorted.length; j++) expect(overlap(sorted[i], sorted[j])).toBe(false);
        expect(overlap(sorted[i], ghosts.left)).toBe(false);
        expect(overlap(sorted[i], ghosts.right)).toBe(false);
        if (i > 0) expect(touch(sorted[i - 1], sorted[i])).toBe(true);
      }
      expect(touch(sorted[0], ghosts.left)).toBe(true);
      expect(touch(sorted[sorted.length - 1], ghosts.right)).toBe(true);
    }
  });

  it("shows matching values where two tiles meet", () => {
    for (const s of finishedGames(150)) {
      const { tiles } = layoutChain(s.chain, s.origin);
      const sorted = [...tiles].sort((a, b) => a.index - b.index);
      for (let i = 1; i < sorted.length; i++) {
        const [prev, next] = [sorted[i - 1], sorted[i]];
        // A double laid across touches its neighbor with both halves: nothing to compare.
        if (prev.a === prev.b || next.a === next.b) continue;
        const meeting = cells(prev).flatMap((p) => cells(next).filter((q) => Math.abs(p.x - q.x) + Math.abs(p.y - q.y) === 1).map((q) => [p, q]));
        expect(meeting).toHaveLength(1);
        const [p, q] = meeting[0];
        expect(p.v).toBe(s.chain[i - 1].right);
        expect(q.v).toBe(s.chain[i].left);
      }
    }
  });

  it("bounds every tile and both ghosts", () => {
    const { tiles, ghosts, bounds } = layoutChain(longRight, 0);
    for (const r of [...tiles, ghosts.left, ghosts.right]) {
      const b = box(r);
      expect(b.x1).toBeGreaterThanOrEqual(bounds.minX);
      expect(b.x2).toBeLessThanOrEqual(bounds.maxX);
      expect(b.y1).toBeGreaterThanOrEqual(bounds.minY);
      expect(b.y2).toBeLessThanOrEqual(bounds.maxY);
    }
  });
});
