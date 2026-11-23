"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Color, COLOR_LABELS } from "@/game/constants";
import type { SeatInfo } from "@/game/describe";
import { Move, PublicState, Side, canDraw, currentPlayer, isActive, legalMovesFor, standings } from "@/game/engine";
import { Tile, handTotal, sameTile, tileKey } from "@/game/tiles";
import type { GameRow, RoomPlayer } from "@/lib/types";
import { TileIcon } from "./DominoTile";
import Table from "./Table";
import TurnTimer from "./TurnTimer";
import { useGameLog } from "./useGameLog";

const CSS_COLOR: Record<Color, string> = {
  red: "var(--red)",
  green: "var(--green)",
  yellow: "var(--yellow)",
  blue: "var(--blue)",
};

export type GameViewProps = {
  code: string;
  game: GameRow;
  /** The viewer's tiles, or null while loading or for a spectator. */
  hand: Tile[] | null;
  players: RoomPlayer[];
  meId: string;
  hostId: string;
  online: Set<string>;
  clockOffset: number;
  onPlay: (tile: string, side: Side) => Promise<string | null>;
  onDraw: () => Promise<string | null>;
  onExpire: () => void;
  onLeave: () => Promise<void>;
  onRematch: () => Promise<string | null>;
};

/** Chain indices of the tiles placed by the last action. */
function recentIndices(state: PublicState): number[] {
  const out: number[] = [];
  for (const e of state.events) {
    if (e.type !== "play" && e.type !== "open") continue;
    const i = state.chain.findIndex((p) => sameTile(p.tile, e.tile));
    if (i >= 0) out.push(i);
  }
  return out;
}

export default function GameView(props: GameViewProps) {
  const { game, hand, players, meId, hostId, online, clockOffset } = props;
  const state = game.state;

  const seats: SeatInfo[] = useMemo(
    () => state.players.map((slot) => ({ name: players.find((p) => p.userId === slot.userId)?.pseudo ?? "?", color: slot.color })),
    [state.players, players],
  );
  const log = useGameLog(state, seats);

  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const finished = state.phase === "finished";
  const current = currentPlayer(state);
  const mySeat = state.players.findIndex((p) => p.userId === meId);
  const myTurn = !finished && mySeat >= 0 && current.userId === meId && isActive(state, mySeat);
  const canAct = myTurn && !pending && hand !== null;
  const moves: Move[] = canAct ? legalMovesFor(hand, state.chain) : [];
  const mayDraw = canAct && canDraw(hand, state.chain, state.stockSize);
  const selectedMoves = selected ? moves.filter((m) => tileKey(m.tile) === selected) : [];

  // A selection only lives during the turn it was made in.
  useEffect(() => setSelected(null), [game.version]);

  const wasMyTurn = useRef(myTurn);
  useEffect(() => {
    if (myTurn && !wasMyTurn.current && typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(60);
    wasMyTurn.current = myTurn;
  }, [myTurn]);

  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 3000);
    return () => clearTimeout(id);
  }, [error]);

  async function run(fn: () => Promise<string | null>) {
    setPending(true);
    try {
      const err = await fn();
      if (err) setError(err);
    } finally {
      setPending(false);
    }
  }

  function play(key: string, side: Side) {
    setSelected(null);
    void run(() => props.onPlay(key, side));
  }

  function pickTile(tile: Tile) {
    const key = tileKey(tile);
    const options = moves.filter((m) => sameTile(m.tile, tile));
    if (options.length === 0) return;
    if (options.length === 1) play(key, options[0].side);
    else setSelected(selected === key ? null : key);
  }

  // Stagger timeout calls between clients: the current player first, then the others by seat.
  const expireDelay = myTurn ? 600 : 1500 + Math.max(0, mySeat) * 900;

  const statusText = finished
    ? "Partie terminée"
    : myTurn
      ? selected
        ? "Choisis un côté sur la table"
        : moves.length > 0
          ? "À toi ! Pose une pièce"
          : mayDraw
            ? "Aucune pièce ne va : pioche"
            : "À toi…"
      : `Au tour de ${seats[state.turn]?.name ?? "?"}`;

  return (
    <div className="w-full max-w-6xl mx-auto px-3 sm:px-4 pb-8 flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-start">
      <div className="w-full lg:flex-1 flex flex-col gap-3 min-w-0">
        <Table
          chain={state.chain}
          origin={state.origin}
          recent={recentIndices(state)}
          targets={selectedMoves.map((m) => m.side)}
          onTarget={(side) => selected && play(selected, side)}
        />

        {mySeat >= 0 && isActive(state, mySeat) && !finished && (
          <section className="card p-3 sm:p-4" aria-label="Ta main">
            <div className="flex items-center justify-between gap-3 mb-2 px-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted">
                Ta main{hand ? ` · ${hand.length} pièce${hand.length > 1 ? "s" : ""} · ${handTotal(hand)} pts` : ""}
              </h2>
              {mayDraw && (
                <button className="btn btn-primary !py-2 !px-4 text-sm" disabled={pending} onClick={() => void run(props.onDraw)}>
                  Piocher
                </button>
              )}
            </div>
            {hand === null ? (
              <p className="text-muted text-sm px-1 py-4">Chargement de ta main…</p>
            ) : (
              <ul className="flex flex-wrap gap-2 sm:gap-3 justify-center">
                {hand.map((tile) => {
                  const key = tileKey(tile);
                  const playable = moves.some((m) => sameTile(m.tile, tile));
                  const isSelected = selected === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        className={`hand-tile rounded-lg ${playable ? "hand-tile-playable" : ""} ${isSelected ? "hand-tile-selected" : ""} ${
                          myTurn && !playable ? "opacity-45" : ""
                        }`}
                        disabled={!playable}
                        aria-pressed={isSelected}
                        aria-label={`Pièce ${tile[0]}|${tile[1]}${playable ? "" : " (ne va pas)"}`}
                        onClick={() => pickTile(tile)}
                      >
                        <TileIcon a={tile[0]} b={tile[1]} size={34} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      <aside className="w-full lg:w-80 flex flex-col gap-3">
        <div className="card p-4 flex items-center gap-4">
          <div className="w-12 shrink-0 flex flex-col items-center" title="Pièces dans la pioche">
            <span className="relative w-7 h-12">
              <span className="absolute inset-0 translate-x-1 -translate-y-1 rounded-md bg-[#3a2e22] opacity-60" />
              <span className="absolute inset-0 rounded-md bg-[#3a2e22] grid place-items-center font-display font-bold text-sm text-[#fffdf8] tabular-nums">
                {state.stockSize}
              </span>
            </span>
            <span className="text-[10px] font-bold uppercase tracking-wide text-muted mt-1">Pioche</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: CSS_COLOR[current.color] }} />
              {finished ? "Fin" : COLOR_LABELS[current.color]}
            </div>
            <p className="font-display text-xl font-bold leading-tight mt-0.5">{statusText}</p>
            {error && <p className="text-sm text-red font-semibold mt-1">{error}</p>}
          </div>
          {!finished && (
            <TurnTimer
              key={`${game.version}`}
              deadline={game.turnDeadline}
              clockOffset={clockOffset}
              color={CSS_COLOR[current.color]}
              expireDelayMs={expireDelay}
              onExpired={props.onExpire}
            />
          )}
        </div>

        <ul className="card p-2 flex flex-col">
          {state.players.map((slot, seat) => {
            const p = players.find((x) => x.userId === slot.userId);
            const left = !isActive(state, seat);
            const isTurn = !finished && state.turn === seat;
            const count = state.handSizes[seat] ?? 0;
            return (
              <li key={slot.userId} className={`flex items-center gap-3 rounded-lg px-3 py-2 transition ${isTurn ? "bg-surface-2" : ""}`}>
                <span
                  className="relative w-8 h-8 rounded-full grid place-items-center text-white font-bold text-sm uppercase shrink-0"
                  style={{ background: CSS_COLOR[slot.color] }}
                >
                  {(p?.pseudo ?? "?")[0]}
                  <span
                    className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[var(--surface)] ${
                      online.has(slot.userId) ? "bg-green" : "bg-[var(--border)]"
                    }`}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold truncate ${left ? "line-through text-muted" : ""}`}>
                    {p?.pseudo ?? "?"}
                    {slot.userId === meId && <span className="text-muted font-semibold"> (toi)</span>}
                  </p>
                  <p className="text-xs text-muted">{left ? "A quitté" : `${count} pièce${count > 1 ? "s" : ""}`}</p>
                </div>
                {!left && (
                  <span className="flex -space-x-2" aria-hidden>
                    {Array.from({ length: Math.min(count, 7) }, (_, i) => (
                      <TileIcon key={i} a={0} b={0} size={9} back />
                    ))}
                  </span>
                )}
                {isTurn && <span className="text-xs font-bold text-primary">joue</span>}
                {finished && state.result?.winner === seat && <span aria-label="Gagnant">🏆</span>}
              </li>
            );
          })}
        </ul>

        <div className="card p-3 hidden sm:block">
          <p className="text-xs font-bold uppercase tracking-wide text-muted px-1 mb-1">Journal</p>
          <ul className="max-h-48 overflow-y-auto flex flex-col gap-1 text-sm">
            {log.length === 0 && <li className="text-muted px-1">La partie commence !</li>}
            {log.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color ? CSS_COLOR[l.color] : "var(--muted)" }} />
                <span className={l.tone === "good" ? "font-bold" : l.tone === "bad" ? "text-muted" : ""}>{l.text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs text-muted">
            Salle <span className="font-bold tabular-nums tracking-wider">{props.code}</span>
          </span>
          {!finished &&
            (confirmLeave ? (
              <span className="flex items-center gap-2">
                <span className="text-xs font-semibold">Abandonner ?</span>
                <button className="btn btn-primary !py-1.5 !px-3 text-sm" onClick={() => void props.onLeave()}>
                  Oui
                </button>
                <button className="btn btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setConfirmLeave(false)}>
                  Non
                </button>
              </span>
            ) : (
              <button className="btn btn-ghost !py-1.5 !px-3 text-sm" onClick={() => setConfirmLeave(true)}>
                Quitter la partie
              </button>
            ))}
        </div>
      </aside>

      {finished && (
        <Results state={state} seats={seats} mySeat={mySeat} isHost={hostId === meId} onRematch={props.onRematch} onLeave={props.onLeave} />
      )}
    </div>
  );
}

function resultTitle(state: PublicState, seats: SeatInfo[]): string {
  const r = state.result;
  if (!r || r.winner === null) return "Jeu bloqué : égalité, personne ne gagne.";
  const name = seats[r.winner]?.name ?? "?";
  const pts = `${r.points} point${r.points > 1 ? "s" : ""}`;
  if (r.reason === "domino") return `${name} a posé toutes ses pièces et marque ${pts}.`;
  if (r.reason === "blocked") return `Jeu bloqué : ${name} a le moins de points et marque ${pts}.`;
  return `${name} gagne par abandon.`;
}

function Results({
  state,
  seats,
  mySeat,
  isHost,
  onRematch,
  onLeave,
}: {
  state: PublicState;
  seats: SeatInfo[];
  mySeat: number;
  isHost: boolean;
  onRematch: () => Promise<string | null>;
  onLeave: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const medals = ["🥇", "🥈", "🥉", "4"];
  const winner = state.result?.winner ?? null;
  const won = mySeat >= 0 && winner === mySeat;

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/45 backdrop-blur-sm px-4">
      <div className="card w-full max-w-md p-6 pop-in text-center shadow-2xl max-h-[92dvh] overflow-y-auto">
        <p className="text-5xl">{won ? "🎉" : "🏁"}</p>
        <h2 className="font-display text-3xl font-bold mt-2">{won ? "Victoire !" : "Partie terminée"}</h2>
        <p className="text-muted mt-1">{resultTitle(state, seats)}</p>
        <ol className="mt-5 flex flex-col gap-2 text-left">
          {standings(state).map((seat, i) => {
            const left = !isActive(state, seat);
            const tiles = state.revealed?.[seat] ?? [];
            return (
              <li key={seat} className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="flex items-center gap-3">
                  <span className="w-7 text-center text-xl font-bold">{winner === null ? "–" : medals[i]}</span>
                  <span className="w-3 h-3 rounded-full" style={{ background: CSS_COLOR[seats[seat].color] }} />
                  <span className="font-bold flex-1 truncate">
                    {seats[seat].name}
                    {seat === mySeat && <span className="text-muted font-semibold"> (toi)</span>}
                  </span>
                  <span className="text-xs text-muted tabular-nums">
                    {left ? "abandon" : seat === winner ? `+${state.result?.points ?? 0} pts` : `${state.result?.totals[seat] ?? 0} pts en main`}
                  </span>
                </div>
                {!left && tiles.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2 pl-10" aria-label="Pièces restantes">
                    {tiles.map((t) => (
                      <TileIcon key={tileKey(t)} a={t[0]} b={t[1]} size={14} />
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        {error && <p className="text-sm text-red font-semibold mt-3">{error}</p>}
        <div className="mt-6 flex flex-col gap-2">
          {isHost ? (
            <button
              className="btn btn-primary w-full"
              disabled={pending}
              onClick={async () => {
                setPending(true);
                const err = await onRematch();
                if (err) setError(err);
                setPending(false);
              }}
            >
              Rejouer avec la même salle
            </button>
          ) : (
            <p className="text-sm text-muted">L&apos;hôte peut relancer une partie dans cette salle.</p>
          )}
          <button className="btn btn-ghost w-full" onClick={() => void onLeave()}>
            Retour à l&apos;accueil
          </button>
        </div>
      </div>
    </div>
  );
}
