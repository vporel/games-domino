import { describe, expect, it } from "vitest";
import {
  GameError,
  GameState,
  autoPlay,
  canDraw,
  chainEnds,
  chooseAutoMove,
  createGame,
  drawTile,
  forfeit,
  handOf,
  legalMoves,
  legalMovesFor,
  openingTile,
  playTile,
  publicView,
  standings,
} from "./engine";
import { chainOf, seeded, table } from "./test-utils";
import { fullSet, handTotal, makeTile, parseTileKey, shuffle, tileKey, Tile } from "./tiles";

const A = "user-a";
const B = "user-b";
const C = "user-c";
const D = "user-d";

function allTiles(s: GameState): Tile[] {
  return [...s.hands.flat(), ...s.stock, ...s.chain.map((p) => p.tile)];
}

describe("tiles", () => {
  it("has 28 unique tiles stored smaller value first", () => {
    const set = fullSet();
    expect(set).toHaveLength(28);
    expect(new Set(set.map(tileKey)).size).toBe(28);
    expect(set.every(([a, b]) => a <= b)).toBe(true);
  });

  it("parses keys and rejects invalid ones", () => {
    expect(parseTileKey("2-5")).toEqual([2, 5]);
    expect(parseTileKey("5-2")).toBeNull();
    expect(parseTileKey("3-7")).toBeNull();
    expect(parseTileKey("x")).toBeNull();
    expect(makeTile(5, 2)).toEqual([2, 5]);
  });

  it("shuffles deterministically without losing tiles", () => {
    const a = shuffle(fullSet(), seeded(1));
    expect(shuffle(fullSet(), seeded(1))).toEqual(a);
    expect(a.map(tileKey).sort()).toEqual(fullSet().map(tileKey).sort());
    expect(a).not.toEqual(fullSet());
  });

  it("sums pips", () => {
    expect(handTotal([[1, 2], [6, 6]])).toBe(15);
    expect(handTotal([])).toBe(0);
  });
});

describe("createGame", () => {
  it("needs 2 to 4 players", () => {
    expect(() => createGame([A], seeded(1), "g")).toThrow(GameError);
    expect(() => createGame([A, B, C, D, "e"], seeded(1), "g")).toThrow(GameError);
  });

  it("deals 7 tiles each at two players, minus the opening tile", () => {
    const g = createGame([A, B], seeded(3), "g");
    expect(g.players.map((p) => p.color)).toEqual(["red", "yellow"]);
    expect(g.hands.map((h) => h.length).sort()).toEqual([6, 7]);
    expect(g.stock).toHaveLength(14);
    expect(g.chain).toHaveLength(1);
  });

  it("deals 5 tiles each at three and four players", () => {
    expect(createGame([A, B, C], seeded(4), "g").stock).toHaveLength(13);
    const g = createGame([A, B, C, D], seeded(4), "g");
    expect(g.stock).toHaveLength(8);
    expect(g.hands.map((h) => h.length).sort()).toEqual([4, 5, 5, 5]);
    expect(g.players.map((p) => p.color)).toEqual(["red", "green", "yellow", "blue"]);
  });

  it("keeps all 28 tiles", () => {
    const g = createGame([A, B, C], seeded(5), "g");
    expect(allTiles(g).map(tileKey).sort()).toEqual(fullSet().map(tileKey).sort());
  });

  it("opens with the highest tile, then hands the turn to the next seat", () => {
    for (let seed = 1; seed < 30; seed++) {
      const deal = shuffle(fullSet(), seeded(seed));
      const hands = [deal.slice(0, 7), deal.slice(7, 14)];
      const expected = openingTile(hands);
      const g = createGame([A, B], seeded(seed), "g");
      expect(g.chain[0].tile).toEqual(expected.tile);
      expect(g.events[0]).toEqual({ type: "open", seat: expected.seat, tile: expected.tile });
      expect(g.handRevs[expected.seat]).toBe(1);
      expect(g.turn).toBe(1 - expected.seat);
      expect(g.seq).toBe(0);
    }
  });
});

describe("openingTile", () => {
  it("prefers the highest double", () => {
    expect(openingTile([[[5, 6], [2, 2]], [[4, 4], [0, 1]]])).toEqual({ seat: 1, tile: [4, 4] });
  });
  it("without doubles, takes the most pips, then the highest end", () => {
    expect(openingTile([[[3, 6], [0, 1]], [[4, 5], [1, 2]]])).toEqual({ seat: 0, tile: [3, 6] });
    expect(openingTile([[[2, 3]], [[1, 5]]])).toEqual({ seat: 1, tile: [1, 5] });
  });
});

describe("legal moves", () => {
  const chain = chainOf([3, 4], [4, 6]);

  it("lists every tile and side that fits", () => {
    expect(chainEnds(chain)).toEqual({ left: 3, right: 6 });
    expect(legalMovesFor([[3, 6], [1, 2], [0, 3]], chain)).toEqual([
      { tile: [3, 6], side: "left" },
      { tile: [3, 6], side: "right" },
      { tile: [0, 3], side: "left" },
    ]);
  });

  it("allows drawing only when stuck and the stock is not empty", () => {
    expect(canDraw([[1, 2]], chain, 3)).toBe(true);
    expect(canDraw([[1, 2]], chain, 0)).toBe(false);
    expect(canDraw([[0, 3]], chain, 3)).toBe(false);
  });

  it("is empty once the game is over", () => {
    const s = table({ hands: [[[3, 3]], [[1, 1]]], chain, phase: "finished" });
    expect(legalMoves(s)).toEqual([]);
  });
});

describe("playTile", () => {
  const base = () =>
    table({
      hands: [
        [[2, 3], [5, 6], [1, 1]],
        [[0, 0], [6, 6]],
      ],
      chain: chainOf([3, 4]),
      stock: [[0, 1]],
    });

  it("orients the tile on each end and keeps track of the opening tile", () => {
    const onLeft = playTile(base(), [2, 3], "left", "u0");
    expect(onLeft.chain).toEqual([
      { tile: [2, 3], left: 2, right: 3 },
      { tile: [3, 4], left: 3, right: 4 },
    ]);
    expect(onLeft.origin).toBe(1);

    const s = table({ hands: [[[4, 5], [1, 1]], [[0, 0]]], chain: chainOf([3, 4]), stock: [[0, 1]] });
    const played = playTile(s, [4, 5], "right", "u0");
    expect(played.chain[1]).toEqual({ tile: [4, 5], left: 4, right: 5 });
    expect(played.origin).toBe(0);
  });

  it("removes the tile, bumps the hand revision and passes the turn", () => {
    const s = playTile(base(), [2, 3], "left", "u0");
    expect(s.hands[0]).toEqual([[5, 6], [1, 1]]);
    expect(s.handRevs).toEqual([1, 0]);
    expect(s.turn).toBe(1);
    expect(s.seq).toBe(2);
    expect(s.events).toEqual([{ type: "play", seat: 0, tile: [2, 3], side: "left" }]);
  });

  it("does not change the given state", () => {
    const s = base();
    const copy = structuredClone(s);
    playTile(s, [2, 3], "left", "u0");
    expect(s).toEqual(copy);
  });

  it("rejects illegal plays", () => {
    expect(() => playTile(base(), [2, 3], "left", "u1")).toThrow("Ce n'est pas ton tour.");
    expect(() => playTile(base(), [0, 0], "left", "u0")).toThrow("Tu n'as pas cette pièce.");
    expect(() => playTile(base(), [2, 3], "right", "u0")).toThrow("Cette pièce ne va pas de ce côté.");
    expect(() => playTile({ ...base(), phase: "finished" }, [2, 3], "left", "u0")).toThrow("La partie est terminée.");
  });

  it("ends the game when the last tile is played: the winner scores the others' pips", () => {
    const s = table({
      hands: [[[3, 5]], [[6, 6], [1, 2]], [[0, 4]]],
      chain: chainOf([1, 3]),
      stock: [[0, 0]],
    });
    const done = playTile(s, [3, 5], "right", "u0");
    expect(done.phase).toBe("finished");
    expect(done.result).toEqual({ reason: "domino", winner: 0, points: 19, totals: [0, 15, 4] });
    expect(done.events.at(-1)).toEqual({ type: "end", reason: "domino", winner: 0, points: 19 });
    expect(standings(done)).toEqual([0, 2, 1]);
  });
});

describe("drawTile", () => {
  it("is refused while a tile can be played", () => {
    const s = table({ hands: [[[3, 3]], [[0, 0]]], chain: chainOf([3, 4]), stock: [[1, 2]] });
    expect(() => drawTile(s, "u0")).toThrow("Tu peux déjà poser une pièce.");
    expect(() => drawTile(s, "u1")).toThrow("Ce n'est pas ton tour.");
  });

  it("takes the first stock tile and keeps the turn", () => {
    const s = table({ hands: [[[0, 0]], [[0, 1]]], chain: chainOf([3, 4]), stock: [[1, 2], [4, 6]] });
    const d = drawTile(s, "u0");
    expect(d.hands[0]).toEqual([[0, 0], [1, 2]]);
    expect(d.stock).toEqual([[4, 6]]);
    expect(d.turn).toBe(0);
    expect(d.handRevs).toEqual([1, 0]);
    expect(d.events).toEqual([{ type: "draw", seat: 0, count: 1 }]);
    // Still stuck: draws again, now gets a playable tile.
    const d2 = drawTile(d, "u0");
    expect(d2.turn).toBe(0);
    expect(legalMoves(d2)).toEqual([{ tile: [4, 6], side: "right" }]);
    expect(() => drawTile(d2, "u0")).toThrow(GameError);
  });

  it("passes when the stock runs out without a playable tile", () => {
    const s = table({ hands: [[[0, 0]], [[4, 5]]], chain: chainOf([3, 4]), stock: [[1, 2]] });
    const d = drawTile(s, "u0");
    expect(d.turn).toBe(1);
    expect(d.events).toEqual([
      { type: "draw", seat: 0, count: 1 },
      { type: "pass", seat: 0 },
    ]);
  });
});

describe("passing and blocked games", () => {
  it("skips players who can neither play nor draw", () => {
    const s = table({
      hands: [[[2, 4], [0, 0]], [[1, 1]], [[2, 6], [5, 5]]],
      chain: chainOf([3, 4]),
    });
    const p = playTile(s, [2, 4], "right", "u0");
    // Ends are now 3 and 2: seat 1 holds only 1|1 and passes, seat 2 can play 2|6.
    expect(p.turn).toBe(2);
    expect(p.events.map((e) => e.type)).toEqual(["play", "pass"]);
  });

  it("ends a blocked game: the lowest hand wins the difference with each other hand", () => {
    const s = table({
      hands: [[[0, 4], [6, 6]], [[1, 1]], [[5, 5]]],
      chain: chainOf([3, 4]),
    });
    const p = playTile(s, [0, 4], "right", "u0");
    // Ends 3 and 0, nobody can play and the stock is empty.
    expect(p.phase).toBe("finished");
    expect(p.result).toEqual({ reason: "blocked", winner: 1, points: 10 - 2 + 12 - 2, totals: [12, 2, 10] });
    expect(standings(p)).toEqual([1, 2, 0]);
  });

  it("has no winner when the lowest hands tie", () => {
    const s = table({
      hands: [[[0, 4], [2, 4]], [[1, 5]], [[5, 5]]],
      chain: chainOf([3, 4]),
    });
    const p = playTile(s, [0, 4], "right", "u0");
    expect(p.result).toEqual({ reason: "blocked", winner: null, points: 0, totals: [6, 6, 10] });
    expect(p.events.at(-1)).toEqual({ type: "end", reason: "blocked", winner: null, points: 0 });
    expect(standings(p)).toEqual([0, 1, 2]);
  });
});

describe("forfeit", () => {
  const four = () =>
    table({
      hands: [[[0, 0]], [[1, 1], [2, 2]], [[3, 5]], [[6, 6]]],
      chain: chainOf([3, 4]),
      stock: [[0, 1]],
      turn: 1,
    });

  it("returns the hand under the stock and passes the turn if it was theirs", () => {
    const s = forfeit(four(), 1);
    expect(s.forfeited).toEqual([1]);
    expect(s.hands[1]).toEqual([]);
    expect(s.stock).toEqual([[0, 1], [1, 1], [2, 2]]);
    expect(s.turn).toBe(2);
    expect(s.events).toEqual([{ type: "forfeit", seat: 1 }]);
    expect(s.handRevs[1]).toBe(1);
  });

  it("keeps the turn when another player leaves", () => {
    expect(forfeit(four(), 3).turn).toBe(1);
  });

  it("skips players who left", () => {
    const s = forfeit(four(), 2);
    const after = drawTile(s, "u1");
    expect(after.turn).toBe(1);
  });

  it("makes the last player standing win, without points", () => {
    let s = forfeit(four(), 1);
    s = forfeit(s, 2);
    s = forfeit(s, 3);
    expect(s.phase).toBe("finished");
    expect(s.result).toMatchObject({ reason: "forfeit", winner: 0, points: 0 });
    expect(standings(s)).toEqual([0, 3, 2, 1]);
  });

  it("does nothing for a player who already left or a finished game", () => {
    const s = forfeit(four(), 1);
    expect(forfeit(s, 1)).toBe(s);
    const done = { ...four(), phase: "finished" as const };
    expect(forfeit(done, 0)).toBe(done);
  });
});

describe("autoPlay", () => {
  it("plays the heaviest tile, preferring doubles", () => {
    const s = table({ hands: [[[3, 3], [0, 4], [4, 5]], [[0, 0]]], chain: chainOf([3, 4]), stock: [[1, 1]] });
    expect(chooseAutoMove(s)).toEqual({ tile: [4, 5], side: "right" });
    const t = table({ hands: [[[3, 3], [0, 6]], [[0, 0]]], chain: chainOf([3, 6]), stock: [[1, 1]] });
    expect(chooseAutoMove(t)).toEqual({ tile: [3, 3], side: "left" });
    const a = autoPlay(s);
    expect(a.events).toEqual([{ type: "play", seat: 0, tile: [4, 5], side: "right", auto: true }]);
    expect(a.turn).toBe(1);
  });

  it("draws until a tile can be played, in one action", () => {
    const s = table({ hands: [[[0, 0]], [[0, 1]]], chain: chainOf([3, 4]), stock: [[1, 2], [2, 2], [4, 6], [1, 1]] });
    const a = autoPlay(s);
    expect(a.seq).toBe(s.seq + 1);
    expect(a.events).toEqual([
      { type: "draw", seat: 0, count: 3, auto: true },
      { type: "play", seat: 0, tile: [4, 6], side: "right", auto: true },
    ]);
    expect(a.stock).toEqual([[1, 1]]);
    expect(a.turn).toBe(1);
  });

  it("passes when the stock runs out", () => {
    const s = table({ hands: [[[0, 0]], [[3, 6]]], chain: chainOf([3, 4]), stock: [[1, 2]] });
    const a = autoPlay(s);
    expect(a.events.map((e) => e.type)).toEqual(["draw", "pass"]);
    expect(a.turn).toBe(1);
  });

  it("leaves a finished game alone", () => {
    const s = table({ hands: [[], [[0, 0]]], chain: chainOf([3, 4]), phase: "finished" });
    expect(autoPlay(s)).toBe(s);
  });
});

describe("public view", () => {
  it("hides hands and stock until the game is over", () => {
    const g = createGame([A, B, C], seeded(8), "g");
    const v = publicView(g);
    expect(v).not.toHaveProperty("hands");
    expect(v).not.toHaveProperty("stock");
    expect(JSON.stringify(v)).not.toContain('"hands"');
    expect(v.handSizes).toEqual(g.hands.map((h) => h.length));
    expect(v.stockSize).toBe(g.stock.length);
    expect(v.revealed).toBeNull();
  });

  it("reveals every hand at the end", () => {
    const s = table({ hands: [[[3, 5]], [[6, 6]]], chain: chainOf([1, 3]) });
    const v = publicView(playTile(s, [3, 5], "right", "u0"));
    expect(v.revealed).toEqual([[], [[6, 6]]]);
  });

  it("gives each player their own hand only", () => {
    const g = createGame([A, B], seeded(9), "g");
    expect(handOf(g, B)).toEqual(g.hands[1]);
    expect(handOf(g, "stranger")).toBeNull();
  });
});

describe("random games", () => {
  it("always finish, keep every tile and a consistent chain", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const ids = [A, B, C, D].slice(0, 2 + (seed % 3));
      const rnd = seeded(seed);
      let s = createGame(ids, rnd, "g");
      const opening = s.chain[0].tile;
      for (let step = 0; s.phase === "play" && step < 200; step++) {
        if (rnd() < 0.03) s = forfeit(s, Math.floor(rnd() * ids.length));
        else s = autoPlay(s);
        expect(allTiles(s).map(tileKey).sort()).toEqual(fullSet().map(tileKey).sort());
      }
      expect(s.phase).toBe("finished");
      for (let i = 1; i < s.chain.length; i++) expect(s.chain[i].left).toBe(s.chain[i - 1].right);
      expect(s.chain[s.origin].tile).toEqual(opening);
      expect(standings(s).sort()).toEqual(ids.map((_, i) => i));
    }
  });
});
