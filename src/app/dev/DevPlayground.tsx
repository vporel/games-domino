"use client";

import { useState } from "react";
import Logo from "@/components/Logo";
import GameView from "@/components/game/GameView";
import Lobby from "@/components/room/Lobby";
import { TURN_DURATION_MS } from "@/game/constants";
import { GameError, GameState, autoPlay, createGame, currentPlayer, drawTile, playTile, publicView } from "@/game/engine";
import { parseTileKey } from "@/game/tiles";
import type { GameRow, RoomPlayer } from "@/lib/types";

const PSEUDOS = ["alice", "bob", "chloe", "dimitri"];

function makePlayers(n: number): RoomPlayer[] {
  return PSEUDOS.slice(0, n).map((pseudo, i) => ({ userId: `u${i}`, pseudo, joinedAt: new Date().toISOString(), leftAt: null }));
}

function newGame(n: number): GameState {
  return createGame(
    makePlayers(n).map((p) => p.userId),
    Math.random,
    `g${Date.now()}`,
  );
}

/** Plays a few automatic turns, to preview a busy table. */
function midGame(n: number): GameState {
  let s = newGame(n);
  for (let i = 0; i < 12 && s.phase === "play"; i++) s = autoPlay(s);
  return s.phase === "play" ? s : midGame(n);
}

type Local = { state: GameState; row: GameRow };

function local(state: GameState, version: number): Local {
  const turnDeadline = state.phase === "finished" ? null : new Date(Date.now() + TURN_DURATION_MS).toISOString();
  return { state, row: { state: publicView(state), version, turnDeadline } };
}

export default function DevPlayground() {
  const [view, setView] = useState<"lobby" | "game">("game");
  const [count, setCount] = useState(3);
  const [game, setGame] = useState<Local>(() => local(midGame(3), 0));
  const [lobbyCount, setLobbyCount] = useState(1);
  const players = makePlayers(count);

  function reset(n: number, mid: boolean) {
    setCount(n);
    setGame(local(mid ? midGame(n) : newGame(n), 0));
  }

  async function apply(fn: (s: GameState) => GameState): Promise<string | null> {
    try {
      const next = fn(game.state);
      if (next !== game.state) setGame(local(next, game.row.version + 1));
      return null;
    } catch (e) {
      return e instanceof GameError ? e.message : String(e);
    }
  }

  // Hot seat: you always play the current seat, and see its hand.
  const me = currentPlayer(game.state).userId;
  const mySeat = game.state.turn;

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="w-full max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-4">
        <Logo />
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-[var(--yellow-soft)] px-3 py-1 font-bold">Bac à sable (dev)</span>
          <button className={`btn !py-1.5 !px-3 ${view === "lobby" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("lobby")}>
            Salle
          </button>
          <button className={`btn !py-1.5 !px-3 ${view === "game" ? "btn-primary" : "btn-ghost"}`} onClick={() => setView("game")}>
            Partie
          </button>
          {view === "game" &&
            [2, 3, 4].map((n) => (
              <button key={n} className="btn btn-ghost !py-1.5 !px-3" onClick={() => reset(n, false)}>
                {n}J
              </button>
            ))}
          {view === "game" && (
            <button className="btn btn-ghost !py-1.5 !px-3" onClick={() => reset(count, true)}>
              Milieu de partie
            </button>
          )}
          {view === "lobby" && (
            <button className="btn btn-ghost !py-1.5 !px-3" onClick={() => setLobbyCount((c) => (c % 4) + 1)}>
              Joueurs : {lobbyCount}
            </button>
          )}
        </div>
      </header>
      <main className="flex-1">
        {view === "lobby" ? (
          <Lobby
            code="042917"
            players={makePlayers(lobbyCount)}
            meId="u0"
            hostId="u0"
            online={new Set(["u0", "u1"])}
            onStart={async () => {
              reset(Math.max(2, lobbyCount), false);
              setView("game");
              return null;
            }}
            onKick={async () => {
              setLobbyCount((c) => Math.max(1, c - 1));
              return null;
            }}
            onLeave={async () => setLobbyCount(1)}
          />
        ) : (
          <GameView
            key={game.state.gameId}
            code="042917"
            game={game.row}
            hand={game.state.hands[mySeat]}
            players={players}
            meId={me}
            hostId="u0"
            online={new Set(players.map((p) => p.userId))}
            clockOffset={0}
            onPlay={(key, side) => apply((s) => playTile(s, parseTileKey(key)!, side, currentPlayer(s).userId))}
            onDraw={() => apply((s) => drawTile(s, currentPlayer(s).userId))}
            onExpire={() => void apply(autoPlay)}
            onLeave={async () => reset(count, false)}
            onRematch={async () => {
              reset(count, false);
              return null;
            }}
          />
        )}
      </main>
    </div>
  );
}
