import type { Color } from "./constants";
import type { GameEvent } from "./engine";
import type { Tile } from "./tiles";

export type LogTone = "info" | "good" | "bad";
export type LogLine = { text: string; color: Color | null; tone: LogTone };
export type SeatInfo = { name: string; color: Color };

export function tileLabel(tile: Tile): string {
  return `${tile[0]}|${tile[1]}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n > 1 ? "s" : ""}`;
}

/** Human readable log lines (French) for the events of one action. */
export function describeEvents(events: GameEvent[], seats: SeatInfo[]): LogLine[] {
  const n = (seat: number) => seats[seat]?.name ?? "?";
  const c = (seat: number) => seats[seat]?.color ?? null;
  const lines: LogLine[] = [];
  for (const e of events) {
    switch (e.type) {
      case "open":
        lines.push({ color: c(e.seat), tone: "info", text: `${n(e.seat)} ouvre avec le ${tileLabel(e.tile)}` });
        break;
      case "play":
        lines.push({ color: c(e.seat), tone: "info", text: `${n(e.seat)} pose le ${tileLabel(e.tile)}${e.auto ? " (auto)" : ""}` });
        break;
      case "draw":
        lines.push({ color: c(e.seat), tone: "info", text: `${n(e.seat)} pioche ${plural(e.count, "pièce")}${e.auto ? " (auto)" : ""}` });
        break;
      case "pass":
        lines.push({ color: c(e.seat), tone: "bad", text: `${n(e.seat)} passe` });
        break;
      case "forfeit":
        lines.push({ color: c(e.seat), tone: "bad", text: `${n(e.seat)} a quitté la partie` });
        break;
      case "end":
        if (e.winner === null) {
          lines.push({ color: null, tone: "bad", text: "Jeu bloqué : égalité, pas de gagnant" });
        } else if (e.reason === "domino") {
          lines.push({ color: c(e.winner), tone: "good", text: `Domino ! ${n(e.winner)} gagne ${plural(e.points, "point")} 🏆` });
        } else if (e.reason === "blocked") {
          lines.push({ color: c(e.winner), tone: "good", text: `Jeu bloqué : ${n(e.winner)} gagne ${plural(e.points, "point")} 🏆` });
        } else {
          lines.push({ color: c(e.winner), tone: "good", text: `${n(e.winner)} gagne par abandon 🏆` });
        }
        break;
    }
  }
  return lines;
}
