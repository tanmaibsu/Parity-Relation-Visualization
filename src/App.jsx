import React, { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

const ROWS = 8;
const COLS = 10;

const idOf = (r, c) => `${r},${c}`;
const parseId = (s) => String(s).split(",").map(Number);

// ----- role sets -----
const CHECKSUM    = new Set(["3,4", "3,5", "4,4", "4,5"]);
const INDEX       = new Set(["7,8", "7,9"]);
const ORIENTATION = new Set(["1,0", "1,9", "6,0", "6,9"]);

// ---------------- helpers ----------------

// Convert an 80-character "0"/"1" bitstring into an 8×10 2D grid array (row-major order).
function bitsToGrid80(bitstr) {
  if (!/^[01]{80}$/.test(bitstr)) {
    throw new Error("Bitstring must be exactly 80 characters of 0/1.");
  }
  const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  for (let i = 0; i < 80; i++) {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    grid[r][c] = bitstr.charCodeAt(i) === 49 ? 1 : 0;
  }
  return grid;
}

// Convert an 8×10 2D grid array back into an 80-character bitstring.
function gridToBits(grid) {
  let out = "";
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      out += grid[r][c] ? "1" : "0";
  return out;
}

// XOR-reduce an array of numeric values (0/1) into a single bit.
function xorValues(values) {
  return values.reduce((acc, v) => acc ^ Number(v), 0);
}

// Normalize a raw relation map (various key formats) into { "r,c": Set(["r,c", ...]) }.
// Strips brackets, parens, and whitespace from keys; converts array-of-pair values to "r,c" strings.
function normalizeRelation(obj) {
  const out = {};
  for (const rawKey of Object.keys(obj || {})) {
    const key = String(rawKey).replace(/[()\[\]\s]/g, "");
    const value = obj[rawKey];
    if (!Array.isArray(value)) continue;
    const arr = value
      .map((p) =>
        Array.isArray(p)
          ? `${p[0]},${p[1]}`
          : String(p).replace(/[()\[\]\s]/g, "")
      )
      .filter((x) => /^\d+,\d+$/.test(x));
    out[key] = new Set(arr);
  }
  return out;
}

// Parse user-supplied relation text that may be JSON or Python-style dict syntax.
// Attempts JSON.parse first, then falls back to converting Python tuples/single-quotes to valid JSON.
function parseRelationsFlexible(text) {
  try { return JSON.parse(text); } catch (_) {}
  let t = text.trim();
  t = t.replace(/'/g, '"');
  t = t.replace(
    /(\(\s*\d+\s*,\s*\d+\s*\))\s*:/g,
    (_m, grp) => `"${grp}":`
  );
  t = t.replace(/\(\s*(\d+)\s*,\s*(\d+)\s*\)/g, "[$1,$2]");
  return JSON.parse(t);
}

// For each relation key (output cell), compute XOR of its input cells and write the result
// into the output cell. Returns a new grid (does not mutate the original).
function applyRelationXor(grid, relations) {
  const next = grid.map((row) => row.slice());
  for (const outId of Object.keys(relations || {})) {
    const [rr, cc] = parseId(outId);
    if (Number.isNaN(rr) || Number.isNaN(cc) || rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS)
      continue;
    const inputs = Array.from(relations[outId] || []);
    const vals = inputs.map((cid) => {
      const [r, c] = parseId(cid);
      if (Number.isNaN(r) || Number.isNaN(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS)
        return 0;
      return Number(next[r][c]);
    });
    next[rr][cc] = xorValues(vals);
  }
  return next;
}

// Invert the parity relation map: for each data cell, list which parity cells cover it.
// Returns { dataCellId: [parityCellId, ...] }.
function buildReverseMap(parityRelations) {
  const reverse = {};
  for (const parityId of Object.keys(parityRelations || {})) {
    for (const dataId of Array.from(parityRelations[parityId] || [])) {
      if (!reverse[dataId]) reverse[dataId] = [];
      reverse[dataId].push(parityId);
    }
  }
  return reverse;
}

// Check each parity cell: compare its stored value against the XOR of its input cells.
// Returns { correct: [...ids], incorrect: [...ids] }.
function findParityStatus(grid, parityRelations) {
  const correct = [], incorrect = [];
  for (const parityId of Object.keys(parityRelations || {})) {
    const [pr, pc] = parseId(parityId);
    if (Number.isNaN(pr) || Number.isNaN(pc) || pr < 0 || pr >= ROWS || pc < 0 || pc >= COLS)
      continue;
    const inputs = Array.from(parityRelations[parityId] || []);
    const vals = inputs.map((cid) => {
      const [r, c] = parseId(cid);
      if (Number.isNaN(r) || Number.isNaN(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS)
        return 0;
      return Number(grid[r][c]);
    });
    const xor = xorValues(vals);
    if (Number(grid[pr][pc]) === xor) correct.push(parityId);
    else incorrect.push(parityId);
  }
  return { correct, incorrect };
}

// Check each checksum cell: compare its stored value against the XOR of its input cells.
// Returns { checksumErrors: [...ids], checksumRelatedErrors: [...inputIds] } for failing checksums.
function findChecksumStatus(grid, checksumRelations) {
  const checksumErrors = [], checksumRelatedErrors = [];
  for (const checksumId of Object.keys(checksumRelations || {})) {
    const [cr, cc] = parseId(checksumId);
    if (Number.isNaN(cr) || Number.isNaN(cc) || cr < 0 || cr >= ROWS || cc < 0 || cc >= COLS)
      continue;
    const inputs = Array.from(checksumRelations[checksumId] || []);
    const vals = inputs.map((cid) => {
      const [r, c] = parseId(cid);
      if (Number.isNaN(r) || Number.isNaN(c) || r < 0 || r >= ROWS || c < 0 || c >= COLS)
        return 0;
      return Number(grid[r][c]);
    });
    const xor = xorValues(vals);
    const stored = Number(grid[cr][cc]);
    if (xor !== stored) {
      checksumErrors.push(checksumId);
      checksumRelatedErrors.push(...inputs);
    }
  }
  return { checksumErrors, checksumRelatedErrors };
}

// Count occurrences of each element in an array. Returns { element: count }.
function counter(arr) {
  const m = {};
  for (const x of arr) m[x] = (m[x] || 0) + 1;
  return m;
}

// Find all checksum cells whose input set includes the given cell.
function findChecksumRelationsForCell(cellId, checksumRelations) {
  const hits = [];
  for (const checksumId of Object.keys(checksumRelations || {})) {
    if ((checksumRelations[checksumId] || new Set()).has(cellId))
      hits.push(checksumId);
  }
  return hits;
}

// Find all parity cells whose input set includes the given cell.
function findParityRelationsForCell(cellId, parityRelations) {
  const hits = [];
  for (const parityId of Object.keys(parityRelations || {})) {
    if ((parityRelations[parityId] || new Set()).has(cellId))
      hits.push(parityId);
  }
  return hits;
}

// Compute the full weight-based error analysis. Aggregates parity and checksum status,
// counts how many failing relations each cell appears in, applies thresholds and false-positive
// limits, and returns probable error cells with per-cell weights and a normalized matrix weight.
function getMatrixWeightAdvanced({
  grid, parityRelations, checksumRelations,
  thresholdParity = 2, thresholdData = 2, falsePositive = 0,
}) {
  const parityStatus    = findParityStatus(grid, parityRelations);
  const parityIncorrect = parityStatus.incorrect;
  const parityCorrect   = parityStatus.correct;

  const probableErrorIndexes = [];
  for (const pid of parityIncorrect)
    probableErrorIndexes.push(...Array.from(parityRelations[pid] || []));

  const { checksumErrors, checksumRelatedErrors } = findChecksumStatus(grid, checksumRelations);
  for (const cid of checksumErrors) probableErrorIndexes.push(cid);

  const countedProbable = counter(probableErrorIndexes);
  const cellWeights = {};
  const probableDataErrorByWeight = {};

  for (const pos of Object.keys(countedProbable)) {
    const weight = countedProbable[pos];
    cellWeights[pos] = weight;

    if (!probableDataErrorByWeight[weight]) probableDataErrorByWeight[weight] = [];
    probableDataErrorByWeight[weight].push(pos);
  }

  const dataBitToParityBit = buildReverseMap(parityRelations);
  const allProbableParity  = [];
  for (const pos of Object.keys(cellWeights)) {
    const linked = dataBitToParityBit[pos] || [];
    allProbableParity.push(...linked);
  }
  allProbableParity.push(...parityIncorrect);

  const countedParityErrors = counter(allProbableParity);

  let matrixWeight = 0;
  const probableParityError = [];
  const probableDataErrors  = [];

  let falsePositiveData   = 0;
  let falsePositiveParity = 0;
  const fpDataLimit   = Math.floor((falsePositive + 1) / 2);
  const fpParityLimit = Math.floor(falsePositive / 2);

  for (const pid of Object.keys(countedParityErrors)) {
    const weight = countedParityErrors[pid];
    matrixWeight += weight;
    const [r, c] = parseId(pid);
    const currentValue =
      !Number.isNaN(r) && !Number.isNaN(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS
        ? Number(grid[r][c]) : 0;
    if (weight >= thresholdParity) {
      if (currentValue === 0) {
        probableParityError.push(pid);
      } else if (falsePositiveParity < fpParityLimit) {
        probableParityError.push(pid);
        falsePositiveParity += 1;
      }
      cellWeights[pid] = Math.max(cellWeights[pid] || 0, weight);
    }
  }

  const sortedDataWeights = Object.keys(probableDataErrorByWeight).map(Number).sort((a, b) => b - a);
  for (const weight of sortedDataWeights) {
    const cells = probableDataErrorByWeight[weight];
    if (weight >= thresholdData) {
      for (const pos of cells) {
        const [r, c] = parseId(pos);
        const currentValue =
          !Number.isNaN(r) && !Number.isNaN(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS
            ? Number(grid[r][c]) : 0;
        if (currentValue === 0) {
          probableDataErrors.push(pos);
        } else if (falsePositiveData < fpDataLimit) {
          probableDataErrors.push(pos);
          falsePositiveData += 1;
        }
      }
    }
    matrixWeight += weight * cells.length;
  }

  const probableErrorCells = [...new Set([...probableDataErrors, ...probableParityError])];
  const normalizedWeight   =
    parityCorrect.length > 0 ? matrixWeight / parityCorrect.length : matrixWeight;

  return {
    parityCorrect, parityIncorrect,
    checksumErrors, checksumRelatedErrors,
    cellWeights, probableErrorCells,
    probableParityError, probableDataErrors,
    normalizedWeight, rawMatrixWeight: matrixWeight, falsePositive,
  };
}

function getMatrixWeightAdvanced2({
  grid, parityRelations, checksumRelations,
  thresholdParity = 2, thresholdData = 2, falsePositive = 0,
}) {
  const parityStatus    = findParityStatus(grid, parityRelations);
  const parityIncorrect = parityStatus.incorrect;
  const parityCorrect   = parityStatus.correct;

  const probableErrorIndexes = [];
  for (const pid of parityIncorrect)
    probableErrorIndexes.push(...Array.from(parityRelations[pid] || []));

  const { checksumErrors, checksumRelatedErrors } = findChecksumStatus(grid, checksumRelations);
  for (const cid of checksumErrors) probableErrorIndexes.push(cid);

  const countedProbable = counter(probableErrorIndexes);
  const cellWeights = {};
  const probableDataErrorByWeight = {};

  for (const pos of Object.keys(countedProbable)) {
    const count = countedProbable[pos];
    const isInChecksumRelated = checksumRelatedErrors.includes(pos);
    const isInChecksumErrors  = checksumErrors.includes(pos);

    let extra = 0;
    if (isInChecksumRelated && isInChecksumErrors) extra = 1;
    else if (isInChecksumRelated || isInChecksumErrors) extra = 1;

    const weight = count + extra;
    cellWeights[pos] = weight;

    if (!probableDataErrorByWeight[weight]) probableDataErrorByWeight[weight] = [];
    probableDataErrorByWeight[weight].push(pos);
  }

  const dataBitToParityBit = buildReverseMap(parityRelations);
  const allProbableParity  = [];
  for (const pos of Object.keys(cellWeights)) {
    const linked = dataBitToParityBit[pos] || [];
    allProbableParity.push(...linked);
  }
  allProbableParity.push(...parityIncorrect);

  const countedParityErrors = counter(allProbableParity);

  let matrixWeight = 0;
  const probableParityError = [];
  const probableDataErrors  = [];

  let falsePositiveData   = 0;
  let falsePositiveParity = 0;
  const fpDataLimit   = Math.floor((falsePositive + 1) / 2);
  const fpParityLimit = Math.floor(falsePositive / 2);

  for (const pid of Object.keys(countedParityErrors)) {
    const weight = countedParityErrors[pid];
    matrixWeight += weight;
    const [r, c] = parseId(pid);
    const currentValue =
      !Number.isNaN(r) && !Number.isNaN(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS
        ? Number(grid[r][c]) : 0;
    if (weight >= thresholdParity) {
      if (currentValue === 0) {
        probableParityError.push(pid);
      } else if (falsePositiveParity < fpParityLimit) {
        probableParityError.push(pid);
        falsePositiveParity += 1;
      }
      cellWeights[pid] = Math.max(cellWeights[pid] || 0, weight);
    }
  }

  const sortedDataWeights = Object.keys(probableDataErrorByWeight).map(Number).sort((a, b) => b - a);
  for (const weight of sortedDataWeights) {
    const cells = probableDataErrorByWeight[weight];
    if (weight >= thresholdData) {
      for (const pos of cells) {
        const [r, c] = parseId(pos);
        const currentValue =
          !Number.isNaN(r) && !Number.isNaN(c) && r >= 0 && r < ROWS && c >= 0 && c < COLS
            ? Number(grid[r][c]) : 0;
        if (currentValue === 0) {
          probableDataErrors.push(pos);
        } else if (falsePositiveData < fpDataLimit) {
          probableDataErrors.push(pos);
          falsePositiveData += 1;
        }
      }
    }
    matrixWeight += weight * cells.length;
  }

  const probableErrorCells = [...new Set([...probableDataErrors, ...probableParityError])];
  const normalizedWeight   =
    parityCorrect.length > 0 ? matrixWeight / parityCorrect.length : matrixWeight;

  return {
    parityCorrect, parityIncorrect,
    checksumErrors, checksumRelatedErrors,
    cellWeights, probableErrorCells,
    probableParityError, probableDataErrors,
    normalizedWeight, rawMatrixWeight: matrixWeight, falsePositive,
  };
}

// ---------- DEFAULT PARITY RELATIONS ----------
const DEFAULT_RELATIONS = {
  "[1,1]": [[4,4],[7,4],[0,1],[4,0],[7,7],[2,7],[5,4],[4,6],[0,6],[2,9],[3,2],[1,9]],
  "[1,2]": [[0,1],[7,4],[2,4],[4,0],[4,4],[0,0],[0,2],[7,6],[2,6],[3,6],[6,9],[4,7]],
  "[1,3]": [[0,7],[2,4],[6,0],[7,1],[4,9],[7,9],[4,5],[5,6],[0,5],[2,2],[5,9],[3,2]],
  "[1,4]": [[4,4],[2,7],[5,4],[0,3],[7,9],[2,6],[7,2],[3,6],[0,5],[5,9],[0,8],[4,7]],
  "[2,1]": [[4,4],[7,4],[7,1],[0,9],[5,7],[3,0],[7,3],[2,9],[3,6],[5,3],[2,5],[6,9]],
  "[3,1]": [[4,0],[3,4],[2,7],[0,0],[3,7],[0,6],[0,2],[5,0],[0,5],[6,0],[5,3],[2,5]],
  "[1,8]": [[4,5],[7,5],[0,8],[4,9],[7,2],[2,2],[5,5],[4,3],[0,3],[2,0],[3,7],[1,0]],
  "[1,7]": [[0,8],[7,5],[2,5],[4,9],[4,5],[0,9],[0,7],[7,3],[2,3],[3,3],[6,0],[4,2]],
  "[1,6]": [[0,2],[2,5],[6,9],[7,8],[4,0],[7,0],[4,4],[5,3],[0,4],[2,7],[5,0],[3,7]],
  "[1,5]": [[4,5],[2,2],[5,5],[0,6],[7,0],[2,3],[7,7],[3,3],[0,4],[5,0],[0,1],[4,2]],
  "[2,8]": [[4,5],[7,5],[7,8],[0,0],[5,2],[3,9],[7,6],[2,0],[3,3],[5,6],[2,4],[6,0]],
  "[3,8]": [[4,9],[3,5],[2,2],[0,9],[3,2],[0,3],[0,7],[5,9],[0,4],[6,9],[5,6],[2,4]],
  "[6,1]": [[3,4],[0,4],[7,1],[3,0],[0,7],[5,7],[2,4],[3,6],[7,6],[5,9],[4,2],[6,9]],
  "[6,2]": [[7,1],[0,4],[5,4],[3,0],[3,4],[7,0],[7,2],[0,6],[5,6],[4,6],[1,9],[3,7]],
  "[6,3]": [[7,7],[5,4],[1,0],[0,1],[3,9],[0,9],[3,5],[2,6],[7,5],[5,2],[2,9],[4,2]],
  "[6,4]": [[3,4],[5,7],[2,4],[7,3],[0,9],[5,6],[0,2],[4,6],[7,5],[2,9],[7,8],[3,7]],
  "[5,1]": [[3,4],[0,4],[0,1],[7,9],[2,7],[4,0],[0,3],[5,9],[4,6],[2,3],[5,5],[1,9]],
  "[4,1]": [[3,0],[4,4],[5,7],[7,0],[4,7],[7,6],[7,2],[2,0],[7,5],[1,0],[2,3],[5,5]],
  "[6,8]": [[3,5],[0,5],[7,8],[3,9],[0,2],[5,2],[2,5],[3,3],[7,3],[5,0],[4,7],[6,0]],
  "[6,7]": [[7,8],[0,5],[5,5],[3,9],[3,5],[7,9],[7,7],[0,3],[5,3],[4,3],[1,0],[3,2]],
  "[6,6]": [[7,2],[5,5],[1,9],[0,8],[3,0],[0,0],[3,4],[2,3],[7,4],[5,7],[2,0],[4,7]],
  "[6,5]": [[3,5],[5,2],[2,5],[7,6],[0,0],[5,3],[0,7],[4,3],[7,4],[2,0],[7,1],[3,2]],
  "[5,8]": [[3,5],[0,5],[0,8],[7,0],[2,2],[4,9],[0,6],[5,0],[4,3],[2,6],[5,4],[1,0]],
  "[4,8]": [[3,9],[4,5],[5,2],[7,9],[4,2],[7,3],[7,7],[2,9],[7,4],[1,9],[2,6],[5,4]],
};

// ---------- DEFAULT CHECKSUM RELATIONS ----------
const DEFAULT_CHECKSUM_RELATIONS = {
  "[3,4]": [[0,0],[0,1],[0,2],[0,3],[0,4],[1,0],[2,0],[2,2],[2,3],[2,4],[3,0],[3,2],[3,3]],
  "[3,5]": [[0,5],[0,6],[0,7],[0,8],[0,9],[1,9],[2,5],[2,6],[2,7],[2,9],[3,6],[3,7],[3,9]],
  "[4,4]": [[4,0],[4,2],[4,3],[5,0],[5,2],[5,3],[5,4],[6,0],[7,0],[7,1],[7,2],[7,3],[7,4]],
  "[4,5]": [[4,6],[4,7],[4,9],[5,5],[5,6],[5,7],[5,9],[6,9],[7,5],[7,6],[7,7],[7,8],[7,9]],
};

const DEFAULT_BITSTRING =
  "11110111011111101001001011100011000001100000100001000010001110000011000011100110";

const DEFAULT_REL_INPUT      = JSON.stringify(DEFAULT_RELATIONS, null, 2);
const DEFAULT_CHECKSUM_INPUT = JSON.stringify(DEFAULT_CHECKSUM_RELATIONS, null, 2);

const DEFAULT_NORMALIZED_RELATIONS = normalizeRelation(DEFAULT_RELATIONS);
const DEFAULT_NORMALIZED_CHECKSUM  = normalizeRelation(DEFAULT_CHECKSUM_RELATIONS);

// Build the initial grid from the default bitstring and recompute parity + checksum cells.
function buildDefaultGrid() {
  let g = bitsToGrid80(DEFAULT_BITSTRING);
  g = applyRelationXor(g, DEFAULT_NORMALIZED_CHECKSUM);
  g = applyRelationXor(g, DEFAULT_NORMALIZED_RELATIONS);
  return g;
}

// ─────────────────────────────────────────────
export default function ParityGridDynamic() {
  // ── core state ──
  const [bitInput,      setBitInput]      = useState(DEFAULT_BITSTRING);
  const [relInput,      setRelInput]      = useState(DEFAULT_REL_INPUT);
  const [checksumInput, setChecksumInput] = useState(DEFAULT_CHECKSUM_INPUT);

  const [relations,         setRelations]         = useState(DEFAULT_NORMALIZED_RELATIONS);
  const [checksumRelations, setChecksumRelations] = useState(DEFAULT_NORMALIZED_CHECKSUM);
  const [grid,              setGrid]              = useState(() => buildDefaultGrid());

  const [thresholdParity, setThresholdParity] = useState(2);
  const [thresholdData,   setThresholdData]   = useState(2);
  const [falsePositive,   setFalsePositive]   = useState(0);

  const [mode,          setMode]          = useState("weights");
  const [selectedCell,  setSelectedCell]  = useState(null);
  const [selectedParity,setSelectedParity]= useState(null);

  const [analysis, setAnalysis] = useState(() =>
    getMatrixWeightAdvanced2({
      grid: buildDefaultGrid(),
      parityRelations: DEFAULT_NORMALIZED_RELATIONS,
      checksumRelations: DEFAULT_NORMALIZED_CHECKSUM,
      thresholdParity: 2, thresholdData: 2, falsePositive: 0,
    })
  );

  // ── undo / redo ──
  const [gridHistory,  setGridHistory]  = useState([]);
  const [redoStack,    setRedoStack]    = useState([]);
  const [inputErrors,  setInputErrors]  = useState({ bits: null, parity: null, checksum: null });
  const [toasts,       setToasts]       = useState([]);
  const toastIdRef = useRef(0);

  // ── dark mode ──
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("parity-dark-mode") === "true");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("parity-dark-mode", darkMode);
  }, [darkMode]);

  // ── diff tracking ──
  const [originalBits, setOriginalBits] = useState(() => gridToBits(buildDefaultGrid()));

  // ── collapsible sidebar sections ──
  const [collapsed, setCollapsed] = useState({
    analysis: false, inspector: false, thresholds: false, loadInputs: false,
  });
  const toggleCollapse = (key) => setCollapsed(c => ({ ...c, [key]: !c[key] }));

  // ── shortcuts help ──
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── undo/redo refs ──
  const undoRef = useRef(null);
  undoRef.current = () => {
    if (gridHistory.length === 0) return;
    const prev = gridHistory[gridHistory.length - 1];
    setGridHistory(h => h.slice(0, -1));
    setRedoStack(r => [...r, grid]);
    setGrid(prev);
    setBitInput(gridToBits(prev));
    showToast("Undone last change", "info");
  };

  const redoRef = useRef(null);
  redoRef.current = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack(r => r.slice(0, -1));
    setGridHistory(h => [...h.slice(-9), grid]);
    setGrid(next);
    setBitInput(gridToBits(next));
    showToast("Redone", "info");
  };

  // ── auto-recompute analysis whenever inputs change ──
  useEffect(() => {
    setAnalysis(getMatrixWeightAdvanced2({
      grid, parityRelations: relations, checksumRelations,
      thresholdParity, thresholdData, falsePositive,
    }));
  }, [grid, relations, checksumRelations, thresholdParity, thresholdData, falsePositive]);

  // ── keyboard shortcuts ──
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") {
        setShowShortcuts(false);
        setSelectedCell(null);
        setSelectedParity(null);
        setMode("weights");
      }
      // redo must be checked before undo
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z") {
        e.preventDefault();
        redoRef.current?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        undoRef.current?.();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "y") {
        e.preventDefault();
        redoRef.current?.();
        return;
      }
      // "?" toggles shortcuts help (only when not typing in an input)
      if (e.key === "?" && !e.ctrlKey && !e.metaKey) {
        if (e.target.tagName === "TEXTAREA" || e.target.tagName === "INPUT") return;
        setShowShortcuts(s => !s);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── memos ──
  const parityIds = useMemo(() => Object.keys(relations).sort(), [relations]);

  const selectedParityRelations = useMemo(() => {
    if (!selectedCell) return [];
    return findParityRelationsForCell(selectedCell, relations);
  }, [selectedCell, relations]);

  const selectedChecksumRelations = useMemo(() => {
    if (!selectedCell) return [];
    return findChecksumRelationsForCell(selectedCell, checksumRelations);
  }, [selectedCell, checksumRelations]);

  const coveredBySelectedParity = useMemo(() => {
    if (!selectedParity) return [];
    return Array.from(relations[selectedParity] || []);
  }, [selectedParity, relations]);

  const relationInfo = useMemo(() => {
    if (!selectedParity) return null;
    const covered = Array.from(relations[selectedParity] || []);
    const bits = covered.map(cid => {
      const [r, c] = parseId(cid);
      return Number(grid[r][c]);
    });
    const xor = xorValues(bits);
    const [pr, pc] = parseId(selectedParity);
    const stored = Number(grid[pr][pc]);
    return { covered, xor, stored, ok: xor === stored };
  }, [selectedParity, relations, grid]);

  // ── diff cells memo ──
  const diffCells = useMemo(() => {
    const diffs = new Set();
    const currentBits = gridToBits(grid);
    for (let i = 0; i < 80; i++) {
      if (currentBits[i] !== originalBits[i]) {
        diffs.add(idOf(Math.floor(i / COLS), i % COLS));
      }
    }
    return diffs;
  }, [grid, originalBits]);

  // ── helpers ──

  // Display a temporary toast notification that auto-dismisses after 3 seconds.
  function showToast(message, type = "info") {
    const id = ++toastIdRef.current;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000);
  }

  // Copy the current grid's bitstring to the system clipboard.
  function copyBitstring() {
    const bits = gridToBits(grid);
    navigator.clipboard.writeText(bits)
      .then(() => showToast("Bitstring copied to clipboard!", "success"))
      .catch(() => showToast("Copy failed — check browser permissions", "error"));
  }

  // Export the current bitstring, thresholds, and full analysis results as a downloadable JSON file.
  function exportAnalysis() {
    const data = {
      timestamp: new Date().toISOString(),
      bitstring: gridToBits(grid),
      thresholds: { thresholdParity, thresholdData, falsePositive },
      analysis: {
        normalizedWeight:  analysis.normalizedWeight,
        rawMatrixWeight:   analysis.rawMatrixWeight,
        parityCorrect:     analysis.parityCorrect,
        parityIncorrect:   analysis.parityIncorrect,
        checksumErrors:    analysis.checksumErrors,
        probableDataErrors: analysis.probableDataErrors,
        probableParityError: analysis.probableParityError,
        probableErrorCells: analysis.probableErrorCells,
        cellWeights:       analysis.cellWeights,
      },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `parity-analysis-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Analysis exported as JSON", "success");
  }

  // ── load / action functions ──

  // Parse the bitstring input field and replace the grid. Resets undo history and diff baseline.
  function loadBits() {
    try {
      const g = bitsToGrid80(bitInput);
      setGrid(g);
      setBitInput(gridToBits(g));
      setOriginalBits(gridToBits(g));
      setInputErrors(e => ({ ...e, bits: null }));
      setGridHistory([]);
      setRedoStack([]);
      showToast("Bits loaded", "success");
    } catch (err) {
      setInputErrors(e => ({ ...e, bits: err.message }));
    }
  }

  // Parse the parity relations textarea and replace the active parity relation map.
  function loadRelations() {
    try {
      const obj        = parseRelationsFlexible(relInput);
      const normalized = normalizeRelation(obj);
      setRelations(normalized);
      setSelectedParity(null); setSelectedCell(null); setMode("weights");
      setInputErrors(e => ({ ...e, parity: null }));
      showToast("Parity relations loaded", "success");
    } catch (err) {
      setInputErrors(e => ({ ...e, parity: String(err.message || err) }));
    }
  }

  // Parse the checksum relations textarea and replace the active checksum relation map.
  function loadChecksumRelations() {
    try {
      const obj        = parseRelationsFlexible(checksumInput);
      const normalized = normalizeRelation(obj);
      setChecksumRelations(normalized);
      setSelectedParity(null); setSelectedCell(null); setMode("weights");
      setInputErrors(e => ({ ...e, checksum: null }));
      showToast("Checksum relations loaded", "success");
    } catch (err) {
      setInputErrors(e => ({ ...e, checksum: String(err.message || err) }));
    }
  }

  // Flip a single cell's bit (0↔1) without recomputing parity/checksum. Pushes to undo history.
  function toggleCell(r, c) {
    const next = grid.map(row => row.slice());
    next[r][c] = next[r][c] ? 0 : 1;
    setGridHistory(h => [...h.slice(-9), grid]);
    setRedoStack([]);
    setGrid(next);
    setBitInput(gridToBits(next));
  }

  // Recompute all parity and checksum cells by XOR-ing their respective input cells.
  function recomputeParityAndChecksum() {
    let updated = grid.map(row => row.slice());
    updated = applyRelationXor(updated, checksumRelations);
    updated = applyRelationXor(updated, relations);
    setGrid(updated);
    setBitInput(gridToBits(updated));
    showToast("Parity & checksum recomputed", "success");
  }

  // Reset everything (grid, relations, thresholds, selection, history) back to built-in defaults.
  function resetAll() {
    const g = buildDefaultGrid();
    setBitInput(DEFAULT_BITSTRING);
    setRelInput(DEFAULT_REL_INPUT);
    setChecksumInput(DEFAULT_CHECKSUM_INPUT);
    setRelations(DEFAULT_NORMALIZED_RELATIONS);
    setChecksumRelations(DEFAULT_NORMALIZED_CHECKSUM);
    setGrid(g);
    setOriginalBits(gridToBits(g));
    setThresholdParity(2); setThresholdData(2); setFalsePositive(0);
    setMode("weights"); setSelectedCell(null); setSelectedParity(null);
    setInputErrors({ bits: null, parity: null, checksum: null });
    setGridHistory([]);
    setRedoStack([]);
    showToast("Reset to defaults", "info");
  }

  // Deselect any selected cell/parity and return to the default "weights" view mode.
  function clearSelection() {
    setSelectedCell(null); setSelectedParity(null); setMode("weights");
  }

  // ── cell coloring ──

  // Determine the background color for a cell based on current mode, selection state,
  // error weights, and cell role (parity / checksum / index / orientation / data).
  function baseColorForCell(id, isParity) {
    const isSelectedCell   = selectedCell   === id;
    const isSelectedParity = selectedParity === id;
    const isCovered = coveredBySelectedParity.includes(id);

    if (mode === "parityCoverage") {
      if (isSelectedParity) return "#60a5fa";
      if (isCovered)        return "#f9a8d4";
    }

    if (mode === "reverse") {
      const isParityHit   = selectedCell && selectedParityRelations.includes(id);
      const isChecksumHit = selectedCell && selectedChecksumRelations.includes(id);
      if (isSelectedCell)                return darkMode ? "#e2e8f0" : "#111827";
      if (isParityHit || isChecksumHit)  return "#fb923c";
    }

    if (isSelectedCell) return darkMode ? "#e2e8f0" : "#111827";
    if (analysis.probableErrorCells?.includes(id))      return "#fb7185";
    if ((analysis.cellWeights?.[id] || 0) >= 4)         return "#f97316";
    if ((analysis.cellWeights?.[id] || 0) >= 2)         return "#fdba74";
    if (isParity)          return "#60a5fa";
    if (CHECKSUM.has(id))  return "#fde047";
    if (INDEX.has(id))     return "#ef4444";
    if (ORIENTATION.has(id)) return "#d946ef";
    return "#22c55e";
  }

  // Whether to display the weight badge on a cell (always in weights mode; only relevant cells in parityCoverage mode).
  function shouldShowWeight(id) {
    if (mode === "parityCoverage")
      return id === selectedParity || coveredBySelectedParity.includes(id);
    return true;
  }

  // ── derived values ──
  const selectedWeight = selectedCell ? analysis.cellWeights?.[selectedCell] || 0 : 0;
  const totalParityCount = (analysis.parityCorrect?.length ?? 0) + (analysis.parityIncorrect?.length ?? 0);
  const hasErrors = (analysis.parityIncorrect?.length || 0) > 0 || (analysis.checksumErrors?.length || 0) > 0;
  const currentBits = gridToBits(grid);
  const diffCount = diffCells.size;

  // ── render ──
  return (
    <div style={{ minHeight: "100vh", background: "var(--bg-page)" }}>
      {/* ── Header ── */}
      <div style={{
        background: "var(--bg-header)",
        color: "var(--text-on-header)",
        padding: "11px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        boxShadow: "var(--shadow-header)",
        flexWrap: "wrap",
      }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>
            8x10 Origami Parity Visualizer
          </div>
          <div style={{ fontSize: 11, opacity: 0.5, marginTop: 1 }}>
            Weight-based error analysis
          </div>
        </div>

        <div style={{ flex: 1 }} />

        {/* current bitstring preview */}
        <code style={{
          fontSize: 10,
          background: "var(--code-bg)",
          padding: "4px 10px",
          borderRadius: 5,
          letterSpacing: "0.08em",
          maxWidth: 340,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: "var(--text-on-header-dim)",
        }}>
          {currentBits}
        </code>

        <button className="btn btn-ghost btn-sm"
          style={{ color: "var(--header-btn-text)", borderColor: "var(--header-btn-border)" }}
          onClick={copyBitstring}
        >
          Copy bits
        </button>

        <button className="btn btn-ghost btn-sm"
          style={{ color: "var(--header-btn-text)", borderColor: "var(--header-btn-border)" }}
          onClick={exportAnalysis}
        >
          Export JSON
        </button>

        <button className="btn btn-ghost btn-sm"
          style={{ color: "var(--header-btn-text)", borderColor: "var(--header-btn-border)" }}
          onClick={() => setDarkMode(d => !d)}
          title="Toggle dark/light mode"
        >
          {darkMode ? "Light" : "Dark"}
        </button>

        <button className="btn btn-ghost btn-sm"
          style={{ color: "var(--header-btn-text)", borderColor: "var(--header-btn-border)" }}
          onClick={() => setShowShortcuts(s => !s)}
          title="Keyboard shortcuts (?)"
        >
          ?
        </button>

        {/* overall status badge */}
        <div style={{
          background: hasErrors ? "#ef4444" : "#10b981",
          borderRadius: 999,
          padding: "4px 12px",
          fontSize: 12,
          fontWeight: 700,
          whiteSpace: "nowrap",
          color: "#fff",
        }}>
          {hasErrors
            ? `${(analysis.parityIncorrect?.length || 0) + (analysis.checksumErrors?.length || 0)} error(s)`
            : "All OK"}
        </div>
      </div>

      {/* ── Main layout ── */}
      <div className="main-layout">

        {/* ── Left: grid area ── */}
        <div>
          <div className="section-card" style={{ marginBottom: 12 }}>
            {/* Grid header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Grid</div>
              <span className={`mode-badge mode-${mode}`}>{mode}</span>
              {diffCount > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: "var(--diff-marker)",
                }}>
                  {diffCount} changed
                </span>
              )}
              <div style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={clearSelection}>
                Clear <span style={{ opacity: 0.6 }}>Esc</span>
              </button>
              <button className="btn btn-secondary btn-sm" onClick={() => setMode("weights")}>
                Weight mode
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => undoRef.current?.()}
                disabled={gridHistory.length === 0}
                title="Undo last change (Ctrl/Cmd + Z)"
              >
                Undo <span style={{ opacity: 0.6 }}>^Z</span>
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => redoRef.current?.()}
                disabled={redoStack.length === 0}
                title="Redo (Ctrl/Cmd + Shift + Z)"
              >
                Redo <span style={{ opacity: 0.6 }}>^Y</span>
              </button>
            </div>

            {/* Scrollable grid wrapper for narrow viewports */}
            <div className="grid-scroll-wrapper" role="grid" aria-label="8 by 10 parity grid"
              onClick={(e) => {
                if (!e.target.closest('.grid-cell')) {
                  setSelectedCell(null); setSelectedParity(null); setMode("weights");
                }
              }}>
              {/* Column labels */}
              <div style={{ display: "flex", paddingLeft: 26, marginBottom: 3, gap: 6 }}>
                {Array.from({ length: COLS }).map((_, c) => (
                  <div key={c} style={{
                    width: 44, textAlign: "center",
                    fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
                  }}>
                    {c}
                  </div>
                ))}
              </div>

              {/* Rows with row labels */}
              {Array.from({ length: ROWS }).map((_, r) => (
                <div key={r} role="row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                  {/* Row label */}
                  <div style={{
                    width: 20, textAlign: "right", flexShrink: 0,
                    fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
                  }}>
                    {r}
                  </div>

                  {Array.from({ length: COLS }).map((__, c) => {
                    const id       = idOf(r, c);
                    const isParity = parityIds.includes(id);
                    const isSelected = selectedCell === id || selectedParity === id;
                    const weight   = analysis.cellWeights?.[id] || 0;
                    const isDiff   = diffCells.has(id);

                    const cellColor = baseColorForCell(id, isParity);
                    const selectedTextColor = darkMode ? "#111827" : "#fff";

                    return (
                      <button
                        key={id}
                        className="grid-cell"
                        role="gridcell"
                        aria-label={`Cell ${r},${c}: value ${grid[r][c]}, weight ${weight}${isParity ? ", parity cell" : ""}${isDiff ? ", changed" : ""}`}
                        title={`(${r},${c})  bit=${grid[r][c]}  weight=${weight}${isDiff ? "  (changed)" : ""}`}
                        onClick={() => {
                          if (isParity) {
                            setSelectedParity(id);
                            setSelectedCell(null);
                            setMode("parityCoverage");
                          } else {
                            setSelectedCell(id);
                            setSelectedParity(null);
                            setMode("reverse");
                          }
                        }}
                        onDoubleClick={() => toggleCell(r, c)}
                        style={{
                          width: 44, height: 44,
                          borderRadius: 8,
                          border: isSelected
                            ? `2px solid ${darkMode ? "#e2e8f0" : "#1e293b"}`
                            : "1px solid var(--cell-border)",
                          background: cellColor,
                          color: isSelected ? selectedTextColor : "var(--cell-text)",
                          fontWeight: 700, fontSize: 15,
                          cursor: "pointer",
                          position: "relative",
                          padding: 0, flexShrink: 0,
                          boxShadow:
                            isSelected
                              ? `0 0 0 3px ${darkMode ? "rgba(226,232,240,.25)" : "rgba(30,41,59,.25)"}`
                              : mode === "parityCoverage" && coveredBySelectedParity.includes(id)
                              ? "inset 0 0 0 3px rgba(0,0,0,.55)"
                              : "0 1px 2px rgba(0,0,0,.07)",
                        }}
                      >
                        {grid[r][c]}
                        {/* Diff marker dot */}
                        {isDiff && (
                          <span style={{
                            position: "absolute", top: 2, left: 2,
                            width: 6, height: 6, borderRadius: "50%",
                            background: "var(--diff-marker)",
                          }} />
                        )}
                        {/* Weight badge */}
                        {shouldShowWeight(id) && weight > 0 && (
                          <span style={{
                            position: "absolute", bottom: 2, right: 3,
                            fontSize: 9, fontWeight: 700, lineHeight: 1,
                            color: isSelected ? selectedTextColor : "var(--cell-weight)",
                            background:
                              mode === "parityCoverage" && coveredBySelectedParity.includes(id)
                                ? "rgba(255,255,255,.75)" : "transparent",
                            borderRadius: 3, padding: "0 1px",
                          }}>
                            {weight}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            <button className="btn btn-danger" onClick={resetAll}>Reset</button>
            <button className="btn btn-primary" onClick={recomputeParityAndChecksum}>
              Recompute parity + checksum
            </button>
          </div>

          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 12 }}>
            Click parity cell = coverage · Click data cell = reverse lookup · Double-click = flip bit · Esc = clear · ^Z/^Y = undo/redo · ? = shortcuts
          </div>

          {/* Color legend */}
          <div className="section-card">
            <div className="section-title">Legend</div>
            <div className="legend-grid">
              {[
                ["#60a5fa", "Parity"],
                ["#f9a8d4", "Covered bits"],
                ["#fde047", "Checksum"],
                ["#ef4444", "Index"],
                ["#d946ef", "Orientation"],
                ["#22c55e", "Data"],
                ["#fdba74", "Med. weight (>=2)"],
                ["#fb923c", "Relation hit (reverse)"],
                ["#f97316", "High weight (>=4)"],
                ["#fb7185", "Probable error"],
                ["var(--diff-marker)", "Changed from original"],
              ].map(([color, label]) => (
                <div key={label} className="legend-item">
                  <div className="legend-dot" style={{ background: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Right: sidebar ── */}
        <div style={{ display: "grid", gap: 12 }}>

          {/* Analysis summary */}
          <div className="section-card">
            <div
              className={`section-title section-title-collapsible ${collapsed.analysis ? "section-title-collapsed" : ""}`}
              onClick={() => toggleCollapse("analysis")}
            >
              Analysis
              <span className={`chevron ${collapsed.analysis ? "chevron-collapsed" : ""}`}>&#9660;</span>
            </div>
            {!collapsed.analysis && (
              <>
                <div className="stat-row">
                  <span>Normalized weight</span>
                  <span className="stat-value">{Number(analysis.normalizedWeight || 0).toFixed(3)}</span>
                </div>
                <div className="stat-row">
                  <span>Raw matrix weight</span>
                  <span className="stat-value">{analysis.rawMatrixWeight ?? 0}</span>
                </div>
                <div className="stat-row">
                  <span>Correct parity</span>
                  <span className={`stat-value ${analysis.parityIncorrect?.length === 0 ? "stat-ok" : "stat-warn"}`}>
                    {analysis.parityCorrect?.length ?? 0} / {totalParityCount}
                  </span>
                </div>
                <div className="stat-row">
                  <span>Parity errors</span>
                  <span className={`stat-value ${(analysis.parityIncorrect?.length || 0) > 0 ? "stat-error" : "stat-ok"}`}>
                    {analysis.parityIncorrect?.length ?? 0}
                  </span>
                </div>
                <div className="stat-row">
                  <span>Checksum errors</span>
                  <span className={`stat-value ${(analysis.checksumErrors?.length || 0) > 0 ? "stat-error" : "stat-ok"}`}>
                    {analysis.checksumErrors?.length ?? 0}
                  </span>
                </div>
                <div className="stat-row">
                  <span>Probable data errors</span>
                  <span className={`stat-value ${(analysis.probableDataErrors?.length || 0) > 0 ? "stat-warn" : "stat-ok"}`}>
                    {analysis.probableDataErrors?.length ?? 0}
                  </span>
                </div>
                <div className="stat-row">
                  <span>Probable parity errors</span>
                  <span className={`stat-value ${(analysis.probableParityError?.length || 0) > 0 ? "stat-warn" : "stat-ok"}`}>
                    {analysis.probableParityError?.length ?? 0}
                  </span>
                </div>
                <div className="stat-row">
                  <span>Total probable error cells</span>
                  <span className={`stat-value ${(analysis.probableErrorCells?.length || 0) > 0 ? "stat-error" : "stat-ok"}`}>
                    {analysis.probableErrorCells?.length ?? 0}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Inspector */}
          <div className="section-card">
            <div
              className={`section-title section-title-collapsible ${collapsed.inspector ? "section-title-collapsed" : ""}`}
              onClick={() => toggleCollapse("inspector")}
            >
              Inspector
              <span className={`chevron ${collapsed.inspector ? "chevron-collapsed" : ""}`}>&#9660;</span>
            </div>

            {!collapsed.inspector && (
              mode === "parityCoverage" && selectedParity ? (
                <>
                  <div className="stat-row">
                    <span>Selected parity</span>
                    <code style={{ fontSize: 12, fontFamily: "monospace" }}>{selectedParity}</code>
                  </div>
                  <div className="stat-row">
                    <span>XOR(covered)</span>
                    <span className="stat-value">{relationInfo?.xor ?? "—"}</span>
                  </div>
                  <div className="stat-row">
                    <span>Stored parity bit</span>
                    <span className="stat-value">{relationInfo?.stored ?? "—"}</span>
                  </div>
                  <div className="stat-row">
                    <span>Status</span>
                    <span className={`stat-value ${relationInfo?.ok ? "stat-ok" : "stat-error"}`}>
                      {relationInfo?.ok ? "OK" : "Mismatch"}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                    Covered cells: <b>{coveredBySelectedParity.length}</b>
                  </div>
                  <div style={{ maxHeight: 170, overflow: "auto", marginTop: 6 }}>
                    {coveredBySelectedParity.map(cid => {
                      const [r, c] = parseId(cid);
                      const w = analysis.cellWeights?.[cid] || 0;
                      return (
                        <div key={cid} className="covered-row">
                          <span>{cid}</span>
                          <span style={{ color: "var(--text-muted)" }}>bit={grid[r][c]} · w={w}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <>
                  <div className="stat-row">
                    <span>Selected cell</span>
                    <code style={{ fontSize: 12, fontFamily: "monospace" }}>{selectedCell || "—"}</code>
                  </div>
                  <div className="stat-row">
                    <span>Weight</span>
                    <span className={`stat-value ${selectedWeight >= 4 ? "stat-error" : selectedWeight >= 2 ? "stat-warn" : ""}`}>
                      {selectedWeight}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-secondary)" }}>
                    Parity relations: <b>{selectedParityRelations.length}</b>
                  </div>
                  <ul style={{ maxHeight: 80, overflow: "auto", margin: "4px 0 8px", fontFamily: "monospace", fontSize: 11, paddingLeft: 18, color: "var(--text-primary)" }}>
                    {selectedParityRelations.map(pid => <li key={pid}>{pid}</li>)}
                  </ul>
                  <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                    Checksum relations: <b>{selectedChecksumRelations.length}</b>
                  </div>
                  <ul style={{ maxHeight: 80, overflow: "auto", margin: "4px 0 0", fontFamily: "monospace", fontSize: 11, paddingLeft: 18, color: "var(--text-primary)" }}>
                    {selectedChecksumRelations.map(cid => <li key={cid}>{cid}</li>)}
                  </ul>
                </>
              )
            )}
          </div>

          {/* Thresholds — auto-recompute */}
          <div className="section-card">
            <div
              className={`section-title section-title-collapsible ${collapsed.thresholds ? "section-title-collapsed" : ""}`}
              onClick={() => toggleCollapse("thresholds")}
            >
              <span>
                Thresholds
                <span style={{ fontWeight: 400, textTransform: "none", fontSize: 10, color: "var(--text-muted)", marginLeft: 6 }}>
                  auto-recompute
                </span>
              </span>
              <span className={`chevron ${collapsed.thresholds ? "chevron-collapsed" : ""}`}>&#9660;</span>
            </div>
            {!collapsed.thresholds && (
              <div style={{ display: "grid", gap: 8 }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span>Parity threshold</span>
                  <input type="number" value={thresholdParity}
                    onChange={e => setThresholdParity(Number(e.target.value))} />
                </label>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span>Data threshold</span>
                  <input type="number" value={thresholdData}
                    onChange={e => setThresholdData(Number(e.target.value))} />
                </label>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                  <span>False positive budget</span>
                  <input type="number" value={falsePositive}
                    onChange={e => setFalsePositive(Number(e.target.value))} />
                </label>
              </div>
            )}
          </div>

          {/* Load Inputs */}
          <div className="section-card">
            <div
              className={`section-title section-title-collapsible ${collapsed.loadInputs ? "section-title-collapsed" : ""}`}
              onClick={() => toggleCollapse("loadInputs")}
            >
              Load Inputs
              <span className={`chevron ${collapsed.loadInputs ? "chevron-collapsed" : ""}`}>&#9660;</span>
            </div>

            {!collapsed.loadInputs && (
              <>
                {/* Bitstring */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    80-bit string
                  </label>
                  <textarea
                    rows={2}
                    value={bitInput}
                    className={inputErrors.bits ? "has-error" : ""}
                    onChange={e => setBitInput(e.target.value.trim())}
                  />
                  {inputErrors.bits && <div className="error-msg">{inputErrors.bits}</div>}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={loadBits}>
                    Load bits
                  </button>
                </div>

                {/* Parity relations */}
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Parity relations <span style={{ opacity: 0.6 }}>(JSON or Python dict)</span>
                  </label>
                  <textarea
                    rows={6}
                    value={relInput}
                    className={inputErrors.parity ? "has-error" : ""}
                    onChange={e => setRelInput(e.target.value)}
                  />
                  {inputErrors.parity && <div className="error-msg">{inputErrors.parity}</div>}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={loadRelations}>
                    Load parity relations
                  </button>
                </div>

                {/* Checksum relations */}
                <div>
                  <label style={{ fontSize: 12, color: "var(--text-secondary)", display: "block", marginBottom: 4 }}>
                    Checksum relations <span style={{ opacity: 0.6 }}>(JSON or Python dict)</span>
                  </label>
                  <textarea
                    rows={6}
                    value={checksumInput}
                    className={inputErrors.checksum ? "has-error" : ""}
                    onChange={e => setChecksumInput(e.target.value)}
                  />
                  {inputErrors.checksum && <div className="error-msg">{inputErrors.checksum}</div>}
                  <button className="btn btn-primary btn-sm" style={{ marginTop: 6 }} onClick={loadChecksumRelations}>
                    Load checksum relations
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Keyboard shortcuts modal ── */}
      {showShortcuts && (
        <div className="shortcuts-overlay" onClick={() => setShowShortcuts(false)}>
          <div className="section-card" style={{ maxWidth: 420, width: "90%" }}
               onClick={e => e.stopPropagation()}>
            <div className="section-title">Keyboard Shortcuts</div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 13, alignItems: "center" }}>
              <kbd>?</kbd><span>Toggle this help</span>
              <kbd>Esc</kbd><span>Clear selection / close modal</span>
              <kbd>Ctrl+Z</kbd><span>Undo</span>
              <kbd>Ctrl+Shift+Z</kbd><span>Redo</span>
              <kbd>Ctrl+Y</kbd><span>Redo (alt)</span>
            </div>
            <div style={{ marginTop: 14, fontSize: 12, color: "var(--text-secondary)" }}>
              <b>Mouse:</b> Click parity cell = coverage view · Click data cell = reverse lookup · Double-click = flip bit
            </div>
            <div style={{ marginTop: 10, textAlign: "right" }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowShortcuts(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notifications ── */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}
