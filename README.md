# CableManager5000

A visual cable and equipment manager for desk setups with multiple computers / KVM switches.

- **2D layout editor** (`/`) — drag-and-drop device cards, draw color-coded cables with waypoints, directional arrows and labels, zoom/pan, JSON import/export.
- **3D desk view** (`/3d`) — configure desk dimensions (main + extension sections in cm), place devices with real sizes, elevation and rotation, and route cables under the desk with draggable ports and waypoints.

Built with React 18 + TypeScript + Vite, Zustand for state, and @react-three/fiber + drei for the 3D scene.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```

Note: the router uses `BrowserRouter`; static hosting without URL rewrites should switch to `HashRouter` in `src/App.tsx` (one-line change).

## Data

State persists to localStorage under the same keys and formats as the original vanilla-JS version (now in `legacy/`):

- `kvm-vis-state` — 2D layout `{ nextId, devices, cables }`.
- `kvm-3d-state` — desk config plus per-device 3D positions/dimensions and per-cable port/waypoint settings, overlaid by device id onto the 2D layout.

The **Export** button writes both into one file: `{ nextId, devices, cables, scene3d: { desk, devices3d, cables3d } }`. Importing such a file (in either view) restores the 2D layout *and* all 3D sizes, positions, and port placements — no re-setup needed. Files from the legacy app (no `scene3d` key) still import, and legacy importers simply ignore the extra key.

Note: 3D data is matched to devices by id, so editing a device keeps its 3D placement, but deleting and re-adding it creates a new id and resets its 3D placement.

## Keyboard shortcuts

2D: `S` select mode, `C` cable mode, `Del` delete selection, `Esc` cancel/deselect, scroll to zoom.
3D: `R` rotate selected device +90°, `Del` remove selected cable waypoint.

## Repo layout

```
legacy/      original vanilla-JS app (reference; superseded by src/)
src/
  lib/       pure logic: geometry, desk math, 3D cable routing, persistence
  stores/    Zustand stores (2D layout, 3D scene, toasts)
  pages/     editor2d/ and scene3d/ React components
scripts/     headless-Chrome verification scripts (playwright-core)
```
