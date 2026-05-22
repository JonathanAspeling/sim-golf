/**
 * history.js — Undo/redo stack for tile map edits.
 *
 * Each history entry is a flat array of change records:
 *   { col, row, before, after }
 *
 * An entire paint stroke or flood fill is committed as one entry so that
 * a single Ctrl+Z undoes the whole operation, not one tile at a time.
 */

export class History {
  /** @param {number} limit  Maximum undo steps to retain. */
  constructor(limit = 50) {
    this.limit = limit;
    this._undo = []; // stack — top is most recent edit
    this._redo = []; // stack — top is most recently undone edit
  }

  get canUndo() { return this._undo.length > 0; }
  get canRedo() { return this._redo.length > 0; }

  /**
   * Record a completed edit as one undoable step.
   * No-op if changes is empty (e.g. painting over identical tiles).
   * @param {Array<{col:number, row:number, before:number, after:number}>} changes
   */
  push(changes) {
    if (changes.length === 0) return;
    this._undo.push(changes);
    if (this._undo.length > this.limit) this._undo.shift();
    this._redo = []; // new edit invalidates the redo branch
  }

  /**
   * Revert the most recent edit on the given tilemap.
   * @param {import('./tilemap.js').TileMap} tilemap
   * @returns {boolean}  true if an undo step was available.
   */
  undo(tilemap) {
    const entry = this._undo.pop();
    if (!entry) return false;
    for (const c of entry) tilemap.set(c.col, c.row, c.before);
    this._redo.push(entry);
    return true;
  }

  /**
   * Re-apply the most recently undone edit on the given tilemap.
   * @param {import('./tilemap.js').TileMap} tilemap
   * @returns {boolean}  true if a redo step was available.
   */
  redo(tilemap) {
    const entry = this._redo.pop();
    if (!entry) return false;
    for (const c of entry) tilemap.set(c.col, c.row, c.after);
    this._undo.push(entry);
    return true;
  }

  /** Wipe both stacks — call after loading a new course. */
  clear() {
    this._undo = [];
    this._redo = [];
  }
}
