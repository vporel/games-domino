export const COLORS = ["red", "green", "yellow", "blue"] as const;
export type Color = (typeof COLORS)[number];

export const COLOR_LABELS: Record<Color, string> = {
  red: "Rouge",
  green: "Vert",
  yellow: "Jaune",
  blue: "Bleu",
};

/** Highest pip value: a double-six set has 28 tiles. */
export const MAX_PIP = 6;

export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const TURN_DURATION_MS = 30_000;

/** Tiles dealt to each player: 7 at two players, 5 at three or four. */
export function handSizeFor(playerCount: number): number {
  return playerCount <= 2 ? 7 : 5;
}

/** Colors identifying the seats for a given number of players (2 players sit face to face). */
export function colorsForPlayerCount(count: number): Color[] {
  if (count <= 2) return ["red", "yellow"].slice(0, count) as Color[];
  return COLORS.slice(0, count) as Color[];
}
