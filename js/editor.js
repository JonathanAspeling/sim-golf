/**
 * editor.js — Input handling for the course editor.
 *
 * Tools:
 *   paint — left drag paints the active tile; right drag erases (Out of Bounds)
 *   fill  — left click flood-fills contiguous same-type tiles
 *
 * Camera:
 *   Middle-click drag  → pan
 *   Scroll wheel       → zoom
 *
 * History:
 *   An entire paint stroke or flood fill is committed as one undoable entry.
 *   The `before` value for each tile is captured the first time it is touched
 *   in a stroke, so undo always restores the pre-stroke state correctly even
 *   if the same tile is painted multiple times within one drag.
 */

import { TILES } from './tilemap.js';

export const TOOL = { PAINT: 'paint', FILL: 'fill' };

export class Editor {
  /**
   * @param {HTMLCanvasElement}                    canvas
   * @param {import('./camera.js').Camera}         camera
   * @param {import('./tilemap.js').TileMap}       tilemap
   * @param {import('./renderer.js').Renderer}     renderer
   * @param {import('./history.js').History}       history
   */
  constructor(canvas, camera, tilemap, renderer, history) {
    this.canvas   = canvas;
    this.camera   = camera;
    this.tilemap  = tilemap;
    this.renderer = renderer;
    this.history  = history;

    this.activeTileId = TILES.FAIRWAY.id;
    this.activeTool   = TOOL.PAINT;

    // Stroke state — lives for the duration of a single mouse-button hold.
    this._strokeTileId  = null;
    this._strokeChanges = null; // Map<"col,row", {col,row,before,after}> | null

    this._panning   = false;
    this._lastMouse = { x: 0, y: 0 };

    this._bindEvents();
  }

  setActiveTile(tileId) { this.activeTileId = tileId; }
  setActiveTool(tool)   { this.activeTool   = tool;   }

  // ── Event binding ──────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('mouseleave',  e => this._onMouseLeave(e));
    c.addEventListener('wheel',       e => this._onWheel(e), { passive: false });
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

  _screenToTile(sx, sy) {
    const w  = this.camera.screenToWorld(sx, sy);
    const ts = this.renderer.tileSize;
    return { col: Math.floor(w.x / ts), row: Math.floor(w.y / ts) };
  }

  // ── Paint stroke ───────────────────────────────────────────────────────────

  _beginStroke(sx, sy, tileId) {
    this._strokeTileId  = tileId;
    this._strokeChanges = new Map();
    this._applyStroke(sx, sy);
  }

  _applyStroke(sx, sy) {
    const { col, row } = this._screenToTile(sx, sy);
    if (!this.tilemap.isInBounds(col, row)) return;

    const key    = `${col},${row}`;
    const before = this.tilemap.get(col, row);
    const after  = this._strokeTileId;

    if (!this._strokeChanges.has(key)) {
      // First visit to this tile in the stroke — snapshot the pre-stroke value.
      this._strokeChanges.set(key, { col, row, before, after });
    } else {
      // Revisited — just update the intended final value.
      this._strokeChanges.get(key).after = after;
    }

    this.tilemap.set(col, row, after);
  }

  _commitStroke() {
    if (!this._strokeChanges) return;
    const changes = [...this._strokeChanges.values()]
      .filter(c => c.before !== c.after); // skip tiles that ended up unchanged
    this.history.push(changes);
    this._strokeChanges = null;
    this._strokeTileId  = null;
  }

  // ── Flood fill ─────────────────────────────────────────────────────────────

  _floodFill(startCol, startRow, newTileId) {
    const targetId = this.tilemap.get(startCol, startRow);
    if (targetId === newTileId) return; // painting over same type — nothing to do

    const { cols, rows } = this.tilemap;
    // Uint8Array is faster than a Set for visited flags on a bounded grid.
    const seen    = new Uint8Array(cols * rows);
    const changes = [];
    const stack   = [[startCol, startRow]];

    while (stack.length > 0) {
      const [c, r] = stack.pop();
      if (c < 0 || c >= cols || r < 0 || r >= rows) continue;

      const idx = r * cols + c;
      if (seen[idx]) continue;
      if (this.tilemap.get(c, r) !== targetId) continue;

      seen[idx] = 1;
      changes.push({ col: c, row: r, before: targetId, after: newTileId });
      this.tilemap.set(c, r, newTileId);

      stack.push([c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]);
    }

    if (changes.length > 0) this.history.push(changes);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  _onMouseDown(e) {
    this._lastMouse = { x: e.offsetX, y: e.offsetY };

    if (e.button === 0) {
      if (this.activeTool === TOOL.FILL) {
        const { col, row } = this._screenToTile(e.offsetX, e.offsetY);
        this._floodFill(col, row, this.activeTileId);
      } else {
        this._beginStroke(e.offsetX, e.offsetY, this.activeTileId);
      }
    } else if (e.button === 2) {
      // Right-click always erases, regardless of active tool.
      this._beginStroke(e.offsetX, e.offsetY, TILES.OUT_OF_BOUNDS.id);
    } else if (e.button === 1) {
      this._panning = true;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  _onMouseMove(e) {
    const dx = e.offsetX - this._lastMouse.x;
    const dy = e.offsetY - this._lastMouse.y;
    this._lastMouse = { x: e.offsetX, y: e.offsetY };

    if (this._panning) {
      this.camera.pan(dx, dy);
    } else if (this._strokeChanges) {
      this._applyStroke(e.offsetX, e.offsetY);
    }
  }

  _onMouseUp(e) {
    if (e.button === 0 || e.button === 2) {
      this._commitStroke();
    } else if (e.button === 1) {
      this._panning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  _onMouseLeave() {
    this._commitStroke();
    this._panning = false;
    this.canvas.style.cursor = 'crosshair';
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.zoomAt(factor, e.offsetX, e.offsetY);
  }
}
