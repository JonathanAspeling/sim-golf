/**
 * editor.js — Input handling for the course editor.
 *
 * Responsibilities:
 *   - Left click / drag  → paint the active tile
 *   - Right / middle drag → pan the camera
 *   - Scroll wheel        → zoom the camera
 */

import { TILES } from './tilemap.js';

export class Editor {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./camera.js').Camera} camera
   * @param {import('./tilemap.js').TileMap} tilemap
   * @param {import('./renderer.js').Renderer} renderer
   */
  constructor(canvas, camera, tilemap, renderer) {
    this.canvas   = canvas;
    this.camera   = camera;
    this.tilemap  = tilemap;
    this.renderer = renderer;

    this.activeTileId = TILES.FAIRWAY.id;

    this._painting = false;
    this._panning  = false;
    this._lastMouse = { x: 0, y: 0 };

    this._bindEvents();
  }

  /** Switch the tile that left-click painting applies. */
  setActiveTile(tileId) {
    this.activeTileId = tileId;
  }

  // ── Event binding ─────────────────────────────────────────────────────────

  _bindEvents() {
    const c = this.canvas;
    c.addEventListener('mousedown',   e => this._onMouseDown(e));
    c.addEventListener('mousemove',   e => this._onMouseMove(e));
    c.addEventListener('mouseup',     e => this._onMouseUp(e));
    c.addEventListener('mouseleave',  e => this._onMouseLeave(e));
    c.addEventListener('wheel',       e => this._onWheel(e), { passive: false });
    // Suppress the browser context menu so right-click can pan.
    c.addEventListener('contextmenu', e => e.preventDefault());
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Convert a screen-space position to the tile coordinate underneath it. */
  _screenToTile(sx, sy) {
    const world = this.camera.screenToWorld(sx, sy);
    const ts    = this.renderer.tileSize;
    return {
      col: Math.floor(world.x / ts),
      row: Math.floor(world.y / ts),
    };
  }

  _paintAt(sx, sy) {
    const { col, row } = this._screenToTile(sx, sy);
    this.tilemap.set(col, row, this.activeTileId);
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  _onMouseDown(e) {
    this._lastMouse = { x: e.offsetX, y: e.offsetY };

    if (e.button === 0) {
      this._painting = true;
      this._paintAt(e.offsetX, e.offsetY);
    } else if (e.button === 1 || e.button === 2) {
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
    } else if (this._painting) {
      this._paintAt(e.offsetX, e.offsetY);
    }
  }

  _onMouseUp(e) {
    if (e.button === 0) {
      this._painting = false;
    } else if (e.button === 1 || e.button === 2) {
      this._panning = false;
      this.canvas.style.cursor = 'crosshair';
    }
  }

  _onMouseLeave() {
    // Cancel any active interaction when the pointer leaves the canvas.
    this._painting = false;
    this._panning  = false;
    this.canvas.style.cursor = 'crosshair';
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    this.camera.zoomAt(factor, e.offsetX, e.offsetY);
  }
}
