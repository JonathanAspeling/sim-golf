/**
 * renderer.js — Canvas drawing.
 *
 * Only the tiles currently visible on screen are drawn (view-frustum
 * culling). The grid overlay is suppressed when tiles are too small to
 * make it legible.
 */

import { getTileById } from './tilemap.js';

const GRID_COLOR = 'rgba(255,255,255,0.05)';
const GRID_MIN_TILE_SIZE = 6; // screen pixels — hide grid below this

export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {import('./camera.js').Camera} camera
   * @param {import('./tilemap.js').TileMap} tilemap
   */
  constructor(canvas, camera, tilemap) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.camera = camera;
    this.tilemap = tilemap;

    /** Size of one tile in world-space pixels. */
    this.tileSize = 32;
    /** Toggle the grid overlay. */
    this.showGrid = true;
  }

  /** Resize the canvas to fill its container. Call on window resize. */
  resize() {
    const container = this.canvas.parentElement;
    this.canvas.width = container.clientWidth;
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

    // Determine the range of tiles that overlap the viewport.
    const topLeft  = camera.screenToWorld(0, 0);
    const botRight = camera.screenToWorld(W, H);

    const colStart = Math.max(0, Math.floor(topLeft.x / this.tileSize));
    const rowStart = Math.max(0, Math.floor(topLeft.y / this.tileSize));
    const colEnd   = Math.min(tilemap.cols - 1, Math.ceil(botRight.x / this.tileSize));
    const rowEnd   = Math.min(tilemap.rows - 1, Math.ceil(botRight.y / this.tileSize));

    // Draw tiles.
    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        const tile = getTileById(tilemap.get(col, row));

        // +1 on size closes the sub-pixel gap that appears between tiles at
        // non-integer zoom levels.
        const sx = Math.floor((col * this.tileSize - camera.x) * camera.zoom);
        const sy = Math.floor((row * this.tileSize - camera.y) * camera.zoom);

        ctx.fillStyle = tile.color;
        ctx.fillRect(sx, sy, Math.ceil(tsSc) + 1, Math.ceil(tsSc) + 1);
      }
    }

    // Grid overlay — only when tiles are large enough to be legible.
    if (this.showGrid && tsSc >= GRID_MIN_TILE_SIZE) {
      ctx.save();
      ctx.strokeStyle = GRID_COLOR;
      ctx.lineWidth = 1;
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
  }
}
