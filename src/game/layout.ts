import type { Placed } from "./engine";

/**
 * Table geometry, in half-tile units: a tile is 2x1 (horizontal) or 1x2 (vertical).
 * The opening tile sits at (0, 0). The right arm of the chain runs right, then snakes downward;
 * the left arm runs left, then snakes upward. Rows are 2 units apart, so tiles never overlap.
 */

/** Rows stop at this distance from the center, then the chain turns. */
export const ROW_LIMIT = 7;

export type Rect = { x: number; y: number; vertical: boolean };

/** A tile on the table. `a` is drawn on the top (vertical) or left (horizontal) half. */
export type LaidTile = Rect & { index: number; a: number; b: number };

export type Layout = {
  tiles: LaidTile[];
  /** Where the next tile played on each end would go. */
  ghosts: { left: Rect; right: Rect };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
};

type Arm = {
  /** Point where the next tile attaches, on the current row's center line. */
  x: number;
  y: number;
  /** Horizontal direction of the current row. */
  dir: 1 | -1;
  /** Direction the chain turns to (down for the right arm, up for the left arm). */
  turn: 1 | -1;
  /** True right after a turn: the next tile must stay in line to clear the turning tile. */
  afterTurn: boolean;
};

/** Places one tile on an arm and advances it. `near` is the value touching the previous tile. */
function place(arm: Arm, near: number, far: number, double: boolean): Rect & { a: number; b: number } {
  const across = double && !arm.afterTurn;
  const length = across ? 1 : 2;
  if (Math.abs(arm.x + arm.dir * length) <= ROW_LIMIT) {
    arm.afterTurn = false;
    if (across) {
      const rect = { x: arm.x + arm.dir * 0.5, y: arm.y, vertical: true, a: near, b: far };
      arm.x += arm.dir;
      return rect;
    }
    const rect = {
      x: arm.x + arm.dir,
      y: arm.y,
      vertical: false,
      a: arm.dir > 0 ? near : far,
      b: arm.dir > 0 ? far : near,
    };
    arm.x += arm.dir * 2;
    return rect;
  }
  // Turn: a vertical tile hangs off the end of the row, and the next row runs back underneath.
  const column = arm.x + arm.dir * 0.5;
  const rect = {
    x: column,
    y: arm.y + arm.turn * 0.5,
    vertical: true,
    a: arm.turn > 0 ? near : far,
    b: arm.turn > 0 ? far : near,
  };
  arm.x = column + arm.dir * 0.5;
  arm.y += arm.turn * 2;
  arm.dir = arm.dir > 0 ? -1 : 1;
  arm.afterTurn = true;
  return rect;
}

function ghost(arm: Arm): Rect {
  const { x, y, vertical } = place({ ...arm }, 0, 1, false);
  return { x, y, vertical };
}

export function layoutChain(chain: Placed[], origin: number): Layout {
  const tiles: LaidTile[] = [];
  const opening = chain[origin];
  const openDouble = opening.tile[0] === opening.tile[1];
  tiles.push({ index: origin, x: 0, y: 0, vertical: openDouble, a: opening.left, b: opening.right });
  const half = openDouble ? 0.5 : 1;

  const right: Arm = { x: half, y: 0, dir: 1, turn: 1, afterTurn: false };
  for (let i = origin + 1; i < chain.length; i++) {
    const p = chain[i];
    tiles.push({ index: i, ...place(right, p.left, p.right, p.tile[0] === p.tile[1]) });
  }
  const left: Arm = { x: -half, y: 0, dir: -1, turn: -1, afterTurn: false };
  for (let i = origin - 1; i >= 0; i--) {
    const p = chain[i];
    tiles.push({ index: i, ...place(left, p.right, p.left, p.tile[0] === p.tile[1]) });
  }

  const ghosts = { left: ghost(left), right: ghost(right) };
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const r of [...tiles, ghosts.left, ghosts.right]) {
    const [w, h] = r.vertical ? [0.5, 1] : [1, 0.5];
    bounds.minX = Math.min(bounds.minX, r.x - w);
    bounds.maxX = Math.max(bounds.maxX, r.x + w);
    bounds.minY = Math.min(bounds.minY, r.y - h);
    bounds.maxY = Math.max(bounds.maxY, r.y + h);
  }
  return { tiles, ghosts, bounds };
}
