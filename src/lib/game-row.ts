import type { GameRow, Hand } from "./types";

/** Keeps the newest game row: same game → highest version wins; a new game replaces the old one. */
export function newerGame(current: GameRow | null, incoming: GameRow | null): GameRow | null {
  if (!incoming) return current;
  if (!current || current.state.gameId !== incoming.state.gameId) return incoming;
  return incoming.version > current.version ? incoming : current;
}

/** Keeps the newest hand: same game → highest revision wins; a new game replaces the old one. */
export function newerHand(current: Hand | null, incoming: Hand | null): Hand | null {
  if (!incoming) return current;
  if (!current || current.gameId !== incoming.gameId) return incoming;
  return incoming.rev > current.rev ? incoming : current;
}

/** True when the game says the viewer's hand changed since `hand` was read (or it is missing). */
export function handIsStale(game: GameRow | null, hand: Hand | null, userId: string): boolean {
  if (!game) return false;
  const seat = game.state.players.findIndex((p) => p.userId === userId);
  if (seat < 0) return false;
  if (!hand || hand.gameId !== game.state.gameId) return true;
  return game.state.handRevs[seat] > hand.rev;
}
