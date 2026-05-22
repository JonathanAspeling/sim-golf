# SimGolf

A browser-based golf simulation and tycoon game inspired by the classic *Links* and *SimGolf* titles, built entirely in vanilla HTML, CSS, and JavaScript — no frameworks, no build tools, no compilation step. Open `index.html` in any modern browser and it just works.

---

## Project Status

**Milestone 1 — Course Editor** *(in progress)*

---

## Feature Roadmap

### Milestone 1 — Course Editor
- [x] HTML5 Canvas renderer with camera (pan & zoom)
- [x] Grid-based tile map (tee, fairway, rough, green, bunker, water, out-of-bounds)
- [x] Click-and-drag tile painting
- [x] Tile palette UI with colour swatches
- [x] Export course as JSON
- [ ] Undo / redo stack
- [ ] Course load from JSON
- [ ] Hole placement (tee box + flag pin)
- [ ] Brush size selector

### Milestone 2 — Shot Simulation
- [ ] Ball physics on a 2D arc (drive, iron, chip, putt)
- [ ] Lie modifiers per tile (fairway vs rough vs bunker)
- [ ] Wind system
- [ ] Spin and roll-out on the green
- [ ] Shot trajectory visualisation

### Milestone 3 — Golfer AI
- [ ] Golfer entities with stat profiles (power, accuracy, putting)
- [ ] Club selection heuristics
- [ ] Pathfinding from tee to hole
- [ ] Round simulation with scorecard

### Milestone 4 — Tycoon Layer
- [ ] Clubhouse and pro shop buildings
- [ ] Guest golfer simulation (bookings, satisfaction, revenue)
- [ ] Course maintenance (greens quality, bunker rake, irrigation)
- [ ] Finances: staff wages, green fees, upgrades
- [ ] Reputation and star ratings

---

## Development Notes

### Architecture

The codebase is intentionally modular from the start so each system can grow independently:

| File | Responsibility |
|---|---|
| `index.html` | App shell, DOM structure |
| `css/main.css` | All styles |
| `js/main.js` | Entry point — wires modules together, runs the render loop |
| `js/camera.js` | Pan and zoom transforms (world ↔ screen coordinates) |
| `js/tilemap.js` | Grid data structure and tile type definitions |
| `js/renderer.js` | Canvas drawing — culled tile rendering, grid overlay |
| `js/editor.js` | Input handling — painting, panning, zooming |

### Running Locally

Because the project uses ES modules (`type="module"`), you need a local HTTP server — browsers block module imports from `file://` URLs. The quickest options:

```bash
npx serve .
# or
python -m http.server 8080
```

Then visit `http://localhost:8080`.

### Controls

| Action | Input |
|---|---|
| Paint tiles | Left-click / left-drag |
| Pan camera | Right-click drag or middle-click drag |
| Zoom | Scroll wheel |

### Tile Format

The map stores a `Uint8Array` of tile IDs. Exporting via the **Export** button produces a JSON file:

```json
{
  "cols": 64,
  "rows": 64,
  "data": [0, 0, 2, 2, 1, ...]
}
```

This will be the interchange format for saving and loading courses in future milestones.

### Design Principles

- **No build step.** Vanilla JS modules, no bundler, no transpiler. What ships is what runs.
- **Data before rendering.** `TileMap` is a plain data structure. `Renderer` reads it; `Editor` writes to it. They don't know about each other.
- **Camera is pure maths.** `Camera` has no DOM or canvas dependencies — just coordinate transforms.
