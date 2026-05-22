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
import { HoleInfo }        from './hole.js';

// ── Module construction ───────────────────────────────────────────────────────

const canvas   = document.getElementById('main-canvas');
const tilemap  = new TileMap(64, 64);
const camera   = new Camera();
const history  = new History(50);
const hole     = new HoleInfo();
const renderer = new Renderer(canvas, camera, tilemap, hole);
const editor   = new Editor(canvas, camera, tilemap, renderer, history, hole);

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
setActiveTool(TOOL.PAINT);

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

// ── Hole info inputs ──────────────────────────────────────────────────────────

const holeNameInput = document.getElementById('hole-name');
const parBtns       = document.querySelectorAll('.par-btn');

holeNameInput.addEventListener('input', () => {
  hole.name = holeNameInput.value;
});

function syncParUI(par) {
  parBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.par) === par));
}

parBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    hole.par = Number(btn.dataset.par);
    syncParUI(hole.par);
  });
});

syncParUI(hole.par); // mark default (4) on load

// ── Utility buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear the entire course?')) return;
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
  const payload = { ...tilemap.toJSON(), hole: hole.toJSON() };
  const json    = JSON.stringify(payload, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href        = url;
  a.download    = 'course.json';
  a.click();
  URL.revokeObjectURL(url);
});

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
    fileInput.value = '';
  };
  reader.readAsText(file);
});

function importCourse(json) {
  if (typeof json.cols !== 'number' || typeof json.rows !== 'number'
      || !Array.isArray(json.data)) {
    alert('Invalid course file — expected { cols, rows, data }.');
    return;
  }

  // Tilemap — crop or pad to the current grid size.
  tilemap.clear();
  const copyRows = Math.min(tilemap.rows, json.rows);
  const copyCols = Math.min(tilemap.cols, json.cols);
  for (let row = 0; row < copyRows; row++) {
    for (let col = 0; col < copyCols; col++) {
      tilemap.set(col, row, json.data[row * json.cols + col] ?? 0);
    }
  }
  history.clear();

  // Hole metadata.
  if (json.hole && typeof json.hole === 'object') {
    hole.loadJSON(json.hole);
  } else {
    hole.reset();
  }

  // Sync sidebar inputs to the restored state.
  holeNameInput.value = hole.name;
  syncParUI(hole.par);
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if      (key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(tilemap); }
  else if (key === 'z' &&  e.shiftKey) { e.preventDefault(); history.redo(tilemap); }
  else if (key === 'y')                { e.preventDefault(); history.redo(tilemap); }
});

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => renderer.resize());

// ── Render loop ───────────────────────────────────────────────────────────────

function loop() {
  renderer.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
