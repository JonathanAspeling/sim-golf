/**
 * hole.js — Metadata for a single golf hole.
 *
 * Stores the tee and flag marker positions (grid coordinates), par, and
 * name. This is separate from TileMap so the two can evolve independently.
 */

export class HoleInfo {
  constructor() {
    this.name    = '';
    this.par     = 4;
    /** @type {{ col: number, row: number } | null} */
    this.teePos  = null;
    /** @type {{ col: number, row: number } | null} */
    this.holePos = null;
  }

  toJSON() {
    return {
      name:    this.name,
      par:     this.par,
      teePos:  this.teePos,
      holePos: this.holePos,
    };
  }

  /** Restore from a plain object (e.g. parsed JSON). */
  loadJSON(json) {
    this.name    = typeof json.name === 'string' ? json.name : '';
    this.par     = [3, 4, 5].includes(json.par)  ? json.par  : 4;
    this.teePos  = isGridPos(json.teePos)  ? json.teePos  : null;
    this.holePos = isGridPos(json.holePos) ? json.holePos : null;
  }

  reset() {
    this.name    = '';
    this.par     = 4;
    this.teePos  = null;
    this.holePos = null;
  }
}

function isGridPos(v) {
  return v !== null && typeof v === 'object'
    && typeof v.col === 'number' && typeof v.row === 'number';
}
