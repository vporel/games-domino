import { describe, expect, it } from "vitest";
import { describeEvents } from "@/game/describe";
import { createGame, publicView } from "@/game/engine";
import { seeded } from "@/game/test-utils";
import { handIsStale, newerGame, newerHand } from "./game-row";
import { normalizePseudo, pseudoError, pseudoToEmail } from "./pseudo";
import { generateRoomCode, normalizeRoomCode, ROOM_CODE_PATTERN } from "./room-code";
import type { GameRow, Hand } from "./types";

describe("pseudo", () => {
  it("normalizes and validates", () => {
    expect(normalizePseudo("  Bob_42 ")).toBe("bob_42");
    expect(pseudoError("bo")).not.toBeNull();
    expect(pseudoError("a".repeat(21))).not.toBeNull();
    expect(pseudoError("bob-42")).not.toBeNull();
    expect(pseudoError("bob_42")).toBeNull();
  });
  it("builds the technical email shared with Ludo", () => {
    expect(pseudoToEmail("bob")).toBe("bob@user.games.vporel.com");
  });
});

describe("room code", () => {
  it("keeps 6 digits", () => {
    expect(normalizeRoomCode(" 12 34-56 7")).toBe("123456");
  });
  it("pads generated codes", () => {
    expect(generateRoomCode(() => 42)).toBe("000042");
    expect(ROOM_CODE_PATTERN.test(generateRoomCode(() => 999_999))).toBe(true);
  });
});

const game = (gameId: string) => createGame(["a", "b"], seeded(1), gameId);
const row = (version: number, gameId = "g1"): GameRow => ({ state: publicView(game(gameId)), version, turnDeadline: null });

describe("newerGame", () => {
  it("keeps the highest version of the same game", () => {
    expect(newerGame(row(3), row(2))?.version).toBe(3);
    expect(newerGame(row(2), row(3))?.version).toBe(3);
  });
  it("replaces a previous game even with a lower version", () => {
    expect(newerGame(row(40, "g1"), row(0, "g2"))?.state.gameId).toBe("g2");
  });
  it("handles nulls", () => {
    expect(newerGame(null, row(1))?.version).toBe(1);
    expect(newerGame(row(1), null)?.version).toBe(1);
  });
});

describe("hands", () => {
  const hand = (rev: number, gameId = "g1"): Hand => ({ tiles: [], rev, gameId });

  it("keeps the newest revision of the same game, or the hand of a new game", () => {
    expect(newerHand(hand(3), hand(2))?.rev).toBe(3);
    expect(newerHand(hand(2), hand(3))?.rev).toBe(3);
    expect(newerHand(hand(9, "g1"), hand(0, "g2"))?.gameId).toBe("g2");
    expect(newerHand(null, hand(1))?.rev).toBe(1);
    expect(newerHand(hand(1), null)?.rev).toBe(1);
  });

  it("is stale when the game reports a newer revision for my seat", () => {
    const g = row(1);
    const seat = 0;
    const rev = g.state.handRevs[seat];
    expect(handIsStale(g, hand(rev), "a")).toBe(false);
    expect(handIsStale(g, hand(rev - 1), "a")).toBe(true);
    expect(handIsStale(g, null, "a")).toBe(true);
    expect(handIsStale(g, hand(rev, "old"), "a")).toBe(true);
  });

  it("is never stale for a spectator or without a game", () => {
    expect(handIsStale(row(1), null, "stranger")).toBe(false);
    expect(handIsStale(null, null, "a")).toBe(false);
  });
});

describe("describeEvents", () => {
  const seats = [
    { name: "alice", color: "red" as const },
    { name: "bob", color: "yellow" as const },
  ];

  it("writes French log lines", () => {
    const lines = describeEvents(
      [
        { type: "open", seat: 0, tile: [6, 6] },
        { type: "draw", seat: 1, count: 1 },
        { type: "draw", seat: 1, count: 3, auto: true },
        { type: "play", seat: 1, tile: [2, 6], side: "right", auto: true },
        { type: "pass", seat: 0 },
        { type: "forfeit", seat: 1 },
      ],
      seats,
    );
    expect(lines.map((l) => l.text)).toEqual([
      "alice ouvre avec le 6|6",
      "bob pioche 1 pièce",
      "bob pioche 3 pièces (auto)",
      "bob pose le 2|6 (auto)",
      "alice passe",
      "bob a quitté la partie",
    ]);
    expect(lines[0].color).toBe("red");
  });

  it("announces how the game ended", () => {
    const end = (reason: "domino" | "blocked" | "forfeit", winner: number | null, points: number) =>
      describeEvents([{ type: "end", reason, winner, points }], seats)[0].text;
    expect(end("domino", 0, 12)).toBe("Domino ! alice gagne 12 points 🏆");
    expect(end("blocked", 1, 1)).toBe("Jeu bloqué : bob gagne 1 point 🏆");
    expect(end("blocked", null, 0)).toBe("Jeu bloqué : égalité, pas de gagnant");
    expect(end("forfeit", 0, 0)).toBe("alice gagne par abandon 🏆");
  });
});
