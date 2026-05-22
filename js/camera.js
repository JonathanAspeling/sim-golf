/**
 * camera.js — World-to-screen coordinate transforms, pan, and zoom.
 *
 * The camera has no DOM or canvas dependencies — it is pure maths.
 * "World space" is measured in pixels at zoom=1 (i.e. tile-size units).
 * "Screen space" is canvas pixels.
 */

export class Camera {
  constructor() {
    /** World-space origin that maps to screen (0, 0). */
    this.x = 0;
    this.y = 0;
    /** Current zoom level. 1 = 1:1, 2 = 2× magnification. */
    this.zoom = 1;

    this.minZoom = 0.2;
    this.maxZoom = 10;
  }

  /** Convert world coordinates to screen (canvas) coordinates. */
  worldToScreen(wx, wy) {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  /** Convert screen (canvas) coordinates to world coordinates. */
  screenToWorld(sx, sy) {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  /**
   * Pan the camera by a screen-space delta.
   * @param {number} dsx  Screen-space horizontal delta (pixels).
   * @param {number} dsy  Screen-space vertical delta (pixels).
   */
  pan(dsx, dsy) {
    this.x -= dsx / this.zoom;
    this.y -= dsy / this.zoom;
  }

  /**
   * Zoom by a multiplicative factor, keeping the screen-space anchor fixed.
   * @param {number} factor  e.g. 1.1 to zoom in, 0.9 to zoom out.
   * @param {number} sx      Screen X of the zoom anchor (cursor position).
   * @param {number} sy      Screen Y of the zoom anchor.
   */
  zoomAt(factor, sx, sy) {
    const newZoom = Math.min(this.maxZoom, Math.max(this.minZoom, this.zoom * factor));
    // Solve for the new offset that keeps the world point under (sx, sy) stationary.
    const wx = sx / this.zoom + this.x;
    const wy = sy / this.zoom + this.y;
    this.zoom = newZoom;
    this.x = wx - sx / this.zoom;
    this.y = wy - sy / this.zoom;
  }

  /**
   * Fit a world-space rectangle into the viewport, centred with padding.
   * Useful for the initial "show the whole map" view.
   */
  fitRect(wx, wy, ww, wh, viewportW, viewportH, padding = 40) {
    const zoomX = (viewportW - padding * 2) / ww;
    const zoomY = (viewportH - padding * 2) / wh;
    this.zoom = Math.min(zoomX, zoomY, this.maxZoom);
    this.zoom = Math.max(this.zoom, this.minZoom);
    // Centre horizontally and vertically.
    this.x = wx - (viewportW / this.zoom - ww) / 2;
    this.y = wy - (viewportH / this.zoom - wh) / 2;
  }
}
