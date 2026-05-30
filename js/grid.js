/**
 * grid.js — Hexagonal grid geometry.
 *
 * Pointy-top hexes in odd-r offset coordinates: row r is shifted right by half
 * a hex width when r is odd. This is one of the two standard conventions
 * (see e.g. Red Blob Games' hex guide); we pick it so successive rows nestle
 * into the gaps of the row above.
 *
 * Storage is unchanged from the square-grid version: tiles live in a
 * `Uint8Array` indexed by `row * cols + col`. Only the world-space mapping
 * differs — making old JSON courses load unchanged, just rendered as hexes.
 *
 * Coordinate vocabulary:
 *   (col, row)  — offset coordinates (what `TileMap` stores)
 *   (q, r)      — axial coordinates (used for proper rounding / neighbours)
 *   (x, z)      — world coordinates on the ground plane
 */

export const HEX_SIZE   = 1.2;                       // centre → corner distance
export const HEX_WIDTH  = Math.sqrt(3) * HEX_SIZE;   // flat-to-flat (X span)
export const HEX_HEIGHT = 2 * HEX_SIZE;              // corner-to-corner (Z span)
export const ROW_PITCH  = HEX_HEIGHT * 0.75;         // Z spacing between rows

// ── Forward / inverse mapping ───────────────────────────────────────────────

/** Offset (col, row) → world centre on the XZ plane. */
export function tileToWorld(col, row) {
  const x = (col + (row & 1 ? 0.5 : 0)) * HEX_WIDTH;
  const z = row * ROW_PITCH;
  return { x, z };
}

/** World (x, z) → offset (col, row) of the hex covering that point. */
export function worldToTile(x, z) {
  // Pixel → axial (pointy-top, see Red Blob Games "pixel-to-hex").
  const q = (Math.sqrt(3) / 3 * x - z / 3) / HEX_SIZE;
  const r = (2 / 3 * z) / HEX_SIZE;

  const { q: qi, r: ri } = _axialRound(q, r);

  // Axial → odd-r offset.
  const row = ri;
  const col = qi + ((ri - (ri & 1)) >> 1);
  return { col, row };
}

function _axialRound(qf, rf) {
  // Round in cube space to keep the nearest hex consistent across edges.
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;

  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);

  const dx = Math.abs(rx - xf);
  const dy = Math.abs(ry - yf);
  const dz = Math.abs(rz - zf);

  if (dx > dy && dx > dz)      rx = -ry - rz;
  else if (dy > dz)            ry = -rx - rz;
  else                         rz = -rx - ry;

  return { q: rx, r: rz };
}

// ── Neighbours (flood-fill / pathfinding) ───────────────────────────────────

const NEIGHBOURS_EVEN_ROW = [[+1,  0], [+1, -1], [0, -1], [-1, 0], [0, +1], [+1, +1]];
const NEIGHBOURS_ODD_ROW  = [[+1,  0], [ 0, -1], [-1,-1], [-1, 0], [-1,+1], [ 0, +1]];

/** Six (col, row) neighbours of a hex in odd-r offset coords. */
export function neighbours(col, row) {
  const t = (row & 1) ? NEIGHBOURS_ODD_ROW : NEIGHBOURS_EVEN_ROW;
  const out = new Array(6);
  for (let i = 0; i < 6; i++) out[i] = [col + t[i][0], row + t[i][1]];
  return out;
}

// ── World-space bounds of an entire hex grid ────────────────────────────────

/**
 * Axis-aligned bounding rectangle of all hexes in a (cols × rows) grid.
 * Used by the camera to frame the course and by the ball physics for the
 * out-of-bounds bounce envelope.
 */
export function mapBoundsWorld(cols, rows) {
  // Furthest left/right hexes — odd rows extend half a width farther right.
  const anyOddRow = rows > 1;
  const rightmostCentre = (cols - 1 + (anyOddRow ? 0.5 : 0)) * HEX_WIDTH;
  return {
    minX: -HEX_WIDTH / 2,
    maxX: rightmostCentre + HEX_WIDTH / 2,
    minZ: -HEX_HEIGHT / 2,
    maxZ: (rows - 1) * ROW_PITCH + HEX_HEIGHT / 2,
  };
}
