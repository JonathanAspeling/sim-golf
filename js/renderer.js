/**
 * renderer.js — Canvas drawing.
 *
 * Draws tiles (with view-frustum culling), an optional grid overlay, and
 * the tee / flag markers from HoleInfo on top of the tile layer.
 */

import { getTileById } from './tilemap.js';

const GRID_COLOR      = 'rgba(255,255,255,0.05)';
const GRID_MIN_PX     = 6; // screen pixels per tile — hide grid below this

export class Renderer {
  /**
   * @param {HTMLCanvasElement}                  canvas
   * @param {import('./camera.js').Camera}       camera
   * @param {import('./tilemap.js').TileMap}     tilemap
   * @param {import('./hole.js').HoleInfo}       hole
   */
  constructor(canvas, camera, tilemap, hole) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.camera  = camera;
    this.tilemap = tilemap;
    this.hole    = hole;

    this.tileSize = 32; // world-space pixels per tile
    this.showGrid = true;
  }

  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width  = container.clientWidth;
    this.canvas.height = container.clientHeight;
  }

  render() {
    const { ctx, canvas, camera, tilemap } = this;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d0d0d';
    ctx.fillRect(0, 0, W, H);

    const tsSc = this.tileSize * camera.zoom; // tile size in screen pixels

    // Visible tile range.
    const topLeft  = camera.screenToWorld(0, 0);
    const botRight = camera.screenToWorld(W, H);
    const colStart = Math.max(0, Math.floor(topLeft.x / this.tileSize));
    const rowStart = Math.max(0, Math.floor(topLeft.y / this.tileSize));
    const colEnd   = Math.min(tilemap.cols - 1, Math.ceil(botRight.x / this.tileSize));
    const rowEnd   = Math.min(tilemap.rows - 1, Math.ceil(botRight.y / this.tileSize));

    // Tiles.
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const tile = getTileById(tilemap.get(col, row));
        const sx   = Math.floor((col * this.tileSize - camera.x) * camera.zoom);
        const sy   = Math.floor((row * this.tileSize - camera.y) * camera.zoom);
        ctx.fillStyle = tile.color;
        // +1 closes sub-pixel seams at non-integer zoom levels.
        ctx.fillRect(sx, sy, Math.ceil(tsSc) + 1, Math.ceil(tsSc) + 1);
      }
    }

    // Grid overlay.
    if (this.showGrid && tsSc >= GRID_MIN_PX) {
      ctx.save();
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      for (let col = colStart; col <= colEnd + 1; col++) {
        const sx = Math.floor((col * this.tileSize - camera.x) * camera.zoom) + 0.5;
        ctx.moveTo(sx, 0);
        ctx.lineTo(sx, H);
      }
      for (let row = rowStart; row <= rowEnd + 1; row++) {
        const sy = Math.floor((row * this.tileSize - camera.y) * camera.zoom) + 0.5;
        ctx.moveTo(0, sy);
        ctx.lineTo(W, sy);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Markers on top of tiles.
    this._drawMarkers();
  }

  // ── Marker helpers ─────────────────────────────────────────────────────────

  /** Screen-space centre of a tile. */
  _tileCenter(col, row) {
    return this.camera.worldToScreen(
      (col + 0.5) * this.tileSize,
      (row + 0.5) * this.tileSize,
    );
  }

  /** Marker diameter in screen pixels — scales with zoom, clamped to [14, 46]. */
  _markerSize() {
    return Math.max(14, Math.min(46, this.tileSize * this.camera.zoom * 0.62));
  }

  _drawMarkers() {
    const { hole } = this;
    const size = this._markerSize();

    if (hole.teePos) {
      const { x, y } = this._tileCenter(hole.teePos.col, hole.teePos.row);
      this._drawTeeMarker(x, y, size);
    }
    if (hole.holePos) {
      const { x, y } = this._tileCenter(hole.holePos.col, hole.holePos.row);
      this._drawFlagMarker(x, y, size);
    }
  }

  /** White circle with a "T" — marks the starting tee position. */
  _drawTeeMarker(cx, cy, size) {
    const ctx = this.ctx;
    const r   = size / 2;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur  = 5;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle   = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#2244cc';
    ctx.lineWidth   = Math.max(1.5, r * 0.13);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle  = '#1a1a2a';
    ctx.font       = `bold ${Math.round(r * 1.1)}px system-ui, sans-serif`;
    ctx.textAlign  = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('T', cx, cy + 1);

    ctx.restore();
  }

  /** Flag on a pole with a cup — marks the hole position. */
  _drawFlagMarker(cx, cy, size) {
    const ctx     = this.ctx;
    const poleH   = size * 0.9;
    const poleX   = cx;
    const poleTop = cy - poleH * 0.55;
    const poleBot = cy + poleH * 0.35;

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur  = 5;

    // Hole cup.
    ctx.beginPath();
    ctx.arc(poleX, poleBot, size * 0.14, 0, Math.PI * 2);
    ctx.fillStyle   = '#222222';
    ctx.fill();
    ctx.strokeStyle = '#888888';
    ctx.lineWidth   = 1;
    ctx.stroke();

    ctx.shadowBlur = 0;

    // Pole.
    ctx.beginPath();
    ctx.moveTo(poleX, poleBot);
    ctx.lineTo(poleX, poleTop);
    ctx.strokeStyle = '#eeeeee';
    ctx.lineWidth   = Math.max(1.5, size * 0.07);
    ctx.stroke();

    // Flag triangle.
    const fw = size * 0.42;
    const fh = size * 0.28;
    ctx.beginPath();
    ctx.moveTo(poleX,      poleTop);
    ctx.lineTo(poleX + fw, poleTop + fh * 0.5);
    ctx.lineTo(poleX,      poleTop + fh);
    ctx.closePath();
    ctx.fillStyle = '#e53935';
    ctx.fill();

    ctx.restore();
  }
}
