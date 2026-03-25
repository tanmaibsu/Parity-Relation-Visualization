# 8×10 Origami Parity Visualizer

An interactive browser tool for exploring **parity relations**, **checksum relations**, and **weight-based error analysis** on an 8×10 bitgrid ("Origami" layout).

## Quick start

```bash
npm install
npm run dev        # dev server → http://localhost:5173
npm run build      # production bundle → dist/
npm run preview    # serve dist/ after build
```

## Overview

The grid holds an **80-bit** row-major bitstring. Cells are color-coded by role and analysis weight. You can load custom bitstrings and relation maps, flip bits interactively, and instantly see which cells are probable error sites.

## Cell roles

| Color | Role | Positions |
|---|---|---|
| Blue | Parity | Keys of the loaded parity-relation map |
| Yellow | Checksum | (3,4) (3,5) (4,4) (4,5) |
| Red | Index | (7,8) (7,9) |
| Purple | Orientation | (1,0) (1,9) (6,0) (6,9) |
| Green | Data | All remaining cells |

## View modes

The grid switches between three modes automatically based on what you click:

- **weights** (default) — every cell shows its error weight. High-weight cells are highlighted orange/red; probable error cells are pink.
- **parityCoverage** — activated when you click a parity cell. The selected parity cell turns blue; the data cells it covers turn pink; all weights are shown on covered cells.
- **reverse** — activated when you click a data cell. Parity relations that cover it appear orange; checksum relations appear green; cells covered by both appear purple.

## Interactions

| Action | Effect |
|---|---|
| **Single-click** a parity cell | Switch to parity-coverage mode; show that parity cell's covered bits and XOR status in the Inspector |
| **Single-click** a data cell | Switch to reverse mode; show which parity/checksum relations cover it |
| **Double-click** any cell | Flip that bit (0↔1); pushes state onto undo stack |
| **Esc** | Clear selection, return to weights mode |
| **Ctrl/⌘ + Z** | Undo last bit flip (up to 10 levels) |

## Loading data

### Bits

Paste an **80-character** string of `0`/`1` (row-major order) into the **Bits** text area, then click **Load bits**.

### Parity relations

Paste a mapping from parity-cell id to the list of data-cell ids it covers. Both **JSON** and **Python-style dicts** with tuple keys/values are accepted:

```json
{ "[1,1]": [[4,4],[7,4],[0,1]], "[1,2]": [[0,1],[7,4],[2,4]] }
```

```python
{(1,1): [(4,4),(7,4),(0,1)], (1,2): [(0,1),(7,4),(2,4)]}
```

Click **Load parity relations** to apply.

### Checksum relations

Same format as parity relations. Paste into the **Checksum relations** text area and click **Load checksum relations**.

## Actions

| Button | Effect |
|---|---|
| **Load bits** | Parse the bits text area and update the grid |
| **Load parity relations** | Parse and apply the parity-relation map |
| **Load checksum relations** | Parse and apply the checksum-relation map |
| **Recompute parity + checksum** | Overwrite parity and checksum cells by running XOR over their input sets |
| **Copy bits** | Copy the current 80-bit string to the clipboard |
| **Export JSON** | Download a timestamped JSON file with the current bitstring, thresholds, and full analysis |
| **Reset** | Restore all inputs, relations, and thresholds to built-in defaults |
| **Undo ⌘Z** | Revert the last bit flip |

## Analysis

Analysis runs automatically whenever the grid, relations, or thresholds change. Results appear in the **Analysis** sidebar panel:

| Metric | Description |
|---|---|
| Normalized weight | Raw matrix weight ÷ number of correct parity cells |
| Raw matrix weight | Sum of per-cell error weights across all parity and data cells |
| Correct parity | Number of parity cells whose XOR matches their stored bit |
| Parity errors | Parity cells whose XOR does not match |
| Checksum errors | Checksum cells whose XOR does not match |
| Probable data errors | Data cells flagged above the data threshold |
| Probable parity errors | Parity cells flagged above the parity threshold |
| Total probable error cells | Union of probable data + parity error cells (shown pink on the grid) |

### Thresholds (auto-recompute)

Adjust in the **Thresholds** panel; analysis updates instantly:

- **Parity threshold** — minimum parity-error count for a cell to be flagged as a probable parity error (default 2)
- **Data threshold** — minimum error-coverage count for a data cell to be flagged (default 2)
- **False positive allowance** — how many already-set (bit=1) cells may be included in probable-error lists (default 0)

## Inspector panel

Shows details for the currently selected cell:

- **Parity cell selected** — XOR of covered bits, stored parity bit, OK/Mismatch status, list of covered cells with their bits and weights
- **Data cell selected** — error weight, list of parity relations that cover it, list of checksum relations that cover it

## Color legend

| Color | Meaning |
|---|---|
| Blue | Parity cell |
| Pink | Covered bits (parity-coverage mode) |
| Yellow | Checksum cell |
| Red | Index cell |
| Purple | Orientation cell |
| Green | Data cell |
| Orange | Medium weight (≥ 2) or parity-hit (reverse mode) |
| Light green | Checksum-hit (reverse mode) |
| Violet | Parity + checksum hit (reverse mode) |
| Deep orange | High weight (≥ 4) |
| Rose/pink | Probable error cell |

## Input format notes

- Grid indices are **0-based** `row,col`; internal cell ids are `"row,col"` strings.
- Relation keys can be `"[r,c]"`, `"(r,c)"`, `"r,c"`, or `[r,c]` arrays — the parser normalises all forms.
- The default relations and bitstring are pre-loaded on startup so the tool is usable immediately without any input.
