# Parity Relation Visualization

## What this is

Interactive **8×10** grid for exploring **parity relations**, **checksum relations**, and **weight-based error analysis** (“Origami” layout). Users load an 80-bit row-major bitstring and JSON (or Python-style dict) relation maps; the UI colors cells by role, parity coverage, and analysis weights.

## Stack

- **React 18** + **Vite 5** (`type: "module"`)
- Entry: `src/main.jsx` → `src/App.jsx`
- No router, no CSS framework (inline styles in `App.jsx`)

## Commands

```bash
npm install    # dependencies
npm run dev    # dev server (typically http://localhost:5173)
npm run build  # production bundle → dist/
npm run preview # serve dist after build
```

There is no `test` or `lint` script in `package.json` unless you add one.

## Where logic lives

- **`src/App.jsx`** — Almost all behavior: grid state, `normalizeRelation` / `parseRelationsFlexible`, XOR parity application (`applyRelationXor`), analysis (`getMatrixWeightAdvanced`), and the full UI.
- **`src/defaultRelations.js`** — Alternate default relation data (tuple-string keys). The running app’s defaults are the large `DEFAULT_RELATIONS` / `DEFAULT_CHECKSUM_RELATIONS` objects **in** `App.jsx`, not imported from `defaultRelations.js`.

## Domain notes (for edits)

- Grid indices are **0-based** `row,col`; internal ids are `"r,c"`.
- Parity cells are derived from keys of the loaded parity-relation map (not a fixed hardcoded list for “which cells are parity,” except role highlights like `CHECKSUM`, `INDEX`, `ORIENTATION` sets at top of `App.jsx`).
- **Double-click** a cell toggles its bit; **single-click** selects parity (coverage mode) vs data (reverse lookup).

## Conventions

- Prefer **small, focused changes**; match existing patterns in `App.jsx` (hooks, `useMemo`, inline `style` objects).
- After changing relation parsing or grid math, manually verify in the browser with **Load bits** / **Load parity relations** / **Load checksum relations** and **Recompute parity + checksum**.
