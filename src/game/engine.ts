import { Color, MAX_PLAYERS, MIN_PLAYERS, colorsForPlayerCount, handSizeFor } from "./constants";
import { Tile, fullSet, handTotal, isDouble, pips, sameTile, shuffle } from "./tiles";

export type PlayerSlot = { userId: string; color: Color };

export type Side = "left" | "right";

/** A tile on the table, oriented: `left` touches the previous tile of the chain, `right` the next. */
export type Placed = { tile: Tile; left: number; right: number };

export type Move = { tile: Tile; side: Side };

export type EndReason = "domino" | "blocked" | "forfeit";

export type GameEvent =
  | { type: "open"; seat: number; tile: Tile }
  | { type: "play"; seat: number; tile: Tile; side: Side; auto?: boolean }
  | { type: "draw"; seat: number; count: number; auto?: boolean }
  | { type: "pass"; seat: number }
  | { type: "forfeit"; seat: number }
  | { type: "end"; reason: EndReason; winner: number | null; points: number };

export type GameResult = {
  reason: EndReason;
  /** Winning seat, or null when a blocked game ends in a tie. */
  winner: number | null;
  /** Points scored by the winner. */
  points: number;
  /** Pips left in each seat's hand when the game ended. */
  totals: number[];
};

export type Phase = "play" | "finished";

/** Everything every player may see. */
export type TableState = {
  /** Identifies one game: a rematch in the same room starts a new game with a new id. */
  gameId: string;
  /** Players in turn order; a player's index in this list is their seat. */
  players: PlayerSlot[];
  chain: Placed[];
  /** Index in `chain` of the opening tile: tiles before it were played on the left end. */
  origin: number;
  /** Seat whose turn it is. */
  turn: number;
  phase: Phase;
  /** Seats that left the game. */
  forfeited: number[];
  result: GameResult | null;
  /** Bumped whenever a seat's hand changes, so its owner knows when to reload it. */
  handRevs: number[];
  /** Incremented on every state change. */
  seq: number;
  /** Events produced by the last action, for the log. */
  events: GameEvent[];
};

/** Full state, known only to the server: hands and stock are secret. */
export type GameState = TableState & {
  /** Tiles in each seat's hand. */
  hands: Tile[][];
  /** Face-down tiles left to draw, drawn from the front. */
  stock: Tile[];
};

/** What a player receives: the table, hand sizes, and every hand once the game is over. */
export type PublicState = TableState & {
  handSizes: number[];
  stockSize: number;
  revealed: Tile[][] | null;
};

export class GameError extends Error {}

/** Shuffles, deals and plays the opening tile. `random` returns a number in [0, 1). */
export function createGame(userIds: string[], random: () => number, gameId: string): GameState {
  if (userIds.length < MIN_PLAYERS || userIds.length > MAX_PLAYERS) {
    throw new GameError(`Il faut entre ${MIN_PLAYERS} et ${MAX_PLAYERS} joueurs.`);
  }
  const colors = colorsForPlayerCount(userIds.length);
  const players = userIds.map((userId, i) => ({ userId, color: colors[i] }));
  const deck = shuffle(fullSet(), random);
  const size = handSizeFor(players.length);
  const hands = players.map((_, i) => deck.slice(i * size, (i + 1) * size));
  const stock = deck.slice(players.length * size);
  const s: GameState = {
    gameId,
    players,
    chain: [],
    origin: 0,
    turn: 0,
    phase: "play",
    forfeited: [],
    result: null,
    handRevs: players.map(() => 0),
    seq: 0,
    events: [],
    hands,
    stock,
  };

  const { seat, tile } = openingTile(hands);
  s.turn = seat;
  s.hands[seat] = s.hands[seat].filter((t) => !sameTile(t, tile));
  s.handRevs[seat]++;
  s.chain = [{ tile, left: tile[0], right: tile[1] }];
  s.events = [{ type: "open", seat, tile }];
  endTurn(s);
  return s;
}

/** The highest double opens; without any double, the highest tile (most pips, then highest end). */
export function openingTile(hands: Tile[][]): { seat: number; tile: Tile } {
  let best: { seat: number; tile: Tile } | null = null;
  const rank = (t: Tile) => (isDouble(t) ? 1000 : 0) + pips(t) * 10 + t[1];
  hands.forEach((hand, seat) => {
    for (const tile of hand) if (!best || rank(tile) > rank(best.tile)) best = { seat, tile };
  });
  if (!best) throw new GameError("Aucune pièce distribuée.");
  return best;
}

export function currentPlayer(state: TableState): PlayerSlot {
  return state.players[state.turn];
}

export function seatOf(state: TableState, userId: string): number {
  return state.players.findIndex((p) => p.userId === userId);
}

export function isActive(state: TableState, seat: number): boolean {
  return !state.forfeited.includes(seat);
}

export function chainEnds(chain: Placed[]): { left: number; right: number } {
  return { left: chain[0].left, right: chain[chain.length - 1].right };
}

export function fits(tile: Tile, end: number): boolean {
  return tile[0] === end || tile[1] === end;
}

/** Every way the given hand can be played on the chain. */
export function legalMovesFor(hand: Tile[], chain: Placed[]): Move[] {
  const ends = chainEnds(chain);
  const moves: Move[] = [];
  for (const tile of hand) {
    if (fits(tile, ends.left)) moves.push({ tile, side: "left" });
    if (fits(tile, ends.right)) moves.push({ tile, side: "right" });
  }
  return moves;
}

export function legalMoves(state: GameState): Move[] {
  if (state.phase === "finished") return [];
  return legalMovesFor(state.hands[state.turn], state.chain);
}

/** A player may draw only when nothing in their hand can be played and the stock is not empty. */
export function canDraw(hand: Tile[], chain: Placed[], stockSize: number): boolean {
  return stockSize > 0 && legalMovesFor(hand, chain).length === 0;
}

function activeSeats(s: TableState): number[] {
  return s.players.map((_, i) => i).filter((i) => isActive(s, i));
}

function isBlocked(s: GameState): boolean {
  return s.stock.length === 0 && activeSeats(s).every((seat) => legalMovesFor(s.hands[seat], s.chain).length === 0);
}

function finish(s: GameState, reason: EndReason, winner: number | null) {
  const totals = s.hands.map(handTotal);
  let points = 0;
  if (winner !== null && reason !== "forfeit") {
    for (const seat of activeSeats(s)) if (seat !== winner) points += totals[seat] - (reason === "blocked" ? totals[winner] : 0);
  }
  s.phase = "finished";
  s.result = { reason, winner, points, totals };
  s.events.push({ type: "end", reason, winner, points });
}

/** Ends a blocked game: the lowest hand wins, a tie for the lowest has no winner. */
function finishBlocked(s: GameState) {
  const seats = activeSeats(s);
  const totals = seats.map((seat) => handTotal(s.hands[seat]));
  const min = Math.min(...totals);
  const lowest = seats.filter((_, i) => totals[i] === min);
  finish(s, "blocked", lowest.length === 1 ? lowest[0] : null);
}

/**
 * Settles whose turn it is: ends a blocked game, and skips (with a pass) every player who can
 * neither play nor draw, starting with the current one.
 */
function settleTurn(s: GameState) {
  for (let guard = 0; guard <= s.players.length; guard++) {
    if (isBlocked(s)) {
      finishBlocked(s);
      return;
    }
    if (isActive(s, s.turn) && (s.stock.length > 0 || legalMovesFor(s.hands[s.turn], s.chain).length > 0)) return;
    if (isActive(s, s.turn)) s.events.push({ type: "pass", seat: s.turn });
    s.turn = nextSeat(s, s.turn);
  }
}

function nextSeat(s: TableState, from: number): number {
  const n = s.players.length;
  for (let step = 1; step <= n; step++) {
    const seat = (from + step) % n;
    if (isActive(s, seat)) return seat;
  }
  return from;
}

/** Passes the turn to the next active player, then settles it. */
function endTurn(s: GameState) {
  s.turn = nextSeat(s, s.turn);
  settleTurn(s);
}

function assertTurn(state: GameState, userId: string | null) {
  if (state.phase === "finished") throw new GameError("La partie est terminée.");
  if (userId !== null && currentPlayer(state).userId !== userId) throw new GameError("Ce n'est pas ton tour.");
}

/** Starts a new action: a copy with its own events. */
function begin(state: GameState): GameState {
  const s = structuredClone(state);
  s.seq++;
  s.events = [];
  return s;
}

function applyPlay(s: GameState, tile: Tile, side: Side, auto: boolean) {
  const seat = s.turn;
  const hand = s.hands[seat];
  const index = hand.findIndex((t) => sameTile(t, tile));
  if (index < 0) throw new GameError("Tu n'as pas cette pièce.");
  const ends = chainEnds(s.chain);
  const end = side === "left" ? ends.left : ends.right;
  if (!fits(tile, end)) throw new GameError("Cette pièce ne va pas de ce côté.");

  const other = tile[0] === end ? tile[1] : tile[0];
  if (side === "left") {
    s.chain.unshift({ tile, left: other, right: end });
    s.origin++;
  } else {
    s.chain.push({ tile, left: end, right: other });
  }
  hand.splice(index, 1);
  s.handRevs[seat]++;
  s.events.push({ type: "play", seat, tile, side, ...(auto ? { auto } : {}) });

  if (hand.length === 0) finish(s, "domino", seat);
  else endTurn(s);
}

function applyDraw(s: GameState, auto: boolean) {
  const seat = s.turn;
  if (legalMovesFor(s.hands[seat], s.chain).length > 0) throw new GameError("Tu peux déjà poser une pièce.");
  const tile = s.stock.shift();
  if (!tile) throw new GameError("La pioche est vide.");
  s.hands[seat].push(tile);
  s.handRevs[seat]++;
  const last = s.events[s.events.length - 1];
  if (last?.type === "draw" && last.seat === seat) last.count++;
  else s.events.push({ type: "draw", seat, count: 1, ...(auto ? { auto } : {}) });
  // Still stuck with an empty stock: the player passes.
  settleTurn(s);
}

/** Plays a tile from the current player's hand on one end of the chain. */
export function playTile(state: GameState, tile: Tile, side: Side, userId: string | null): GameState {
  assertTurn(state, userId);
  const s = begin(state);
  applyPlay(s, tile, side, false);
  return s;
}

/** Draws one tile from the stock (only when the current player cannot play). */
export function drawTile(state: GameState, userId: string | null): GameState {
  assertTurn(state, userId);
  const s = begin(state);
  applyDraw(s, false);
  return s;
}

/** Removes a player from the game (they left). Their tiles go back under the stock. */
export function forfeit(state: GameState, seat: number): GameState {
  if (state.phase === "finished" || !isActive(state, seat)) return state;
  const s = begin(state);
  s.events.push({ type: "forfeit", seat });
  s.forfeited.push(seat);
  s.stock.push(...s.hands[seat]);
  s.hands[seat] = [];
  s.handRevs[seat]++;
  const remaining = activeSeats(s);
  if (remaining.length <= 1) {
    finish(s, "forfeit", remaining[0] ?? null);
    return s;
  }
  if (s.turn === seat) endTurn(s);
  return s;
}

/** Picks the move that gets rid of the most pips, preferring doubles (harder to place later). */
export function chooseAutoMove(state: GameState): Move {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new GameError("Aucun coup possible.");
  const score = (m: Move) => pips(m.tile) * 2 + (isDouble(m.tile) ? 1 : 0);
  return moves.reduce((best, m) => (score(m) > score(best) ? m : best), moves[0]);
}

/** Plays the current player's whole turn (used when their timer runs out): draw as needed, then play. */
export function autoPlay(state: GameState): GameState {
  if (state.phase === "finished") return state;
  const s = begin(state);
  const seat = s.turn;
  while (s.phase === "play" && s.turn === seat && legalMoves(s).length === 0 && s.stock.length > 0) {
    applyDraw(s, true);
  }
  if (s.phase === "play" && s.turn === seat) {
    const move = chooseAutoMove(s);
    applyPlay(s, move.tile, move.side, true);
  }
  return s;
}

/** Final order: the winner, then the others from the fewest pips left, then players who left. */
export function standings(state: TableState): number[] {
  const result = state.result;
  if (!result) return [];
  const active = state.players
    .map((_, seat) => seat)
    .filter((seat) => isActive(state, seat) && seat !== result.winner)
    .sort((a, b) => result.totals[a] - result.totals[b]);
  const head = result.winner !== null ? [result.winner] : [];
  return [...head, ...active, ...[...state.forfeited].reverse()];
}

/** The state without the secrets. Hands are revealed once the game is over. */
export function publicView(state: GameState): PublicState {
  const { hands, stock, ...table } = state;
  return {
    ...structuredClone(table),
    handSizes: hands.map((h) => h.length),
    stockSize: stock.length,
    revealed: state.phase === "finished" ? structuredClone(hands) : null,
  };
}

export function handOf(state: GameState, userId: string): Tile[] | null {
  const seat = seatOf(state, userId);
  return seat < 0 ? null : structuredClone(state.hands[seat]);
}
