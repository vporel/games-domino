import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GameState, publicView } from "@/game/engine";
import { chainOf, table } from "@/game/test-utils";
import type { RoomPlayer } from "@/lib/types";
import GameView, { GameViewProps } from "./GameView";

const players: RoomPlayer[] = [
  { userId: "u0", pseudo: "alice", joinedAt: "", leftAt: null },
  { userId: "u1", pseudo: "bob", joinedAt: "", leftAt: null },
];

const noop = async () => null;

function render(state: GameState, meId: string, hand = state.hands[state.players.findIndex((p) => p.userId === meId)] ?? null) {
  const props: GameViewProps = {
    code: "123456",
    game: { state: publicView(state), version: 3, turnDeadline: null },
    hand,
    players,
    meId,
    hostId: "u0",
    online: new Set(),
    clockOffset: 0,
    onPlay: noop,
    onDraw: noop,
    onExpire: () => {},
    onLeave: async () => {},
    onRematch: noop,
  };
  return renderToStaticMarkup(<GameView {...props} />);
}

const playing = () =>
  table({
    hands: [
      [[3, 6], [1, 1]],
      [[0, 0], [2, 2], [5, 5]],
    ],
    chain: chainOf([4, 6]),
    stock: [[0, 1]],
  });

describe("GameView", () => {
  it("lets the current player play the tiles that fit, and only those", () => {
    const html = render(playing(), "u0");
    expect(html).toContain("À toi ! Pose une pièce");
    expect(html).toContain('aria-label="Pièce 3|6"');
    expect(html).toContain('aria-label="Pièce 1|1 (ne va pas)"');
    expect(html).not.toContain("Piocher");
  });

  it("offers to draw when nothing fits", () => {
    const s = playing();
    s.hands[0] = [[1, 1]];
    const html = render(s, "u0");
    expect(html).toContain("Aucune pièce ne va : pioche");
    expect(html).toContain("Piocher");
  });

  it("shows the opponents' tile counts, never their tiles", () => {
    const html = render(playing(), "u0");
    expect(html).not.toContain("Au tour de");
    expect(html).toContain("3 pièces");
    expect(html).not.toContain("Pièce 5|5");
    const other = render(playing(), "u1");
    expect(other).toContain("Au tour de alice");
    expect(other).not.toContain("Pièce 3|6");
  });

  it("reveals every hand and the score at the end", () => {
    const s = table({ hands: [[], [[0, 0], [5, 6]]], chain: chainOf([4, 6]), phase: "finished" });
    s.result = { reason: "domino", winner: 0, points: 11, totals: [0, 11] };
    const html = render(s, "u1", []);
    expect(html).toContain("alice a posé toutes ses pièces et marque 11 points.");
    expect(html).toContain("+11 pts");
    expect(html).toContain("11 pts en main");
    expect(html).toContain("L&#x27;hôte peut relancer");
  });
});
