import type { GameState, Placed } from "./engine";
import type { Tile } from "./tiles";

/** Deterministic random numbers in [0, 1) (mulberry32), for reproducible deals in tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Chain built left to right from tiles given in play order, each oriented to match its neighbor. */
export function chainOf(...tiles: Tile[]): Placed[] {
  const chain: Placed[] = [{ tile: tiles[0], left: tiles[0][0], right: tiles[0][1] }];
  for (const tile of tiles.slice(1)) {
    const end = chain[chain.length - 1].right;
    if (tile[0] !== end && tile[1] !== end) throw new Error(`chainOf: ${tile} does not fit ${end}`);
    chain.push({ tile, left: end, right: tile[0] === end ? tile[1] : tile[0] });
  }
  return chain;
}

/** A hand-built game state for rule tests: two players by default, turn to seat 0. */
export function table(partial: Partial<GameState> & Pick<GameState, "hands" | "chain">): GameState {
  const players = partial.players ?? partial.hands.map((_, i) => ({ userId: `u${i}`, color: (["red", "yellow", "green", "blue"] as const)[i] }));
  return {
    gameId: "g1",
    players,
    origin: 0,
    turn: 0,
    phase: "play",
    forfeited: [],
    result: null,
    handRevs: players.map(() => 0),
    seq: 1,
    events: [],
    stock: [],
    ...partial,
  };
}
