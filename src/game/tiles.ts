import { MAX_PIP } from "./constants";

/** A domino tile, always stored with its smaller value first. */
export type Tile = [number, number];

export function makeTile(a: number, b: number): Tile {
  return a <= b ? [a, b] : [b, a];
}

/** The 28 tiles of a double-six set, from 0|0 to 6|6. */
export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= MAX_PIP; a++) for (let b = a; b <= MAX_PIP; b++) tiles.push([a, b]);
  return tiles;
}

export function tileKey(tile: Tile): string {
  return `${tile[0]}-${tile[1]}`;
}

/** Parses a key produced by `tileKey`, or returns null if it is not a valid tile. */
export function parseTileKey(key: string): Tile | null {
  const m = /^([0-9])-([0-9])$/.exec(key);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a > b || b > MAX_PIP) return null;
  return [a, b];
}

export function isDouble(tile: Tile): boolean {
  return tile[0] === tile[1];
}

export function pips(tile: Tile): number {
  return tile[0] + tile[1];
}

export function handTotal(hand: Tile[]): number {
  return hand.reduce((sum, t) => sum + pips(t), 0);
}

export function sameTile(a: Tile, b: Tile): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

/** Fisher-Yates shuffle. `random` returns a number in [0, 1). */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
