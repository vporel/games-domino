import type { PublicState } from "@/game/engine";
import type { Tile } from "@/game/tiles";

export type RoomStatus = "lobby" | "playing" | "finished" | "closed";

export type RoomPlayer = {
  userId: string;
  pseudo: string;
  joinedAt: string;
  leftAt: string | null;
};

export type GameRow = {
  state: PublicState;
  version: number;
  turnDeadline: string | null;
};

/** The viewer's own tiles. `rev` matches `state.handRevs[seat]` when it was read in game `gameId`. */
export type Hand = { tiles: Tile[]; rev: number; gameId: string };

/** What a game action returns: the new public game and the acting player's hand. */
export type GameUpdate = { game: GameRow; hand: Hand | null };

export type RoomSnapshot = {
  id: string;
  code: string;
  hostId: string;
  status: RoomStatus;
  players: RoomPlayer[];
  game: GameRow | null;
  hand: Hand | null;
  me: { userId: string; pseudo: string; isMember: boolean };
  /** Server clock at snapshot time, used to correct the client's timer. */
  serverNow: number;
};

export type ActionResult<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
