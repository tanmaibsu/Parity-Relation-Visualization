# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Interactive **8x10** grid for exploring **parity relations**, **checksum relations**, and **weight-based error analysis** ("Origami" layout). Users load an 80-bit row-major bitstring and JSON (or Python-style dict) relation maps; the UI colors cells by role, parity coverage, and analysis weights.

## Stack

- **React 18** + **Vite 5** (`type: "module"`)
- Entry: `src/main.jsx` -> `src/App.jsx`
- No router, no CSS framework (inline styles in `App.jsx`)

## Commands

```bash
npm install    # dependencies
npm run dev    # dev server (typically http://localhost:5173)
npm run build  # production bundle -> dist/
npm run preview # serve dist after build
```

There is no `test` or `lint` script in `package.json` unless you add one.

## Where logic lives

- **`src/App.jsx`** — Almost all behavior: grid state, `normalizeRelation` / `parseRelationsFlexible`, XOR parity application (`applyRelationXor`), analysis (`getMatrixWeightAdvanced`), and the full UI.
- **`src/App.css`** — Styles (dark mode, responsive layout, grid styling).
- **`src/defaultRelations.js`** — Alternate default relation data (tuple-string keys). The running app's defaults are the large `DEFAULT_RELATIONS` / `DEFAULT_CHECKSUM_RELATIONS` objects **in** `App.jsx`, not imported from `defaultRelations.js`.

## Domain notes (for edits)

- Grid indices are **0-based** `row,col`; internal ids are `"r,c"` strings.
- Role sets are hardcoded at top of `App.jsx`: `CHECKSUM` (3,4/3,5/4,4/4,5), `INDEX` (7,8/7,9), `ORIENTATION` (1,0/1,9/6,0/6,9).
- Parity cells are derived from keys of the loaded parity-relation map (not a fixed hardcoded list).
- **Double-click** any cell (including parity, checksum, index, orientation) toggles its bit **without** auto-recomputing parity/checksum. Use the "Recompute parity + checksum" button to recompute manually.
- **Single-click** selects parity (coverage mode) vs data (reverse lookup). Clicking outside any grid cell (empty space, labels, gaps) deselects the current selection.
- Key helper functions: `bitsToGrid80`/`gridToBits` (bitstring <-> 2D array), `normalizeRelation` (flexible key parsing), `applyRelationXor` (XOR parity computation), `buildReverseMap` (data cell -> covering parity cells), `findParityStatus`/`findChecksumStatus` (correctness checks).
- Three view modes: **weights** (default), **parityCoverage** (click parity cell), **reverse** (click data cell).

## Conventions

- Prefer **small, focused changes**; match existing patterns in `App.jsx` (hooks, `useMemo`, inline `style` objects).
- Every function in `App.jsx` has a descriptive comment above it — maintain this when adding or renaming functions.
- After changing relation parsing or grid math, manually verify in the browser with **Load bits** / **Load parity relations** / **Load checksum relations** and **Recompute parity + checksum**.
