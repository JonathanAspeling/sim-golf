/**
 * main.js — Entry point.
 *
 * Constructs all modules, wires them together, builds the palette UI,
 * and starts the render loop.
 */

import { TileMap, TILES }  from './tilemap.js';
import { Camera }          from './camera.js';
import { Renderer }        from './renderer.js';
import { Editor }          from './editor.js';

// ── Module construction ───────────────────────────────────────────────────────

const canvas   = document.getElementById('main-canvas');
const tilemap  = new TileMap(64, 64);
const camera   = new Camera();
const renderer = new Renderer(canvas, camera, tilemap);
const editor   = new Editor(canvas, camera, tilemap, renderer);

// ── Initial fit ───────────────────────────────────────────────────────────────

// Size the canvas to its container, then zoom to show the whole map.
renderer.resize();

const mapWorldW = tilemap.cols * renderer.tileSize;
const mapWorldH = tilemap.rows * renderer.tileSize;
camera.fitRect(0, 0, mapWorldW, mapWorldH, canvas.width, canvas.height);

// ── Palette UI ────────────────────────────────────────────────────────────────

const tileButtonContainer = document.getElementById('tile-buttons');

for (const tile of Object.values(TILES)) {
  const btn = document.createElement('button');
  btn.className = 'tile-btn';
  btn.dataset.tileId = tile.id;

  const swatch = document.createElement('span');
  swatch.className = 'tile-swatch';
  swatch.style.background = tile.color;

  btn.appendChild(swatch);
  btn.appendChild(document.createTextNode(tile.name));
  tileButtonContainer.appendChild(btn);

  btn.addEventListener('click', () => {
    editor.setActiveTile(tile.id);
    document.querySelectorAll('.tile-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  });
}

// Mark the default active tile in the UI.
const defaultBtn = tileButtonContainer.querySelector(
  `[data-tile-id="${editor.activeTileId}"]`
);
if (defaultBtn) defaultBtn.classList.add('active');

// ── Tool buttons ──────────────────────────────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', () => {
  if (confirm('Clear the entire course? This cannot be undone.')) {
    tilemap.clear();
  }
});

document.getElementById('btn-export').addEventListener('click', () => {
  const json = JSON.stringify(tilemap.toJSON(), null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'course.json';
  a.click();
  URL.revokeObjectURL(url);
});

// ── Resize handling ───────────────────────────────────────────────────────────

window.addEventListener('resize', () => renderer.resize());

// ── Render loop ───────────────────────────────────────────────────────────────

function loop() {
  renderer.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
