/**
 * camera.js — 3D camera rig.
 *
 * Owns a Three.js PerspectiveCamera and an orbit-style target/yaw/pitch/distance
 * state. Exposes pan, orbit, zoom, and ray-casting helpers so the editor and
 * game can translate screen-space input into world-space ground positions.
 *
 * Coordinate convention used everywhere in the 3D code:
 *   +X right, +Y up, +Z forward-into-screen.
 *   The course lies on the XZ plane at Y = 0.
 */

import * as THREE from 'three';

const GROUND_PLANE = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

export class Camera {
  constructor() {
    this.three = new THREE.PerspectiveCamera(45, 1, 0.5, 5000);

    // Point on the ground the camera is looking at.
    this.target   = new THREE.Vector3(0, 0, 0);
    this.distance = 60;       // metres of stand-off from the target
    this.yaw      = 0;        // rotation around +Y, radians (0 = looking down +Z)
    this.pitch    = 1.05;     // tilt down from horizon, radians (~60° from horizon)

    this.minDistance = 8;
    this.maxDistance = 400;
    this.minPitch    = 0.25;  // can't look nearly horizontal
    this.maxPitch    = 1.45;  // can't go past straight-down

    this._raycaster = new THREE.Raycaster();
    this._ndc       = new THREE.Vector2();

    this._sync();
  }

  /** Recompute the underlying Three.js camera position from orbit state. */
  _sync() {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    // Camera offset from target in world space.
    const ox = this.distance * cp * sy;
    const oz = this.distance * cp * cy;
    const oy = this.distance * sp;

    this.three.position.set(
      this.target.x + ox,
      this.target.y + oy,
      this.target.z + oz,
    );
    this.three.up.set(0, 1, 0);
    this.three.lookAt(this.target);
    this.three.updateMatrixWorld();
  }

  setAspect(aspect) {
    this.three.aspect = aspect;
    this.three.updateProjectionMatrix();
  }

  // ── Interaction ─────────────────────────────────────────────────────────────

  /**
   * Pan along the ground by a screen-space pixel delta. We map screen pixels
   * to world units by intersecting the camera's view frustum with the ground
   * at the target's distance, so pan feels right at any zoom level.
   */
  pan(dxPixels, dyPixels, viewportWidth, viewportHeight) {
    const worldPerPixel = this._worldUnitsPerPixel(viewportHeight);

    // Camera-right and camera-forward projected onto the ground plane.
    const forward = new THREE.Vector3();
    this.three.getWorldDirection(forward);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize();

    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Dragging right (+dx) should move the world right under the cursor, so
    // the target moves left in world space — hence the negative signs.
    this.target.addScaledVector(right,   -dxPixels * worldPerPixel);
    this.target.addScaledVector(forward, -dyPixels * worldPerPixel);
    this._sync();
  }

  /** Snap the orbit target to a ground-plane (x, z) without changing yaw/pitch/distance. */
  setTargetXZ(x, z) {
    this.target.x = x;
    this.target.z = z;
    this._sync();
  }

  /** Move the orbit target a fraction of the way toward (x, z). Used for chase-cam follow. */
  lerpTargetXZ(x, z, t) {
    const nx = this.target.x + (x - this.target.x) * t;
    const nz = this.target.z + (z - this.target.z) * t;
    if (Math.abs(nx - this.target.x) < 1e-5 && Math.abs(nz - this.target.z) < 1e-5) return;
    this.target.x = nx;
    this.target.z = nz;
    this._sync();
  }

  orbit(dxPixels, dyPixels) {
    const sensitivity = 0.005;
    this.yaw   -= dxPixels * sensitivity;
    this.pitch  = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch + dyPixels * sensitivity));
    this._sync();
  }

  /**
   * Dolly zoom. factor > 1 zooms in (closer), factor < 1 zooms out.
   * The point under the cursor stays roughly stable.
   */
  zoom(factor, sx, sy, viewportWidth, viewportHeight) {
    const before = this.screenToGround(sx, sy, viewportWidth, viewportHeight);

    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, this.distance / factor));
    this._sync();

    if (before) {
      const after = this.screenToGround(sx, sy, viewportWidth, viewportHeight);
      if (after) {
        this.target.x += before.x - after.x;
        this.target.z += before.z - after.z;
        this._sync();
      }
    }
  }

  /** Frame a rectangle (in world XZ) so it fits the viewport with padding. */
  fitRect(minX, minZ, maxX, maxZ, viewportWidth, viewportHeight, padding = 1.15) {
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    this.target.set(cx, 0, cz);

    const w = maxX - minX;
    const h = maxZ - minZ;

    const aspect = viewportWidth / Math.max(1, viewportHeight);
    const vFov   = THREE.MathUtils.degToRad(this.three.fov);
    const halfH  = (h * 0.5) * padding;
    const halfW  = (w * 0.5) * padding;

    // Distance required so the largest dimension fits at the current pitch.
    const distForH = halfH / Math.tan(vFov / 2);
    const distForW = halfW / (Math.tan(vFov / 2) * aspect);
    const distFlat = Math.max(distForH, distForW);

    // We're tilted, so the projected extent shrinks roughly by cos(angle-from-horizon).
    // Compensate by dividing by sin(pitch).
    const dist = distFlat / Math.max(0.4, Math.sin(this.pitch));
    this.distance = Math.max(this.minDistance, Math.min(this.maxDistance, dist));

    this._sync();
  }

  // ── Screen ↔ world helpers ──────────────────────────────────────────────────

  /** Cast a ray from (sx, sy) canvas pixels onto the Y=0 ground plane. */
  screenToGround(sx, sy, viewportWidth, viewportHeight) {
    this._ndc.x = (sx / viewportWidth)  * 2 - 1;
    this._ndc.y = -(sy / viewportHeight) * 2 + 1;
    this._raycaster.setFromCamera(this._ndc, this.three);
    const hit = new THREE.Vector3();
    return this._raycaster.ray.intersectPlane(GROUND_PLANE, hit) ? hit : null;
  }

  /** Project a world position into canvas-pixel coordinates. */
  worldToScreen(world, viewportWidth, viewportHeight) {
    const v = world.clone().project(this.three);
    return {
      x: (v.x + 1) * 0.5 * viewportWidth,
      y: (1 - v.y) * 0.5 * viewportHeight,
      visible: v.z >= -1 && v.z <= 1,
    };
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _worldUnitsPerPixel(viewportHeight) {
    const vFov = THREE.MathUtils.degToRad(this.three.fov);
    const worldHeight = 2 * this.distance * Math.tan(vFov / 2);
    return worldHeight / viewportHeight;
  }
}
