import "server-only";
import { randomInt } from "node:crypto";
import { TURN_DURATION_MS } from "@/game/constants";
import { GameState, PublicState, handOf, publicView, seatOf } from "@/game/engine";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type { GameRow, GameUpdate, Hand, RoomPlayer, RoomSnapshot, RoomStatus } from "@/lib/types";

export class ConflictError extends Error {
  constructor() {
    super("La partie a changé entre-temps. Réessaie.");
  }
}

export type RoomRow = { id: string; code: string; host_id: string; status: RoomStatus };

/** Full game as stored on the server: the secret state with the public row's metadata. */
type FullGame = { state: GameState; version: number; turnDeadline: string | null };

/** Cryptographically random number in [0, 1), for shuffling. */
export function secureRandom(): number {
  return randomInt(0, 2 ** 32) / 2 ** 32;
}

export async function getProfilePseudo(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin().from("domino_profiles").select("pseudo").eq("id", userId).maybeSingle();
  return data?.pseudo ?? null;
}

export async function findActiveRoomByCode(code: string): Promise<RoomRow | null> {
  const { data } = await supabaseAdmin()
    .from("domino_rooms")
    .select("id, code, host_id, status")
    .eq("code", code)
    .neq("status", "closed")
    .maybeSingle();
  return (data as RoomRow | null) ?? null;
}

export async function getRoom(roomId: string): Promise<RoomRow | null> {
  const { data } = await supabaseAdmin()
    .from("domino_rooms")
    .select("id, code, host_id, status")
    .eq("id", roomId)
    .maybeSingle();
  return (data as RoomRow | null) ?? null;
}

export async function listPlayers(roomId: string): Promise<RoomPlayer[]> {
  const { data, error } = await supabaseAdmin()
    .from("domino_room_players")
    .select("user_id, joined_at, left_at, domino_profiles(pseudo)")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => {
    const profile = r.domino_profiles as unknown as { pseudo: string } | { pseudo: string }[] | null;
    const pseudo = Array.isArray(profile) ? profile[0]?.pseudo : profile?.pseudo;
    return { userId: r.user_id, pseudo: pseudo ?? "?", joinedAt: r.joined_at, leftAt: r.left_at };
  });
}

export async function getGame(roomId: string): Promise<GameRow | null> {
  const { data } = await supabaseAdmin()
    .from("domino_games")
    .select("state, version, turn_deadline")
    .eq("room_id", roomId)
    .maybeSingle();
  if (!data) return null;
  return { state: data.state as PublicState, version: data.version, turnDeadline: data.turn_deadline };
}

async function getSecretState(roomId: string): Promise<{ state: GameState; version: number } | null> {
  const { data, error } = await supabaseAdmin()
    .from("domino_game_secrets")
    .select("state, version")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error) throw error;
  return data ? { state: data.state as GameState, version: data.version } : null;
}

async function getFullGame(roomId: string): Promise<FullGame | null> {
  const [row, secret] = await Promise.all([getGame(roomId), getSecretState(roomId)]);
  if (!row || !secret) return null;
  // Read between the two writes of a concurrent move: the client retries.
  if (row.version !== secret.version) throw new ConflictError();
  return { state: secret.state, version: row.version, turnDeadline: row.turnDeadline };
}

function handFor(state: GameState, userId: string): Hand | null {
  const tiles = handOf(state, userId);
  if (!tiles) return null;
  return { tiles, rev: state.handRevs[seatOf(state, userId)], gameId: state.gameId };
}

/** The viewer's own hand in the stored game, or null if they do not play in it. */
export async function getHand(roomId: string, userId: string): Promise<Hand | null> {
  const secret = await getSecretState(roomId);
  return secret ? handFor(secret.state, userId) : null;
}

/** Bumps updated_at so subscribers of the room row refresh their lobby. */
export async function touchRoom(roomId: string, patch: Partial<Pick<RoomRow, "status" | "host_id">> = {}) {
  const { error } = await supabaseAdmin()
    .from("domino_rooms")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", roomId);
  if (error) throw error;
}

export async function buildSnapshot(room: RoomRow, userId: string, pseudo: string): Promise<RoomSnapshot> {
  const [players, game] = await Promise.all([listPlayers(room.id), getGame(room.id)]);
  const isMember = players.some((p) => p.userId === userId);
  const hand = isMember && game ? await getHand(room.id, userId) : null;
  return {
    id: room.id,
    code: room.code,
    hostId: room.host_id,
    status: room.status,
    players,
    game: isMember ? game : null,
    hand,
    me: { userId, pseudo, isMember },
    serverNow: Date.now(),
  };
}

function deadlineFor(state: GameState): string | null {
  return state.phase === "finished" ? null : new Date(Date.now() + TURN_DURATION_MS).toISOString();
}

export async function insertGame(roomId: string, state: GameState, viewerId: string): Promise<GameUpdate> {
  const admin = supabaseAdmin();
  await admin.from("domino_moves").delete().eq("room_id", roomId);
  const deadline = deadlineFor(state);
  const pub = publicView(state);
  const { error } = await admin.rpc("domino_start_game", {
    p_room_id: roomId,
    p_public: pub,
    p_secret: state,
    p_deadline: deadline,
  });
  if (error) throw error;
  return { game: { state: pub, version: 0, turnDeadline: deadline }, hand: handFor(state, viewerId) };
}

/**
 * Applies `mutate` to the stored game with optimistic locking on `version`.
 * `expectedVersion` (when given) must match what the client saw, so stale clicks are rejected.
 * Returns the public game and `viewerId`'s hand.
 */
export async function mutateGame(
  roomId: string,
  actorId: string | null,
  viewerId: string,
  mutate: (state: GameState, row: FullGame) => GameState,
  expectedVersion?: number,
): Promise<GameUpdate> {
  const current = await getFullGame(roomId);
  if (!current) throw new Error("Aucune partie en cours.");
  if (expectedVersion !== undefined && expectedVersion !== current.version) throw new ConflictError();

  const next = mutate(current.state, current);
  if (next === current.state) {
    return {
      game: { state: publicView(current.state), version: current.version, turnDeadline: current.turnDeadline },
      hand: handFor(current.state, viewerId),
    };
  }

  const version = current.version + 1;
  const finished = next.phase === "finished";
  const winnerSeat = next.result?.winner ?? null;
  const winnerId = finished && winnerSeat !== null ? next.players[winnerSeat].userId : null;
  const turnDeadline = deadlineFor(next);
  const pub = publicView(next);

  const admin = supabaseAdmin();
  const { data: saved, error } = await admin.rpc("domino_save_game", {
    p_room_id: roomId,
    p_expected_version: current.version,
    p_public: pub,
    p_secret: next,
    p_deadline: turnDeadline,
    p_finished: finished,
    p_winner_id: winnerId,
    p_points: next.result?.points ?? 0,
    p_player_ids: next.players.map((p) => p.userId),
  });
  if (error) throw error;
  if (!saved) throw new ConflictError();

  await admin.from("domino_moves").insert({ room_id: roomId, user_id: actorId, seq: next.seq, events: next.events });
  if (finished) await touchRoom(roomId, { status: "finished" });

  return {
    game: { state: pub, version, turnDeadline },
    hand: handFor(next, viewerId),
  };
}
