"use client";

import { useMemo } from "react";
import type { Placed, Side } from "@/game/engine";
import { layoutChain, Rect } from "@/game/layout";
import { tileKey } from "@/game/tiles";
import { DominoFace } from "./DominoTile";

// The table always uses the light palette, even in dark mode, like a physical table.
const FELT = "#2b7a52";
const FELT_DARK = "#1f5e3e";
const FRAME = "#3a2e22";

/** Minimum visible area (half-tile units) so a short chain is not blown up. */
const MIN_HALF_WIDTH = 9;
const MIN_HALF_HEIGHT = 5.5;
const PADDING = 1.2;

function transformFor(r: Rect): string {
  return `translate(${r.x} ${r.y})${r.vertical ? "" : " rotate(-90)"}`;
}

type Props = {
  chain: Placed[];
  origin: number;
  /** Chain indices of the tiles played by the last action, outlined. */
  recent: number[];
  /** Ends where the selected tile can go, shown as clickable slots labeled with the end's value. */
  targets: Side[];
  onTarget?: (side: Side) => void;
};

export default function Table({ chain, origin, recent, targets, onTarget }: Props) {
  const layout = useMemo(() => layoutChain(chain, origin), [chain, origin]);
  const { bounds } = layout;
  const minX = Math.min(bounds.minX - PADDING, -MIN_HALF_WIDTH);
  const maxX = Math.max(bounds.maxX + PADDING, MIN_HALF_WIDTH);
  const minY = Math.min(bounds.minY - PADDING, -MIN_HALF_HEIGHT);
  const maxY = Math.max(bounds.maxY + PADDING, MIN_HALF_HEIGHT);
  const ends = { left: chain[0].left, right: chain[chain.length - 1].right };

  return (
    <div
      className="relative w-full rounded-2xl p-2 sm:p-3 shadow-[var(--shadow)]"
      style={{ background: FRAME }}
    >
      <svg
        viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`}
        className="block w-full h-auto rounded-xl max-h-[min(62dvh,640px)]"
        style={{ background: `radial-gradient(ellipse at center, ${FELT} 0%, ${FELT_DARK} 100%)` }}
        role="img"
        aria-label={`Table : ${chain.length} pièce${chain.length > 1 ? "s" : ""} posée${chain.length > 1 ? "s" : ""}, extrémités ${ends.left} et ${ends.right}`}
      >
        {layout.tiles.map((t) => {
          const placed = chain[t.index];
          return (
            <g key={tileKey(placed.tile)} transform={transformFor(t)}>
              <g className="tile-pop">
                <DominoFace a={t.a} b={t.b} />
                {recent.includes(t.index) && (
                  <rect x={-0.53} y={-1.03} width={1.06} height={2.06} rx={0.18} fill="none" stroke="#f2b200" strokeWidth={0.07} />
                )}
              </g>
            </g>
          );
        })}

        {targets.map((side) => {
          const g = layout.ghosts[side];
          return (
            <g
              key={side}
              transform={transformFor(g)}
              className="ghost-slot"
              role="button"
              tabIndex={0}
              aria-label={`Poser du côté du ${ends[side]}`}
              onClick={() => onTarget?.(side)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTarget?.(side);
                }
              }}
            >
              <rect
                x={-0.47}
                y={-0.97}
                width={0.94}
                height={1.94}
                rx={0.14}
                fill="rgb(255 253 248 / 0.18)"
                stroke="#fffdf8"
                strokeWidth={0.06}
                strokeDasharray="0.16 0.1"
              />
              <text
                x={0}
                y={0}
                transform={g.vertical ? undefined : "rotate(90)"}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={0.6}
                fontWeight={700}
                fill="#fffdf8"
              >
                {ends[side]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
