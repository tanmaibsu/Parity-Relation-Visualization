import React, { useMemo, useState } from "react";

const ROWS = 8;
const COLS = 10;

// --- helpers -------------------------------------------------
const idOf = (r, c) => `${r},${c}`;
const parseId = (s) => s.split(",").map(Number);

// Role sets
const CHECKSUM = new Set(["3,4","3,5","4,4","4,5"]);            // yellow
const INDEX = new Set(["7,8","7,9"]);                           // red
const ORIENTATION = new Set(["1,0","1,9","6,0","6,9"]);         // magenta

function bitsToGrid80(bitstr) {
  if (!/^[01]{80}$/.test(bitstr)) {
    throw new Error("Bitstring must be exactly 80 characters of 0/1.");
  }
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let i = 0; i < 80; i++) {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    grid[r][c] = bitstr.charCodeAt(i) === 49 ? 1 : 0; // '1' -> 1
  }
  return grid;
}

function gridToBits(grid) {
  let out = "";
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out += grid[r][c] ? "1" : "0";
    }
  }
  return out;
}

/**
 * Accepts keys like "(r, c)", "[r,c]" or "r,c" and values like [(r,c)] / ["r,c"]
 * Normalizes to: Record<"r,c", Set<"r,c">>
 */
function normalizeParityRelation(obj) {
  const out = {};
  for (const rawKey of Object.keys(obj)) {
    const key = String(rawKey).replace(/[()\[\]\s]/g, ""); // -> "r,c"
    const arr = obj[rawKey].map((p) =>
      Array.isArray(p)
        ? `${p[0]},${p[1]}`
        : String(p).replace(/[()\[\]\s]/g, "") // -> "r,c"
    );
    out[key] = new Set(arr);
  }
  return out;
}

/** Flexible parser: JSON first, then Python-style dict coercion */
function parseRelationsFlexible(text) {
  try { return JSON.parse(text); } catch (_) {}
  let t = text.trim();
  t = t.replace(/'/g, '"');                                    // single -> double
  t = t.replace(/(\(\s*\d+\s*,\s*\d+\s*\))\s*:/g, (_m, grp) => `"${grp}":`); // quote tuple keys
  t = t.replace(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/g, "[$1,$2]");    // tuples -> arrays
  return JSON.parse(t);
}

// --- component -----------------------------------------------
export default function ParityGridDynamic() {
  // DEFAULTS (your latest request)
  const [bitInput, setBitInput] = useState(
    "01000100011000001111110000101110101010100011000000011001000011011110000001101000"
  );
  const [relInput, setRelInput] = useState(JSON.stringify(DEFAULT_RELATIONS, null, 2));

  // State
  const [grid, setGrid] = useState(() => bitsToGrid80(bitInput));
  const [relations, setRelations] = useState(() =>
    normalizeParityRelation(DEFAULT_RELATIONS)
  );
  const parityIds = useMemo(() => Object.keys(relations).sort(), [relations]);
  const [selectedParity, setSelectedParity] = useState(null);

  const relationInfo = useMemo(() => {
    if (!selectedParity) return null;
    const covered = Array.from(relations[selectedParity] || []);
    const coveredBits = covered.map((cid) => {
      const [r, c] = parseId(cid);
      return grid[r][c];
    });
    const xor = coveredBits.reduce((a, b) => a ^ b, 0);
    const [pr, pc] = parseId(selectedParity);
    const stored = grid[pr][pc];
    return { covered, xor, stored, ok: xor == stored };
  }, [selectedParity, relations, grid]);

  // Actions
  function loadBits() {
    try {
      const g = bitsToGrid80(bitInput);
      setGrid(g);
      // keep selection but inspector recomputes from new grid automatically
    } catch (e) {
      alert(e.message);
    }
  }
  function loadRelations() {
    try {
      const obj = parseRelationsFlexible(relInput);
      // Bounds check (strip [] and () from keys/values too)
      for (const [k, arr] of Object.entries(obj)) {
        const keyClean = String(k).replace(/[()\[\]\s]/g, ""); // -> "r,c"
        const [kr, kc] = keyClean.split(",").map(Number);
        if (!(kr >= 0 && kr < ROWS && kc >= 0 && kc < COLS)) {
          throw new Error(`Parity key out of bounds: ${k}`);
        }
        for (const p of arr) {
          const tup = Array.isArray(p)
            ? p
            : String(p).replace(/[()\[\]\s]/g, "").split(",").map(Number);
          const [r, c] = tup;
          if (!(r >= 0 && r < ROWS && c >= 0 && c < COLS)) {
            throw new Error(`Covered cell out of bounds at key ${k}: (${r},${c})`);
          }
        }
      }
      setRelations(normalizeParityRelation(obj));
      setSelectedParity(null);
    } catch (e) {
      alert(`Invalid parity relation: ${e.message || e}`);
    }
  }

  // NEW: toggle a cell's bit on double-click and keep the 80-bit input in sync
  function toggleCell(r, c) {
    setGrid((prev) => {
      const next = prev.map((row) => row.slice());
      next[r][c] = next[r][c] ? 0 : 1;
      setBitInput(gridToBits(next)); // keep text box synced
      return next;
    });
  }

  // Reset selection (clear pink highlights)
  function resetSelection() {
    setSelectedParity(null);
  }

  // Role helper (base color before overlays)
  function baseColorForCell(id, isParity) {
    if (isParity) return "#60a5fa";           // blue
    if (CHECKSUM.has(id)) return "#fde047";   // yellow-400
    if (INDEX.has(id)) return "#ef4444";      // red-500
    if (ORIENTATION.has(id)) return "#d946ef";// fuchsia-500 (magenta-ish)
    return "#22c55e";                         // green (data)
  }

  return (
    <div style={{ padding: 16, display: "grid", gap: 16, gridTemplateColumns: "1fr 420px", userSelect: "none" }}>
      {/* GRID */}
      <div>
        <h2 style={{ margin: "4px 0 12px", fontWeight: 700 }}>8×10 Origami</h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${COLS}, 42px)`,
            gap: 6,
          }}
        >
          {Array.from({ length: ROWS }).map((_, r) =>
            Array.from({ length: COLS }).map((__, c) => {
              const id = idOf(r, c);
              const isParity = parityIds.includes(id);
              const isSelected = selectedParity === id;
              const isCovered = !!(selectedParity && relations[selectedParity]?.has(id));

              // Background priority:
              // 1) selected parity = blue
              // 2) covered (relation) = pink
              // 3) base role color (parity/data/checksum/index/orientation)
              const bg = isSelected
                ? "#60a5fa"
                : isCovered
                ? "#f9a8d4" // pink-300
                : baseColorForCell(id, isParity);

              return (
                <button
                  key={id}
                  onClick={() => {
                    console.log(id)
                    if (isParity) {
                      setSelectedParity((prev) => (prev === id ? null : id)); // toggle selection
                    }
                  }}
                  onDoubleClick={() => toggleCell(r, c)}   // <= NEW: flip on double-click
                  title={id}
                  style={{
                    height: 42,
                    width: 42,
                    borderRadius: 8,
                    fontWeight: 700,
                    border: "1px solid rgba(0,0,0,.15)",
                    background: bg,
                    color: "black",
                    outline: isSelected ? "4px solid rgba(0,0,0,.6)" : undefined,
                    boxShadow: isCovered ? "inset 0 0 0 3px rgba(0,0,0,.75)" : undefined,
                    cursor: "pointer",
                  }}
                >
                  {grid[r][c]}
                </button>
              );
            })
          )}
        </div>

        {/* Legend + Reset */}
        <div style={{ marginTop: 10, fontSize: 12, opacity: 0.85 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ background: "#60a5fa", padding: "2px 6px", borderRadius: 6 }}>parity</span>
            <span style={{ background: "#22c55e", padding: "2px 6px", borderRadius: 6 }}>data</span>
            <span style={{ background: "#fde047", padding: "2px 6px", borderRadius: 6 }}>checksum</span>
            <span style={{ background: "#ef4444", padding: "2px 6px", borderRadius: 6 }}>index</span>
            <span style={{ background: "#d946ef", padding: "2px 6px", borderRadius: 6 }}>orientation</span>
            <span style={{ background: "#f9a8d4", padding: "2px 6px", borderRadius: 6 }}>covered</span>
            <button
              onClick={resetSelection}
              style={{ marginLeft: "10px", padding: "10px 10px", borderRadius: 8, border: "1px solid #ddd", cursor: "pointer", background: "#fff" }}
            >
              Reset
            </button>
          </div>
          <div style={{ marginTop: 6 }}>Tip: double-click any cell to flip its bit. Click a blue cell to show coverage.</div>
        </div>
      </div>

      {/* SIDEBAR */}
      <div style={{ display: "grid", gap: 12 }}>
        <section style={{ padding: 12, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", background: "#fff" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Load Inputs</div>

          <label style={{ fontSize: 12, opacity: 0.7 }}>80-bit string (row-major)</label>
          <textarea
            rows={3}
            value={bitInput}
            onChange={(e) => setBitInput(e.target.value.trim())}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <button onClick={loadBits} style={{ marginTop: 6 }}>Load bits</button>
          <br></br>
          <label style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            parityRelation (JSON or Python-style dict with tuple keys)
          </label>
          <textarea
            rows={10}
            value={relInput}
            onChange={(e) => setRelInput(e.target.value)}
            style={{ width: "100%", fontFamily: "monospace" }}
          />
          <button onClick={loadRelations} style={{ marginTop: 6 }}>Load relations</button>
        </section>

        <section style={{ padding: 12, borderRadius: 12, boxShadow: "0 2px 12px rgba(0,0,0,.06)", background: "#fff" }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Inspector</div>
          {selectedParity ? (
            <>
              <div style={{ fontSize: 14, marginBottom: 6 }}>
                <b>Parity cell:</b> {selectedParity}
              </div>
              <div style={{ fontSize: 14 }}>
                XOR(covered) = <b>{relationInfo?.xor}</b>, stored parity bit = <b>{relationInfo?.stored}</b>
              </div>
              <div style={{ marginTop: 6 }}>
                Status:{" "}
                {relationInfo?.ok ? (
                  <span style={{ background: "#d1fae5", padding: "2px 6px", borderRadius: 6 }}>OK</span>
                ) : (
                  <span style={{ background: "#fee2e2", padding: "2px 6px", borderRadius: 6 }}>Mismatch</span>
                )}
              </div>

              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>Covered cells:</div>
              <ul style={{ maxHeight: 140, overflow: "auto", marginTop: 4, fontFamily: "monospace", fontSize: 12 }}>
                {Array.from(relations[selectedParity]).map((cid) => (
                  <li key={cid}>{cid}</li>
                ))}
              </ul>
            </>
          ) : (
            <div style={{ opacity: 0.7, fontSize: 14 }}>Click a parity cell in the grid.</div>
          )}
        </section>
      </div>
    </div>
  );
}

/** ----------- Default parity map (JSON-friendly; tuples are fine via loader) ------------ */
const DEFAULT_RELATIONS = {
  "[1,1]": [[0,1],[2,4],[0,0],[3,7],[5,7],[0,6],[3,6],[7,2],[6,0],[5,3],[5,9],[0,5]],
  "[1,2]": [[0,7],[2,4],[4,0],[0,0],[3,2],[5,7],[0,6],[2,3],[5,0],[3,6],[0,8],[3,5]],
  "[1,3]": [[0,7],[4,0],[0,4],[7,0],[2,0],[5,7],[7,3],[3,6],[5,3],[2,5],[1,9],[7,8]],
  "[1,4]": [[3,4],[3,7],[5,4],[0,3],[2,0],[3,3],[2,6],[7,2],[2,2],[1,0],[7,5],[7,8]],
  "[2,1]": [[7,7],[4,9],[5,4],[4,6],[0,9],[4,2],[4,5],[5,0],[0,5],[5,3],[1,9],[5,2]],
  "[3,1]": [[0,1],[4,4],[2,7],[4,3],[4,9],[7,5],[0,6],[7,9],[5,6],[6,0],[5,9],[3,2]],
  "[1,8]": [[0,8],[2,5],[0,9],[3,2],[5,2],[0,3],[3,3],[7,7],[6,9],[5,6],[5,0],[0,4]],
  "[1,7]": [[0,2],[2,5],[4,9],[0,9],[3,7],[5,2],[0,3],[2,6],[5,9],[3,3],[0,1],[3,4]],
  "[1,6]": [[0,2],[4,9],[0,5],[7,9],[2,9],[5,2],[7,6],[3,3],[5,6],[2,4],[1,0],[7,1]],
  "[1,5]": [[3,5],[3,2],[5,5],[0,6],[2,9],[3,6],[2,3],[7,7],[2,7],[1,9],[7,4],[7,1]],
  "[2,8]": [[7,2],[4,0],[5,5],[4,3],[0,0],[4,7],[4,4],[5,9],[0,4],[5,6],[1,0],[5,7]],
  "[3,8]": [[0,8],[4,5],[2,2],[4,6],[4,0],[7,4],[0,3],[7,0],[5,3],[6,9],[5,0],[3,7]],
  "[6,1]": [[7,1],[5,4],[7,0],[4,7],[2,7],[7,6],[4,6],[0,2],[1,0],[2,3],[2,9],[7,5]],
  "[6,2]": [[7,7],[5,4],[3,0],[7,0],[4,2],[2,7],[7,6],[5,3],[2,0],[4,6],[7,8],[4,5]],
  "[6,3]": [[7,7],[3,0],[7,4],[0,0],[5,0],[2,7],[0,3],[4,6],[2,3],[5,5],[6,9],[0,8]],
  "[6,4]": [[4,4],[4,7],[2,4],[7,3],[5,0],[4,3],[5,6],[0,2],[5,2],[6,0],[0,5],[0,8]],
  "[5,1]": [[0,7],[3,9],[2,4],[3,6],[7,9],[3,2],[3,5],[2,0],[7,5],[2,3],[6,9],[2,2]],
  "[4,1]": [[7,1],[3,4],[5,7],[3,3],[3,9],[0,5],[7,6],[0,9],[2,6],[1,0],[2,9],[4,2]],
  "[6,8]": [[7,8],[5,5],[7,9],[4,2],[2,2],[7,3],[4,3],[0,7],[1,9],[2,6],[2,0],[7,4]],
  "[6,7]": [[7,2],[5,5],[3,9],[7,9],[4,7],[2,2],[7,3],[5,6],[2,9],[4,3],[7,1],[4,4]],
  "[6,6]": [[7,2],[3,9],[7,5],[0,9],[5,9],[2,2],[0,6],[4,3],[2,6],[5,4],[6,0],[0,1]],
  "[6,5]": [[4,5],[4,2],[2,5],[7,6],[5,9],[4,6],[5,3],[0,7],[5,7],[6,9],[0,4],[0,1]],
  "[5,8]": [[0,2],[3,0],[2,5],[3,3],[7,0],[3,7],[3,4],[2,9],[7,4],[2,6],[6,0],[2,7]],
  "[4,8]": [[7,8],[3,5],[5,2],[3,6],[3,0],[0,4],[7,3],[0,0],[2,3],[1,9],[2,0],[4,7]]
};
