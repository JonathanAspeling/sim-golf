/**
 * main.js — Entry point.
 *
 * Constructs all modules, wires them together, builds the sidebar UI,
 * handles Edit ↔ Play mode switching, and runs the render loop.
 */

import { TileMap, TILES }  from './tilemap.js';
import { Camera }          from './camera.js';
import { Renderer }        from './renderer.js';
import { Editor, TOOL }    from './editor.js';
import { History }         from './history.js';
import { HoleInfo }        from './hole.js';
import { Game, CLUBS }     from './game.js';
import { mapBoundsWorld }  from './grid.js';

// ── Module construction ───────────────────────────────────────────────────────

const viewport = document.getElementById('viewport');
const tilemap  = new TileMap(64, 64);
const camera   = new Camera();
const history  = new History(50);
const hole     = new HoleInfo();
const renderer = new Renderer(viewport, camera, tilemap, hole);
const editor   = new Editor(renderer, camera, tilemap, history, hole);
const game     = new Game(tilemap, hole, renderer, camera);

let playMode = false;

// ── Initial framing ───────────────────────────────────────────────────────────

const b = mapBoundsWorld(tilemap.cols, tilemap.rows);
camera.fitRect(b.minX, b.minZ, b.maxX, b.maxZ, renderer.viewportWidth, renderer.viewportHeight);

// ── Edit / Play mode switching ────────────────────────────────────────────────

const palette      = document.getElementById('palette');
const playPanel    = document.getElementById('play-panel');
const btnPlayMode  = document.getElementById('btn-play-mode');
const playHoleName = document.getElementById('play-hole-name');
const playParDisp  = document.getElementById('play-par-display');
const strokeCount  = document.getElementById('stroke-count-display');
const playResult   = document.getElementById('play-result');
const resultScore  = document.getElementById('result-score-text');
const resultLabel  = document.getElementById('result-label-text');

function enterPlay() {
  if (!hole.teePos)  { alert('Place a Tee marker before playing.'); return; }
  if (!hole.holePos) { alert('Place a Flag marker before playing.'); return; }

  playMode = true;
  game.reset();

  editor.setEditingEnabled(false);
  palette.style.display   = 'none';
  playPanel.style.display = 'flex';
  btnPlayMode.textContent = 'Edit';
  btnPlayMode.classList.add('playing');

  playHoleName.textContent = hole.name || 'Unnamed Hole';
  playParDisp.textContent  = `Par ${hole.par}`;
  playResult.classList.remove('visible');
  updatePlayUI();
}

function enterEdit() {
  playMode = false;

  editor.setEditingEnabled(true);
  palette.style.display   = 'flex';
  playPanel.style.display = 'none';
  btnPlayMode.textContent = 'Play';
  btnPlayMode.classList.remove('playing');
}

function updatePlayUI() {
  strokeCount.textContent = game.strokes;

  if (game.state === 'holed') {
    playResult.classList.add('visible');
    resultScore.textContent = `${game.strokes} stroke${game.strokes !== 1 ? 's' : ''}`;
    resultLabel.textContent = game.getScoreLabel();
    resultLabel.style.color = game.getScoreColor();
  }
}

btnPlayMode.addEventListener('click', () => {
  if (!playMode) enterPlay(); else enterEdit();
});

document.getElementById('btn-edit-mode').addEventListener('click', enterEdit);

document.getElementById('btn-play-again').addEventListener('click', () => {
  game.reset();
  playResult.classList.remove('visible');
  updatePlayUI();
});

// ── Play-mode mouse handling (alongside the editor's listeners) ──────────────

const canvasEl = renderer.three.domElement;

canvasEl.addEventListener('mousedown', e => {
  if (!playMode || e.button !== 0) return;
  game.onMouseDown(e.offsetX, e.offsetY);
});
canvasEl.addEventListener('mousemove', e => {
  if (!playMode) return;
  game.onMouseMove(e.offsetX, e.offsetY);
});
canvasEl.addEventListener('mouseup', e => {
  if (!playMode || e.button !== 0) return;
  game.onMouseUp(e.offsetX, e.offsetY);
  updatePlayUI();
});

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

const defaultTileBtn = tileButtonContainer.querySelector(`[data-tile-id="${editor.activeTileId}"]`);
if (defaultTileBtn) defaultTileBtn.classList.add('active');

// ── Hole info inputs ──────────────────────────────────────────────────────────

const holeNameInput = document.getElementById('hole-name');
const parBtns       = document.querySelectorAll('.par-btn');

holeNameInput.addEventListener('input', () => { hole.name = holeNameInput.value; });

function syncParUI(par) {
  parBtns.forEach(b => b.classList.toggle('active', Number(b.dataset.par) === par));
}

parBtns.forEach(btn => {
  btn.addEventListener('click', () => { hole.par = Number(btn.dataset.par); syncParUI(hole.par); });
});

syncParUI(hole.par);

// ── Club selector (play mode) ─────────────────────────────────────────────────

const clubBtns = document.querySelectorAll('.club-btn');

function setClub(id) {
  if (!CLUBS[id]) return;
  game.setClub(id);
  clubBtns.forEach(b => b.classList.toggle('active', b.dataset.club === id));
}

clubBtns.forEach(b => b.addEventListener('click', () => setClub(b.dataset.club)));
setClub('putter');

// ── Utility buttons ───────────────────────────────────────────────────────────

document.getElementById('btn-clear').addEventListener('click', () => {
  if (!confirm('Clear the entire course?')) return;
  const changes = [];
  for (let row = 0; row < tilemap.rows; row++) {
    for (let col = 0; col < tilemap.cols; col++) {
      const before = tilemap.get(col, row);
      if (before !== TILES.OUT_OF_BOUNDS.id) changes.push({ col, row, before, after: TILES.OUT_OF_BOUNDS.id });
    }
  }
  tilemap.clear();
  history.push(changes);
  renderer.refreshAllTiles();
});

document.getElementById('btn-export').addEventListener('click', () => {
  const payload = { ...tilemap.toJSON(), hole: hole.toJSON() };
  const json    = JSON.stringify(payload, null, 2);
  const blob    = new Blob([json], { type: 'application/json' });
  const url     = URL.createObjectURL(blob);
  const a       = document.createElement('a');
  a.href = url; a.download = 'course.json'; a.click();
  URL.revokeObjectURL(url);
});

const fileInput = document.getElementById('file-import');
document.getElementById('btn-import').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', () => {
  const file = fileInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = evt => {
    try { importCourse(JSON.parse(evt.target.result)); }
    catch { alert('Could not parse the file — make sure it is a valid SimGolf JSON export.'); }
    fileInput.value = '';
  };
  reader.readAsText(file);
});

function importCourse(json) {
  if (typeof json.cols !== 'number' || typeof json.rows !== 'number' || !Array.isArray(json.data)) {
    alert('Invalid course file — expected { cols, rows, data }.'); return;
  }
  tilemap.clear();
  const copyRows = Math.min(tilemap.rows, json.rows);
  const copyCols = Math.min(tilemap.cols, json.cols);
  for (let row = 0; row < copyRows; row++)
    for (let col = 0; col < copyCols; col++)
      tilemap.set(col, row, json.data[row * json.cols + col] ?? 0);
  history.clear();
  if (json.hole && typeof json.hole === 'object') hole.loadJSON(json.hole); else hole.reset();
  holeNameInput.value = hole.name;
  syncParUI(hole.par);
  renderer.refreshAllTiles();
  renderer.updateMarkers();
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────────

const keysDown = new Set();

function isTextInputFocused() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
}

document.addEventListener('keydown', e => {
  if (e.ctrlKey || e.metaKey) {
    if (playMode) return;
    const key = e.key.toLowerCase();
    if      (key === 'z' && !e.shiftKey) { e.preventDefault(); if (history.undo(tilemap)) renderer.refreshAllTiles(); }
    else if (key === 'z' &&  e.shiftKey) { e.preventDefault(); if (history.redo(tilemap)) renderer.refreshAllTiles(); }
    else if (key === 'y')                { e.preventDefault(); if (history.redo(tilemap)) renderer.refreshAllTiles(); }
    return;
  }
  if (isTextInputFocused()) return;
  if (playMode) {
    if      (e.key === '1') { setClub('driver'); return; }
    else if (e.key === '2') { setClub('iron');   return; }
    else if (e.key === '3') { setClub('wedge');  return; }
    else if (e.key === '4') { setClub('putter'); return; }
  }
  keysDown.add(e.key.toLowerCase());
});

document.addEventListener('keyup', e => {
  keysDown.delete(e.key.toLowerCase());
});

window.addEventListener('blur', () => keysDown.clear());

// Pixels-per-frame fed to camera.pan(). Tuned so pan speed matches the
// "feels like middle-drag at a comfortable pace" range across zoom levels.
const WASD_PAN_PX = 14;

function applyWasdPan() {
  let dx = 0, dy = 0;
  if (keysDown.has('w') || keysDown.has('arrowup'))    dy -= 1;
  if (keysDown.has('s') || keysDown.has('arrowdown'))  dy += 1;
  if (keysDown.has('a') || keysDown.has('arrowleft'))  dx += 1;
  if (keysDown.has('d') || keysDown.has('arrowright')) dx -= 1;
  if (dx === 0 && dy === 0) return;
  const len = Math.hypot(dx, dy);
  dx = (dx / len) * WASD_PAN_PX;
  dy = (dy / len) * WASD_PAN_PX;
  camera.pan(dx, dy, renderer.viewportWidth, renderer.viewportHeight);
}

// ── Resize ────────────────────────────────────────────────────────────────────

window.addEventListener('resize', () => renderer.resize());

// ── Render loop ───────────────────────────────────────────────────────────────

const CAMERA_FOLLOW = 0.08;  // chase-cam lerp factor per frame

function syncSceneFromGame() {
  if (playMode && game.ball) {
    renderer.setBall(game.ball.x, game.ball.y, game.ball.z, true);
    const aim = game.aimWorldEndpoints();
    if (aim) renderer.setAim(aim.start, aim.end);
    else     renderer.setAim(null, null);
    if (game.state === 'flying') {
      camera.lerpTargetXZ(game.ball.x, game.ball.z, CAMERA_FOLLOW);
    }
  } else {
    renderer.setBall(0, 0, 0, false);
    renderer.setAim(null, null);
  }
}

function loop() {
  applyWasdPan();
  if (playMode) game.update();
  syncSceneFromGame();
  renderer.render();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
