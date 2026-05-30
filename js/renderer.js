/**
 * renderer.js — Three.js scene management.
 *
 * Builds the WebGL scene (lights, instanced hex-tile field, hole markers,
 * ball, aim indicator, hover highlight) and exposes a minimal API so other
 * modules never need to talk to Three.js directly:
 *
 *   updateTile(col, row)      — refresh one tile's colour after an edit
 *   refreshAllTiles()         — full rebuild (after clear / import / undo)
 *   updateMarkers()           — sync tee + flag positions from HoleInfo
 *   setHoverTile(col, row)    — show or hide the editor hover outline
 *   setBall(x, z, visible)    — place the ball in world coords
 *   setAim(start, end)        — draw the aim line (world Vector3s, or null)
 *   render()                  — draw one frame
 *
 * World-space layout is delegated to ./grid.js (pointy-top hexes, odd-r offset).
 */

import * as THREE from 'three';
import { getTileById } from './tilemap.js';
import { HEX_SIZE, tileToWorld } from './grid.js';

const TILE_HEIGHT = 0.5;   // hex-prism thickness
const BALL_RADIUS = 0.35;

export class Renderer {
  /**
   * @param {HTMLElement}                       container  Element to mount the canvas into.
   * @param {import('./camera.js').Camera}      camera
   * @param {import('./tilemap.js').TileMap}    tilemap
   * @param {import('./hole.js').HoleInfo}      hole
   */
  constructor(container, camera, tilemap, hole) {
    this.container  = container;
    this.camera     = camera;
    this.tilemap    = tilemap;
    this.hole       = hole;
    this.ballRadius = BALL_RADIUS;

    this.three = new THREE.WebGLRenderer({ antialias: true });
    this.three.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.three.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.three.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#0d1218');
    this.scene.fog = new THREE.Fog(0x0d1218, 200, 600);

    this._buildLights();
    this._buildTiles();
    this._buildHover();
    this._buildMarkers();
    this._buildBall();
    this._buildAim();

    this.resize();
  }

  // ── Initial scene construction ─────────────────────────────────────────────

  _buildLights() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const sun = new THREE.DirectionalLight(0xfff2d8, 0.95);
    sun.position.set(60, 120, 40);
    this.scene.add(sun);

    const fill = new THREE.HemisphereLight(0xa0c8ff, 0x202810, 0.35);
    this.scene.add(fill);
  }

  _buildTiles() {
    const count = this.tilemap.cols * this.tilemap.rows;

    // Hexagonal prism — 6-segment cylinder. Default Three.js orientation places
    // vertex 0 at +Z, which is pointy-top with flat sides along ±X — exactly
    // what odd-r offset hex packing expects.
    const geom = new THREE.CylinderGeometry(HEX_SIZE * 0.97, HEX_SIZE * 0.97, TILE_HEIGHT, 6);
    const mat  = new THREE.MeshLambertMaterial({ vertexColors: false });
    const mesh = new THREE.InstancedMesh(geom, mat, count);

    const colors = new Float32Array(count * 3);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);

    const m = new THREE.Matrix4();
    let i = 0;
    for (let row = 0; row < this.tilemap.rows; row++) {
      for (let col = 0; col < this.tilemap.cols; col++, i++) {
        const { x, z } = tileToWorld(col, row);
        m.makeTranslation(x, -TILE_HEIGHT / 2, z);       // top face at Y=0
        mesh.setMatrixAt(i, m);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;

    this.tilesMesh = mesh;
    this.scene.add(mesh);

    this.refreshAllTiles();
  }

  _buildHover() {
    // Hexagonal disc, oriented to match the prism (corner pointing +Z).
    // CircleGeometry's vertex 0 is at +X (in its native XY plane), so after
    // lying it flat onto XZ we rotate by -π/2 around Y to align the corner
    // with the prism's first vertex at +Z.
    const g = new THREE.CircleGeometry(HEX_SIZE * 0.97, 6);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.PI / 2);

    const m = new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.22,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = 0.02;
    mesh.visible = false;
    this.scene.add(mesh);
    this.hoverMesh = mesh;
  }

  _buildMarkers() {
    this.markerGroup = new THREE.Group();
    this.scene.add(this.markerGroup);

    this.teeMesh  = this._makeTeeMesh();
    this.flagMesh = this._makeFlagMesh();
    this.teeMesh.visible  = false;
    this.flagMesh.visible = false;
    this.markerGroup.add(this.teeMesh);
    this.markerGroup.add(this.flagMesh);
  }

  _makeTeeMesh() {
    const group = new THREE.Group();

    const peg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.22, 0.6, 16),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f5 }),
    );
    peg.position.y = 0.3;
    group.add(peg);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.23, 0.23, 0.12, 16),
      new THREE.MeshLambertMaterial({ color: 0x2244cc }),
    );
    band.position.y = 0.5;
    group.add(band);

    return group;
  }

  _makeFlagMesh() {
    const group = new THREE.Group();

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xeeeeee }),
    );
    pole.position.y = 1.2;
    group.add(pole);

    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.06, 24),
      new THREE.MeshLambertMaterial({ color: 0x111111 }),
    );
    cup.position.y = 0.04;
    group.add(cup);

    const flagGeom = new THREE.BufferGeometry();
    flagGeom.setAttribute('position', new THREE.Float32BufferAttribute([
      0,    0,    0,
      0.9,  -0.2, 0,
      0,    -0.5, 0,
    ], 3));
    flagGeom.setIndex([0, 1, 2]);
    flagGeom.computeVertexNormals();
    const flag = new THREE.Mesh(
      flagGeom,
      new THREE.MeshLambertMaterial({ color: 0xe53935, side: THREE.DoubleSide }),
    );
    flag.position.set(0.04, 2.3, 0);
    group.add(flag);

    return group;
  }

  _buildBall() {
    const geom = new THREE.SphereGeometry(BALL_RADIUS, 20, 16);
    const mat  = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 80 });
    this.ballMesh = new THREE.Mesh(geom, mat);
    this.ballMesh.position.y = BALL_RADIUS;
    this.ballMesh.visible = false;
    this.scene.add(this.ballMesh);
  }

  _buildAim() {
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 0,0,0], 3));
    const mat = new THREE.LineBasicMaterial({ color: 0xffcc55, transparent: true, opacity: 0.95 });
    this.aimLine = new THREE.Line(geom, mat);
    this.aimLine.visible = false;
    this.scene.add(this.aimLine);
  }

  // ── External API ───────────────────────────────────────────────────────────

  resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.three.setSize(w, h, false);
    this.camera.setAspect(w / Math.max(1, h));
    this.viewportWidth  = w;
    this.viewportHeight = h;
  }

  updateTile(col, row) {
    if (!this.tilemap.isInBounds(col, row)) return;
    const idx  = row * this.tilemap.cols + col;
    const tile = getTileById(this.tilemap.get(col, row));
    const c    = new THREE.Color(tile.color);
    this.tilesMesh.setColorAt(idx, c);
    this.tilesMesh.instanceColor.needsUpdate = true;
  }

  refreshAllTiles() {
    const c = new THREE.Color();
    let i = 0;
    for (let row = 0; row < this.tilemap.rows; row++) {
      for (let col = 0; col < this.tilemap.cols; col++, i++) {
        c.set(getTileById(this.tilemap.get(col, row)).color);
        this.tilesMesh.setColorAt(i, c);
      }
    }
    this.tilesMesh.instanceColor.needsUpdate = true;
  }

  updateMarkers() {
    if (this.hole.teePos) {
      const { x, z } = tileToWorld(this.hole.teePos.col, this.hole.teePos.row);
      this.teeMesh.visible = true;
      this.teeMesh.position.set(x, 0, z);
    } else {
      this.teeMesh.visible = false;
    }

    if (this.hole.holePos) {
      const { x, z } = tileToWorld(this.hole.holePos.col, this.hole.holePos.row);
      this.flagMesh.visible = true;
      this.flagMesh.position.set(x, 0, z);
    } else {
      this.flagMesh.visible = false;
    }
  }

  setHoverTile(col, row) {
    if (col === null || row === null || !this.tilemap.isInBounds(col, row)) {
      this.hoverMesh.visible = false;
      return;
    }
    const { x, z } = tileToWorld(col, row);
    this.hoverMesh.visible = true;
    this.hoverMesh.position.set(x, 0.02, z);
  }

  setBall(x, y, z, visible) {
    this.ballMesh.visible = !!visible;
    if (visible) this.ballMesh.position.set(x, y + BALL_RADIUS, z);
  }

  /**
   * Show / hide the aim line.
   * @param {THREE.Vector3 | null} start  World position of line start (ball).
   * @param {THREE.Vector3 | null} end    World position of line end (shot direction tip).
   */
  setAim(start, end) {
    if (!start || !end) { this.aimLine.visible = false; return; }
    const attr = this.aimLine.geometry.getAttribute('position');
    attr.setXYZ(0, start.x, BALL_RADIUS + 0.05, start.z);
    attr.setXYZ(1, end.x,   BALL_RADIUS + 0.05, end.z);
    attr.needsUpdate = true;
    this.aimLine.visible = true;
  }

  render() {
    this.three.render(this.scene, this.camera.three);
  }
}
