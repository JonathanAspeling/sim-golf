/**
 * main.js — Entry point.
 *
 * Constructs all modules, wires them together, builds the sidebar UI,
 * registers keyboard shortcuts, and starts the render loop.
 */

import { TileMap, TILES }  from './tilemap.js';
import { Camera }          from './camera.js';
import { Renderer }        from './renderer.js';
import { Editor, TOOL }    from './editor.js';
import { History }         from './history.js';

// ── Module construction ───────────────────────────────────────────────────────

const canvas   = document.getElementById('main-canvas');
const tilemap  = new TileMap(64, 64);
const camera   = new Camera();
const history  = new History(50);
const renderer = new Renderer(canvas, camera, tilemap);
const editor   = new Editor(canvas, camera, tilemap, renderer, history);

// ── Initial fit ───────────────────────────────────────────────────────────────

renderer.resize();
const mapWorldW = tilemap.cols * renderer.tileSize;
const mapWorldH = tilemap.rows * renderer.tileSize;
camera.fitRect(0, 0, mapWorldW, mapWorldH, canvas.width, canvas.height);

// ── Tool mode buttons ─────────────────────────────────────────────────────────

const toolModeBtns = document.querySelectorAll('.tool-mode-btn');

function setActiveTool(tool) {
  editor.setActiveTool(tool);
  toolModeBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
}

toolModeBtns.forEach(btn => btn.addEventListener('click', () => setActiveTool(btn.dataset.tool)));
setActiveTool(TOOL.PAINT); // default

// ── Tile palette ──────────────────────────────────────────────────────────────

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

const defaultTileBtn = tileButtonContainer.querySelector(
  `[data-tile-id="${editor.activeTileId}"]`
);
if (defaultTileBtn) defaultTileBtn.classList.add('active');

// ── Utility buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear the entire course?')) return;
  // Record all non-OOB tiles so clear is undoable.
  const changes = [];
  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.cols; col++) {
      const before = tilemap.get(col, row);
      if (before !== TILES.OUT_OF_BOUNDS.id) {
        changes.push({ col, row, before, after: TILES.OUT_OF_BOUNDS.id });
      }
    }
  }
  tilemap.clear();
  history.push(changes);
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

// Import: hidden file input triggered by the button.
const fileInput = document.getElementById('file-import');

document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try {
      importCourse(JSON.parse(evt.target.result));
    } catch {
      alert('Could not parse the file — make sure it is a valid SimGolf JSON export.');
    }
    fileInput.value = ''; // reset so the same file can be re-imported
  };
  reader.readAsText(file);
});

function importCourse(json) {
  if (typeof json.cols !== 'number' || typeof json.rows !== 'number'
      || !Array.isArray(json.data)) {
    alert('Invalid course file — expected { cols, rows, data }.');
    return;
  }
  // Sizes may differ: copy whatever overlaps, pad the rest with OOB.
  tilemap.clear();
  const copyRows = Math.min(tilemap.rows, json.rows);
  const copyCols = Math.min(tilemap.cols, json.cols);
  for (let row = 0; row < copyRows; row++) {
    for (let col = 0; col < copyCols; col++) {
      tilemap.set(col, row, json.data[row * json.cols + col] ?? 0);
    }
  }
  history.clear(); // imported state is the new baseline
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(tilemap); }
  else if (key === 'z' && e.shiftKey) { e.preventDefault(); history.redo(tilemap); }
  else if (key === 'y')               { e.preventDefault(); history.redo(tilemap); }
});

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => renderer.resize());

// ── Render loop ───────────────────────────────────────────────────────────────

function loop() {
  renderer.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
