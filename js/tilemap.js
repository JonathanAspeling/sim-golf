/**
 * tilemap.js — Grid data structure and tile type registry.
 *
 * Tile IDs are small integers stored in a flat Uint8Array for memory
 * efficiency. Adding a new tile type only requires an entry here; the
 * renderer and editor pick it up automatically.
 */

// Ordered so id=0 is the default (out-of-bounds fills new maps).
export const TILES = {
  OUT_OF_BOUNDS: { id: 0, name: 'Out of Bounds', color: '#1c1c1c' },
  TEE:           { id: 1, name: 'Tee',           color: '#7ecfef' },
  FAIRWAY:       { id: 2, name: 'Fairway',       color: '#4caf50' },
  ROUGH:         { id: 3, name: 'Rough',         color: '#2e7d32' },
  GREEN:         { id: 4, name: 'Green',         color: '#a5d6a7' },
  BUNKER:        { id: 5, name: 'Bunker',        color: '#e6d46b' },
  WATER:         { id: 6, name: 'Water',         color: '#1565c0' },
};

// Reverse-lookup array: index by id → tile definition.
const TILE_BY_ID = [];
for (const tile of Object.values(TILES)) {
  TILE_BY_ID[tile.id] = tile;
}

/** Return the tile definition for a given numeric id, defaulting to OUT_OF_BOUNDS. */
export function getTileById(id) {
  return TILE_BY_ID[id] ?? TILES.OUT_OF_BOUNDS;
}

export class TileMap {
  /**
   * @param {number} cols  Number of columns (x axis).
   * @param {number} rows  Number of rows (y axis).
   */
  constructor(cols, rows) {
    this.cols = cols;
    this.rows = rows;
    // Uint8Array supports up to 255 tile types and stays cache-friendly.
    this.data = new Uint8Array(cols * rows);
    // id 0 = OUT_OF_BOUNDS — already the default for Uint8Array.
  }

  isInBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  /** Get the tile id at (col, row). Returns OUT_OF_BOUNDS id for out-of-range coords. */
  get(col, row) {
    if (!this.isInBounds(col, row)) return TILES.OUT_OF_BOUNDS.id;
    return this.data[row * this.cols + col];
  }

  /** Set the tile id at (col, row). Silently ignores out-of-range coords. */
  set(col, row, tileId) {
    if (!this.isInBounds(col, row)) return;
    this.data[row * this.cols + col] = tileId;
  }

  /** Reset all tiles to OUT_OF_BOUNDS. */
  clear() {
    this.data.fill(TILES.OUT_OF_BOUNDS.id);
  }

  toJSON() {
    return {
      cols: this.cols,
      rows: this.rows,
      data: Array.from(this.data),
    };
  }

  static fromJSON(json) {
    const map = new TileMap(json.cols, json.rows);
    map.data.set(json.data);
    return map;
  }
}
