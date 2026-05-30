/**
 * editor.js — Input handling for the course editor.
 *
 * Tools:
 *   paint — left drag paints the active tile; right drag erases (Out of Bounds)
 *   fill  — left click flood-fills contiguous same-type tiles
 *   tee   — left click places the tee marker
 *   flag  — left click places the hole/flag marker
 *
 * Camera controls are always active (also in Play mode):
 *   middle drag           — pan along the ground
 *   shift + middle drag   — orbit (yaw/pitch)
 *   wheel                 — dolly zoom
 *
 * Screen → tile picking is done by ray-casting onto the ground plane through
 * the camera, so the editor stays correct under any orbit/zoom.
 */

import { TILES } from './tilemap.js';
import { worldToTile, neighbours } from './grid.js';

export const TOOL = { PAINT: 'paint', FILL: 'fill', TEE: 'tee', FLAG: 'flag' };

export class Editor {
  /**
   * @param {import('./renderer.js').Renderer} renderer
   * @param {import('./camera.js').Camera}     camera
   * @param {import('./tilemap.js').TileMap}   tilemap
   * @param {import('./history.js').History}   history
   * @param {import('./hole.js').HoleInfo}     hole
   */
  constructor(renderer, camera, tilemap, history, hole) {
    this.renderer = renderer;
    this.camera   = camera;
    this.tilemap  = tilemap;
    this.history  = history;
    this.hole     = hole;
    this.canvas   = renderer.three.domElement;

    this.activeTileId   = TILES.FAIRWAY.id;
    this.activeTool     = TOOL.PAINT;
    this.editingEnabled = true;

    this._strokeTileId  = null;
    this._strokeChanges = null;
    this._panning       = false;
    this._orbiting      = false;
    this._lastMouse     = { x: 0, y: 0 };

    this._bindEvents();
  }

  setActiveTile(id)      { this.activeTileId = id; }
  setActiveTool(t)       { this.activeTool = t; }
  setEditingEnabled(on)  {
    this.editingEnabled = on;
    if (!on) this.renderer.setHoverTile(null, null);
  }

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
    const w = this.camera.screenToGround(
      sx, sy, this.renderer.viewportWidth, this.renderer.viewportHeight,
    );
    if (!w) return { col: null, row: null };
    return worldToTile(w.x, w.z);
  }

  // ── Paint stroke ───────────────────────────────────────────────────────────

  _beginStroke(sx, sy, tileId) {
    this._strokeTileId  = tileId;
    this._strokeChanges = new Map();
    this._applyStroke(sx, sy);
  }

  _applyStroke(sx, sy) {
    const { col, row } = this._screenToTile(sx, sy);
    if (col === null || !this.tilemap.isInBounds(col, row)) return;

    const key    = `${col},${row}`;
    const before = this.tilemap.get(col, row);
    const after  = this._strokeTileId;

    if (!this._strokeChanges.has(key)) {
      this._strokeChanges.set(key, { col, row, before, after });
    } else {
      this._strokeChanges.get(key).after = after;
    }

    this.tilemap.set(col, row, after);
    this.renderer.updateTile(col, row);
  }

  _commitStroke() {
    if (!this._strokeChanges) return;
    const changes = [...this._strokeChanges.values()].filter(c => c.before !== c.after);
    this.history.push(changes);
    this._strokeChanges = null;
    this._strokeTileId  = null;
  }

  // ── Flood fill ─────────────────────────────────────────────────────────────

  _floodFill(startCol, startRow, newTileId) {
    const targetId = this.tilemap.get(startCol, startRow);
    if (targetId === newTileId) return;

    const { cols, rows } = this.tilemap;
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
      for (const nb of neighbours(c, r)) stack.push(nb);
    }

    if (changes.length > 0) {
      this.history.push(changes);
      this.renderer.refreshAllTiles();
    }
  }

  // ── Marker placement ───────────────────────────────────────────────────────

  _placeMarker(sx, sy) {
    const { col, row } = this._screenToTile(sx, sy);
    if (col === null || !this.tilemap.isInBounds(col, row)) return;
    if (this.activeTool === TOOL.TEE)  this.hole.teePos  = { col, row };
    if (this.activeTool === TOOL.FLAG) this.hole.holePos = { col, row };
    this.renderer.updateMarkers();
  }

  // ── Mouse handlers ─────────────────────────────────────────────────────────

  _onMouseDown(e) {
    this._lastMouse = { x: e.offsetX, y: e.offsetY };

    if (e.button === 0 && this.editingEnabled) {
      if (e.shiftKey) {
        // Shift + left-drag = erase (paint Out-of-Bounds).
        this._beginStroke(e.offsetX, e.offsetY, TILES.OUT_OF_BOUNDS.id);
      } else if (this.activeTool === TOOL.TEE || this.activeTool === TOOL.FLAG) {
        this._placeMarker(e.offsetX, e.offsetY);
      } else if (this.activeTool === TOOL.FILL) {
        const { col, row } = this._screenToTile(e.offsetX, e.offsetY);
        if (col !== null && this.tilemap.isInBounds(col, row)) {
          this._floodFill(col, row, this.activeTileId);
        }
      } else {
        this._beginStroke(e.offsetX, e.offsetY, this.activeTileId);
      }
    } else if (e.button === 2) {
      // Right-drag orbits the camera (always available, both modes).
      e.preventDefault();
      this._orbiting = true;
      this.canvas.style.cursor = 'grabbing';
    } else if (e.button === 1) {
      // Middle-drag pans (always available).
      e.preventDefault();
      this._panning = true;
      this.canvas.style.cursor = 'grabbing';
    }
  }

  _onMouseMove(e) {
    const dx = e.offsetX - this._lastMouse.x;
    const dy = e.offsetY - this._lastMouse.y;
    this._lastMouse = { x: e.offsetX, y: e.offsetY };

    if (this._panning) {
      this.camera.pan(dx, dy, this.renderer.viewportWidth, this.renderer.viewportHeight);
    } else if (this._orbiting) {
      this.camera.orbit(dx, dy);
    } else if (this._strokeChanges) {
      this._applyStroke(e.offsetX, e.offsetY);
    }

    this._updateHover(e.offsetX, e.offsetY);
  }

  _updateHover(sx, sy) {
    if (!this.editingEnabled) { this.renderer.setHoverTile(null, null); return; }
    const { col, row } = this._screenToTile(sx, sy);
    this.renderer.setHoverTile(col, row);
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      this._commitStroke();
    } else if (e.button === 2) {
      this._orbiting = false;
      this.canvas.style.cursor = 'crosshair';
    } else if (e.button === 1) {
      this._panning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  _onMouseLeave() {
    this._commitStroke();
    this._panning  = false;
    this._orbiting = false;
    this.canvas.style.cursor = 'crosshair';
    this.renderer.setHoverTile(null, null);
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.zoom(
      factor, e.offsetX, e.offsetY,
      this.renderer.viewportWidth, this.renderer.viewportHeight,
    );
  }
}
