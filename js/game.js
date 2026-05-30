/**
 * game.js — 3D ball physics, club-based shot simulation, and chase-cam hooks.
 *
 * State per ball: (x, y, z) world position + (vx, vy, vz) velocity.
 *   +Y is up; the course lies on Y=0.
 *
 * Per-frame loop:
 *   1. Apply gravity to vy.
 *   2. Integrate position by velocity.
 *   3. Reflect off the map's outer XZ walls (always).
 *   4. If the ball is at or below ground:
 *        - Water / OOB tile → penalty + respawn at last valid position.
 *        - Otherwise either BOUNCE (impact speed above threshold — reflect vy
 *          with surface restitution, scrub horizontal velocity by tangent
 *          friction) or SETTLE (low-impact landing — vy=0 and the ball enters
 *          rolling friction for this frame, matching the old ground physics).
 *   5. If on the ground and horizontal speed is below STOP_SPEED, stop the
 *      ball and run the hole-out check.
 *
 * Shots are slingshot drags on the ground plane (direction + power) combined
 * with a club, which sets launch angle and max speed. The Putter has 0° loft,
 * so it slides along the ground and bypasses the bounce path naturally.
 */

import * as THREE from 'three';
import { TILES } from './tilemap.js';
import { tileToWorld, worldToTile, mapBoundsWorld } from './grid.js';

// ── Surface tables ────────────────────────────────────────────────────────────

// Per-frame velocity retention while rolling on the ground.
const FRICTION = {
  [TILES.OUT_OF_BOUNDS.id]: 0,     // handled as penalty — value unused
  [TILES.TEE.id]:           0.984,
  [TILES.FAIRWAY.id]:       0.984,
  [TILES.ROUGH.id]:         0.940,
  [TILES.GREEN.id]:         0.991,
  [TILES.BUNKER.id]:        0.860,
  [TILES.WATER.id]:         0,     // handled as penalty — value unused
};
const FRICTION_DEFAULT = 0.984;

// Vertical restitution: fraction of impact speed reflected back as upward vy.
const BOUNCE = {
  [TILES.TEE.id]:     0.45,
  [TILES.FAIRWAY.id]: 0.55,
  [TILES.ROUGH.id]:   0.22,
  [TILES.GREEN.id]:   0.30,
  [TILES.BUNKER.id]:  0.08,
};
const BOUNCE_DEFAULT = 0.40;

// Horizontal velocity retained after each ground bounce.
const TANGENT = {
  [TILES.TEE.id]:     0.80,
  [TILES.FAIRWAY.id]: 0.85,
  [TILES.ROUGH.id]:   0.55,
  [TILES.GREEN.id]:   0.92,
  [TILES.BUNKER.id]:  0.35,
};
const TANGENT_DEFAULT = 0.80;

// ── Constants ─────────────────────────────────────────────────────────────────

// World units (HEX_SIZE ≈ 1.2, hex flat-to-flat ≈ 2.08).
const GRAVITY          = 0.018;  // world units per frame²
const STOP_SPEED       = 0.012;  // world units/frame — ball is at rest
const HOLE_RADIUS      = 1.0;
const BOUNCE_DAMP      = 0.55;   // map-edge bounce
const BOUNCE_THRESHOLD = 0.05;   // -vy below this on impact → settle into roll
const SETTLED_Y        = 0.001;  // y considered "on the ground"

const MAX_DRAG_WORLD   = 8.0;
const MIN_DRAG_WORLD   = 0.3;
const BALL_HIT_RADIUS  = 30;     // screen px — how close a click must be

// ── Clubs ─────────────────────────────────────────────────────────────────────

/**
 * @typedef {{ id: string, name: string, launchDeg: number, maxSpeed: number }} Club
 */

/** @type {Record<string, Club>} */
export const CLUBS = {
  driver: { id: 'driver', name: 'Driver', launchDeg: 12, maxSpeed: 1.90 },
  iron:   { id: 'iron',   name: 'Iron',   launchDeg: 22, maxSpeed: 1.40 },
  wedge:  { id: 'wedge',  name: 'Wedge',  launchDeg: 50, maxSpeed: 0.95 },
  putter: { id: 'putter', name: 'Putter', launchDeg:  0, maxSpeed: 0.70 },
};

// ── Game class ────────────────────────────────────────────────────────────────

export class Game {
  /**
   * @param {import('./tilemap.js').TileMap}   tilemap
   * @param {import('./hole.js').HoleInfo}     hole
   * @param {import('./renderer.js').Renderer} renderer
   * @param {import('./camera.js').Camera}     camera
   */
  constructor(tilemap, hole, renderer, camera) {
    this.tilemap  = tilemap;
    this.hole     = hole;
    this.renderer = renderer;
    this.camera   = camera;

    /** @type {'idle'|'aiming'|'flying'|'holed'} */
    this.state   = 'idle';
    /** @type {{ x:number, y:number, z:number, vx:number, vy:number, vz:number } | null} */
    this.ball    = null;
    this.strokes = 0;
    this.club    = CLUBS.putter;

    this._lastValidPos = null;

    /** @type {THREE.Vector3 | null} */
    this.aimStart   = null;
    /** @type {THREE.Vector3 | null} */
    this.aimCurrent = null;
  }

  // ── Setup ──────────────────────────────────────────────────────────────────

  setClub(id) {
    if (CLUBS[id]) this.club = CLUBS[id];
  }

  reset() {
    const tee = this.hole.teePos;
    if (tee) {
      const { x: cx, z: cz } = tileToWorld(tee.col, tee.row);
      this.ball          = { x: cx, y: 0, z: cz, vx: 0, vy: 0, vz: 0 };
      this._lastValidPos = { x: cx, z: cz };
      this.camera.setTargetXZ(cx, cz);
    } else {
      this.ball          = null;
      this._lastValidPos = null;
    }
    this.strokes    = 0;
    this.state      = 'idle';
    this.aimStart   = null;
    this.aimCurrent = null;
  }

  // ── Physics update ─────────────────────────────────────────────────────────

  update() {
    if (this.state !== 'flying') return;

    // Gravity → integrate.
    this.ball.vy -= GRAVITY;
    this.ball.x  += this.ball.vx;
    this.ball.y  += this.ball.vy;
    this.ball.z  += this.ball.vz;

    // Map-edge bounce (XZ only, regardless of altitude).
    const b = mapBoundsWorld(this.tilemap.cols, this.tilemap.rows);
    if      (this.ball.x < b.minX) { this.ball.x = b.minX; this.ball.vx =  Math.abs(this.ball.vx) * BOUNCE_DAMP; }
    else if (this.ball.x > b.maxX) { this.ball.x = b.maxX; this.ball.vx = -Math.abs(this.ball.vx) * BOUNCE_DAMP; }
    if      (this.ball.z < b.minZ) { this.ball.z = b.minZ; this.ball.vz =  Math.abs(this.ball.vz) * BOUNCE_DAMP; }
    else if (this.ball.z > b.maxZ) { this.ball.z = b.maxZ; this.ball.vz = -Math.abs(this.ball.vz) * BOUNCE_DAMP; }

    // Ground contact.
    if (this.ball.y <= 0) {
      const { col, row } = worldToTile(this.ball.x, this.ball.z);
      const tileId = this.tilemap.get(col, row);

      if (tileId === TILES.WATER.id || tileId === TILES.OUT_OF_BOUNDS.id) {
        this.strokes++;
        this.ball.x  = this._lastValidPos.x;
        this.ball.y  = 0;
        this.ball.z  = this._lastValidPos.z;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.vz = 0;
        this.camera.setTargetXZ(this.ball.x, this.ball.z);
        this.state   = 'idle';
        return;
      }

      this.ball.y  = 0;
      const impact = -this.ball.vy;          // positive when descending
      if (impact > BOUNCE_THRESHOLD) {
        const e = BOUNCE[tileId]  ?? BOUNCE_DEFAULT;
        const t = TANGENT[tileId] ?? TANGENT_DEFAULT;
        this.ball.vy  =  impact * e;
        this.ball.vx *=  t;
        this.ball.vz *=  t;
      } else {
        // Low-impact landing — settle into the rolling friction model.
        this.ball.vy = 0;
        const f = FRICTION[tileId] ?? FRICTION_DEFAULT;
        this.ball.vx *= f;
        this.ball.vz *= f;
        this._lastValidPos = { x: this.ball.x, z: this.ball.z };
      }
    }

    // Stop check (only meaningful when grounded).
    if (this.ball.y <= SETTLED_Y && this.ball.vy === 0 &&
        Math.hypot(this.ball.vx, this.ball.vz) < STOP_SPEED) {
      this.ball.vx = 0;
      this.ball.vz = 0;
      this._checkHoleOut();
    }
  }

  _checkHoleOut() {
    const flag = this.hole.holePos;
    if (!flag) { this.state = 'idle'; return; }

    const { x: fx, z: fz } = tileToWorld(flag.col, flag.row);
    const dist = Math.hypot(this.ball.x - fx, this.ball.z - fz);
    this.state = dist <= HOLE_RADIUS ? 'holed' : 'idle';
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  /**
   * Begin aiming if the click lands on the ball.
   * @returns {boolean} True if the game consumed the event.
   */
  onMouseDown(sx, sy) {
    if (this.state !== 'idle' || !this.ball) return false;

    const ballScreen = this._ballScreenPos();
    if (!ballScreen) return false;
    if (Math.hypot(sx - ballScreen.x, sy - ballScreen.y) > BALL_HIT_RADIUS) return false;

    const groundHit = this._screenToGround(sx, sy);
    if (!groundHit) return false;

    this.state      = 'aiming';
    this.aimStart   = groundHit;
    this.aimCurrent = groundHit.clone();
    return true;
  }

  onMouseMove(sx, sy) {
    if (this.state !== 'aiming') return;
    const hit = this._screenToGround(sx, sy);
    if (hit) this.aimCurrent = hit;
  }

  onMouseUp(sx, sy) {
    if (this.state !== 'aiming') return;

    const hit = this._screenToGround(sx, sy);
    if (hit) this.aimCurrent = hit;

    // Slingshot: ball flies in the direction the user pulled FROM, away from
    // the cursor's release position. dragVec in world space:
    const dragX   = this.aimStart.x - this.aimCurrent.x;
    const dragZ   = this.aimStart.z - this.aimCurrent.z;
    const dragLen = Math.hypot(dragX, dragZ);

    this.aimStart   = null;
    this.aimCurrent = null;

    if (dragLen < MIN_DRAG_WORLD) {
      this.state = 'idle';
      return;
    }

    const powerFrac = Math.min(dragLen / MAX_DRAG_WORLD, 1);
    const speed     = powerFrac * this.club.maxSpeed;
    const launchRad = this.club.launchDeg * Math.PI / 180;
    const vHoriz    = speed * Math.cos(launchRad);
    const inv       = 1 / dragLen;

    this.ball.vx = (dragX * inv) * vHoriz;
    this.ball.vz = (dragZ * inv) * vHoriz;
    this.ball.vy = speed * Math.sin(launchRad);

    this.strokes++;
    this.state = 'flying';
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  /** Current drag as a 0–1 power fraction. */
  aimPower() {
    if (!this.aimStart || !this.aimCurrent) return 0;
    const len = Math.hypot(
      this.aimStart.x - this.aimCurrent.x,
      this.aimStart.z - this.aimCurrent.z,
    );
    return Math.min(len / MAX_DRAG_WORLD, 1);
  }

  /**
   * For renderer: returns { start, end } world Vector3s describing the aim
   * line (ball → projected shot endpoint), or null when not aiming.
   */
  aimWorldEndpoints() {
    if (this.state !== 'aiming' || !this.ball || !this.aimStart || !this.aimCurrent) return null;
    const dragX = this.aimStart.x - this.aimCurrent.x;
    const dragZ = this.aimStart.z - this.aimCurrent.z;
    const len   = Math.hypot(dragX, dragZ);
    if (len < 1e-4) return null;
    const lineLen = Math.min(len, MAX_DRAG_WORLD);
    return {
      start: new THREE.Vector3(this.ball.x, 0, this.ball.z),
      end:   new THREE.Vector3(
        this.ball.x + (dragX / len) * lineLen,
        0,
        this.ball.z + (dragZ / len) * lineLen,
      ),
    };
  }

  getScoreLabel() {
    const diff = this.strokes - this.hole.par;
    if (diff <= -3) return 'Albatross!';
    if (diff === -2) return 'Eagle!';
    if (diff === -1) return 'Birdie!';
    if (diff === 0)  return 'Par';
    if (diff === 1)  return 'Bogey';
    if (diff === 2)  return 'Double Bogey';
    if (diff === 3)  return 'Triple Bogey';
    return `+${diff}`;
  }

  getScoreColor() {
    const diff = this.strokes - this.hole.par;
    if (diff < 0)   return '#4cef80';
    if (diff === 0) return '#7faaff';
    return '#ff8855';
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  _screenToGround(sx, sy) {
    return this.camera.screenToGround(
      sx, sy, this.renderer.viewportWidth, this.renderer.viewportHeight,
    );
  }

  _ballScreenPos() {
    if (!this.ball) return null;
    const world = new THREE.Vector3(this.ball.x, this.ball.y + this.renderer.ballRadius, this.ball.z);
    return this.camera.worldToScreen(
      world, this.renderer.viewportWidth, this.renderer.viewportHeight,
    );
  }
}
