import { memo } from "react";

// Tiles always use the light palette, even in dark mode, like a physical set.
export const TILE_FACE = "#fffdf8";
export const TILE_EDGE = "#d8ccb6";
export const TILE_LINE = "#cbbda4";
export const PIP = "#2a2118";

/** Pip centers in a unit cell, on a 3x3 grid (offsets from the cell center). */
const PIPS: Record<number, [number, number][]> = {
  0: [],
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
};

function Half({ value, cy }: { value: number; cy: number }) {
  return (
    <>
      {(PIPS[value] ?? []).map(([dx, dy], i) => (
        <circle key={i} cx={dx * 0.26} cy={cy + dy * 0.26} r={0.095} fill={PIP} />
      ))}
    </>
  );
}

/**
 * A tile drawn in a 1x2 box centered on (0, 0), `a` on top: callers place it with a transform
 * (rotate -90° to lay it horizontally with `a` on the left).
 */
function DominoFaceBase({ a, b }: { a: number; b: number }) {
  return (
    <>
      <rect x={-0.47} y={-0.94} width={0.94} height={1.94} rx={0.14} fill="rgb(0 0 0 / 0.22)" />
      <rect x={-0.47} y={-0.97} width={0.94} height={1.94} rx={0.14} fill={TILE_FACE} stroke={TILE_EDGE} strokeWidth={0.03} />
      <line x1={-0.32} x2={0.32} y1={0} y2={0} stroke={TILE_LINE} strokeWidth={0.04} strokeLinecap="round" />
      <Half value={a} cy={-0.5} />
      <Half value={b} cy={0.5} />
    </>
  );
}

export const DominoFace = memo(DominoFaceBase);

/** Face-down tile, for the opponents' hands. */
export function DominoBack() {
  return (
    <>
      <rect x={-0.47} y={-0.97} width={0.94} height={1.94} rx={0.14} fill="#3a2e22" />
      <rect x={-0.33} y={-0.83} width={0.66} height={1.66} rx={0.08} fill="none" stroke="#7a6b58" strokeWidth={0.04} />
    </>
  );
}

/** A standalone vertical tile, e.g. in a hand. `size` is the width in pixels. */
export function TileIcon({ a, b, size = 28, back = false }: { a: number; b: number; size?: number; back?: boolean }) {
  return (
    <svg viewBox="-0.5 -1 1 2" width={size} height={size * 2} aria-hidden className="block">
      {back ? <DominoBack /> : <DominoFace a={a} b={b} />}
    </svg>
  );
}
