"""Application state for the Parity Relation Visualization app."""

from __future__ import annotations

import asyncio
import json
import time

import reflex as rx

from .constants import (
    CHECKSUM,
    COLS,
    DEFAULT_BITSTRING,
    DEFAULT_CHECKSUM_INPUT,
    DEFAULT_CHECKSUM_RELATIONS,
    DEFAULT_REL_INPUT,
    DEFAULT_RELATIONS,
    INDEX,
    ORIENTATION,
    ROWS,
)
from .logic import (
    apply_relation_xor,
    bits_to_grid_80,
    build_default_grid,
    build_reverse_map,
    find_checksum_relations_for_cell,
    find_parity_relations_for_cell,
    get_matrix_weight_advanced2,
    grid_to_bits,
    id_of,
    normalize_relation,
    parse_id,
    parse_relations_flexible,
    xor_values,
)

# Pre-normalize defaults for initial state
_DEFAULT_NORM_REL = normalize_relation(DEFAULT_RELATIONS)
_DEFAULT_NORM_CS = normalize_relation(DEFAULT_CHECKSUM_RELATIONS)
_DEFAULT_GRID = build_default_grid()


class AppState(rx.State):
    """Main application state."""

    # Core data
    bit_input: str = DEFAULT_BITSTRING
    rel_input: str = DEFAULT_REL_INPUT
    checksum_input: str = DEFAULT_CHECKSUM_INPUT
    relations: dict[str, list[str]] = _DEFAULT_NORM_REL
    checksum_relations: dict[str, list[str]] = _DEFAULT_NORM_CS
    grid: list[list[int]] = _DEFAULT_GRID

    # Thresholds
    threshold_parity: int = 2
    threshold_data: int = 2
    false_positive: int = 0

    # View state
    mode: str = "weights"
    selected_cell: str = ""
    selected_parity: str = ""

    # Undo/redo
    grid_history: list[list[list[int]]] = []
    redo_stack: list[list[list[int]]] = []

    # Input errors
    input_error_bits: str = ""
    input_error_parity: str = ""
    input_error_checksum: str = ""

    # Toasts
    toasts: list[dict[str, str]] = []
    _toast_counter: int = 0

    # Dark mode
    dark_mode: bool = False

    # Diff tracking
    original_bits: str = grid_to_bits(_DEFAULT_GRID)

    # Collapsible sidebar sections
    collapsed_analysis: bool = False
    collapsed_inspector: bool = False
    collapsed_thresholds: bool = False
    collapsed_load_inputs: bool = False

    # Shortcuts modal
    show_shortcuts: bool = False

    # ── Computed vars ──

    @rx.var(cache=True)
    def analysis(self) -> dict:
        return get_matrix_weight_advanced2(
            grid=self.grid,
            parity_relations=self.relations,
            checksum_relations=self.checksum_relations,
            threshold_parity=self.threshold_parity,
            threshold_data=self.threshold_data,
            false_positive=self.false_positive,
        )

    @rx.var(cache=True)
    def parity_ids(self) -> list[str]:
        return sorted(self.relations.keys())

    @rx.var(cache=True)
    def current_bits(self) -> str:
        return grid_to_bits(self.grid)

    @rx.var(cache=True)
    def diff_cells_list(self) -> list[str]:
        """List of cell IDs that differ from original."""
        current = self.current_bits
        orig = self.original_bits
        diffs: list[str] = []
        for i in range(min(len(current), len(orig), 80)):
            if current[i] != orig[i]:
                diffs.append(id_of(i // COLS, i % COLS))
        return diffs

    @rx.var(cache=True)
    def diff_count(self) -> int:
        return len(self.diff_cells_list)

    @rx.var(cache=True)
    def has_errors(self) -> bool:
        a = self.analysis
        return (
            len(a.get("parity_incorrect", [])) > 0
            or len(a.get("checksum_errors", [])) > 0
        )

    @rx.var(cache=True)
    def total_parity_count(self) -> int:
        a = self.analysis
        return len(a.get("parity_correct", [])) + len(
            a.get("parity_incorrect", [])
        )

    @rx.var(cache=True)
    def error_count(self) -> int:
        a = self.analysis
        return len(a.get("parity_incorrect", [])) + len(
            a.get("checksum_errors", [])
        )

    # Analysis metric accessors for the sidebar (avoids untyped dict access in templates)
    @rx.var(cache=True)
    def normalized_weight_str(self) -> str:
        return f"{self.analysis.get('normalized_weight', 0):.3f}"

    @rx.var(cache=True)
    def raw_matrix_weight(self) -> int:
        return self.analysis.get("raw_matrix_weight", 0)

    @rx.var(cache=True)
    def parity_correct_count(self) -> int:
        return len(self.analysis.get("parity_correct", []))

    @rx.var(cache=True)
    def parity_incorrect_count(self) -> int:
        return len(self.analysis.get("parity_incorrect", []))

    @rx.var(cache=True)
    def checksum_errors_count(self) -> int:
        return len(self.analysis.get("checksum_errors", []))

    @rx.var(cache=True)
    def probable_data_errors_count(self) -> int:
        return len(self.analysis.get("probable_data_errors", []))

    @rx.var(cache=True)
    def probable_parity_error_count(self) -> int:
        return len(self.analysis.get("probable_parity_error", []))

    @rx.var(cache=True)
    def probable_error_cells_count(self) -> int:
        return len(self.analysis.get("probable_error_cells", []))

    @rx.var
    def selected_parity_relations_list(self) -> list[str]:
        if not self.selected_cell:
            return []
        return find_parity_relations_for_cell(self.selected_cell, self.relations)

    @rx.var
    def selected_checksum_relations_list(self) -> list[str]:
        if not self.selected_cell:
            return []
        return find_checksum_relations_for_cell(
            self.selected_cell, self.checksum_relations
        )

    @rx.var
    def covered_by_selected_parity(self) -> list[str]:
        if not self.selected_parity:
            return []
        return self.relations.get(self.selected_parity, [])

    @rx.var
    def relation_info(self) -> dict:
        if not self.selected_parity:
            return {"covered": [], "xor": 0, "stored": 0, "ok": True}
        covered = self.relations.get(self.selected_parity, [])
        bits = []
        for cid in covered:
            r, c = parse_id(cid)
            bits.append(int(self.grid[r][c]))
        xor = xor_values(bits)
        pr, pc = parse_id(self.selected_parity)
        stored = int(self.grid[pr][pc])
        return {"covered": covered, "xor": xor, "stored": stored, "ok": xor == stored}

    @rx.var
    def selected_weight(self) -> int:
        if not self.selected_cell:
            return 0
        return self.analysis.get("cell_weights", {}).get(self.selected_cell, 0)

    @rx.var(cache=True)
    def flip_priority(self) -> dict[str, int]:
        weights = self.analysis.get("cell_weights", {})
        entries = [(k, v) for k, v in weights.items() if v > 0]
        entries.sort(key=lambda x: -x[1])
        result: dict[str, int] = {}
        rank = 1
        for i, (k, v) in enumerate(entries):
            if i > 0 and v < entries[i - 1][1]:
                rank += 1
            result[k] = rank
        return result

    @rx.var(cache=True)
    def covered_cells_data(self) -> list[dict]:
        """Precomputed data for covered cells in inspector."""
        result: list[dict] = []
        for cid in self.covered_by_selected_parity:
            r, c = parse_id(cid)
            w = self.analysis.get("cell_weights", {}).get(cid, 0)
            result.append(
                {"id": cid, "bit": self.grid[r][c], "weight": w}
            )
        return result

    @rx.var(cache=True)
    def cell_render_data(self) -> list[dict]:
        """Precompute all 80 cells' display properties for rx.foreach."""
        a = self.analysis
        cell_weights = a.get("cell_weights", {})
        probable_errors = a.get("probable_error_cells", [])
        probable_errors_set = set(probable_errors)
        parity_set = set(self.parity_ids)
        covered_set = set(self.covered_by_selected_parity)
        diff_set = set(self.diff_cells_list)
        fp = self.flip_priority
        sel_par_rels = set(self.selected_parity_relations_list)
        sel_cs_rels = set(self.selected_checksum_relations_list)

        cells: list[dict] = []
        for r in range(ROWS):
            for c in range(COLS):
                cell_id = id_of(r, c)
                is_parity = cell_id in parity_set
                is_selected = (
                    cell_id == self.selected_cell
                    or cell_id == self.selected_parity
                )
                weight = cell_weights.get(cell_id, 0)
                is_diff = cell_id in diff_set

                # Compute background color
                bg_color = self._base_color(
                    cell_id,
                    is_parity,
                    parity_set,
                    covered_set,
                    probable_errors_set,
                    cell_weights,
                    sel_par_rels,
                    sel_cs_rels,
                )

                # Text color
                if is_selected:
                    text_color = "#111827" if self.dark_mode else "#fff"
                else:
                    text_color = "var(--cell-text)"

                # Border
                if is_selected:
                    border = (
                        "2px solid #e2e8f0"
                        if self.dark_mode
                        else "2px solid #1e293b"
                    )
                else:
                    border = "1px solid var(--cell-border)"

                # Box shadow
                if is_selected:
                    shadow = (
                        "0 0 0 3px rgba(226,232,240,.25)"
                        if self.dark_mode
                        else "0 0 0 3px rgba(30,41,59,.25)"
                    )
                elif (
                    self.mode == "parityCoverage"
                    and cell_id in covered_set
                ):
                    shadow = "inset 0 0 0 3px rgba(0,0,0,.55)"
                else:
                    shadow = "0 1px 2px rgba(0,0,0,.07)"

                # Should show weight
                if self.mode == "parityCoverage":
                    show_weight = (
                        cell_id == self.selected_parity
                        or cell_id in covered_set
                    )
                else:
                    show_weight = True

                flip_rank = fp.get(cell_id, 0)

                # Weight badge background
                if (
                    self.mode == "parityCoverage"
                    and cell_id in covered_set
                ):
                    weight_badge_bg = "rgba(255,255,255,.75)"
                else:
                    weight_badge_bg = "transparent"

                # Precompute badge visibility booleans
                show_flip_badge = show_weight and weight > 0 and flip_rank > 0
                show_weight_badge = show_weight and weight > 0

                cells.append(
                    {
                        "r": r,
                        "c": c,
                        "id": cell_id,
                        "value": self.grid[r][c],
                        "value_str": str(self.grid[r][c]),
                        "bg_color": bg_color,
                        "text_color": text_color,
                        "border": border,
                        "box_shadow": shadow,
                        "is_selected": is_selected,
                        "is_diff": is_diff,
                        "weight": weight,
                        "weight_str": str(weight),
                        "flip_rank": flip_rank,
                        "flip_rank_str": str(flip_rank),
                        "show_flip_badge": show_flip_badge,
                        "show_weight_badge": show_weight_badge,
                        "weight_badge_bg": weight_badge_bg,
                        "is_parity": is_parity,
                    }
                )
        return cells

    @rx.var(cache=True)
    def grid_rows(self) -> list[list[dict]]:
        """Group cell_render_data into 8 rows of 10."""
        data = self.cell_render_data
        return [data[i * COLS : (i + 1) * COLS] for i in range(ROWS)]

    def _base_color(
        self,
        cell_id: str,
        is_parity: bool,
        parity_set: set,
        covered_set: set,
        probable_errors_set: set,
        cell_weights: dict,
        sel_par_rels: set,
        sel_cs_rels: set,
    ) -> str:
        """Determine the background color for a cell."""
        is_selected_cell = cell_id == self.selected_cell
        is_selected_parity = cell_id == self.selected_parity
        is_covered = cell_id in covered_set

        if self.mode == "parityCoverage":
            if is_selected_parity:
                return "#60a5fa"
            if is_covered:
                return "#f9a8d4"

        if self.mode == "reverse":
            is_parity_hit = self.selected_cell and cell_id in sel_par_rels
            is_checksum_hit = self.selected_cell and cell_id in sel_cs_rels
            if is_selected_cell:
                return "#e2e8f0" if self.dark_mode else "#111827"
            if is_parity_hit or is_checksum_hit:
                return "#fb923c"

        if is_selected_cell:
            return "#e2e8f0" if self.dark_mode else "#111827"
        if cell_id in probable_errors_set:
            return "#fb7185"
        if cell_weights.get(cell_id, 0) >= 4:
            return "#f97316"
        if cell_weights.get(cell_id, 0) >= 2:
            return "#fdba74"
        if is_parity:
            return "#60a5fa"
        if cell_id in CHECKSUM:
            return "#fde047"
        if cell_id in INDEX:
            return "#ef4444"
        if cell_id in ORIENTATION:
            return "#d946ef"
        return "#22c55e"

    # ── Event Handlers ──

    def init_dark_mode(self, value: str):
        """Callback from JS for initial dark mode value."""
        self.dark_mode = value == "true"

    def select_cell(self, r: int, c: int):
        """Single-click handler: select a parity or data cell."""
        cell_id = id_of(r, c)
        if cell_id in set(self.parity_ids):
            self.selected_parity = cell_id
            self.selected_cell = ""
            self.mode = "parityCoverage"
        else:
            self.selected_cell = cell_id
            self.selected_parity = ""
            self.mode = "reverse"

    def toggle_cell(self, r: int, c: int):
        """Double-click handler: flip bit without recomputing parity."""
        nxt = [row[:] for row in self.grid]
        nxt[r][c] = 0 if nxt[r][c] else 1
        self.grid_history = self.grid_history[-9:] + [self.grid]
        self.redo_stack = []
        self.grid = nxt
        self.bit_input = grid_to_bits(nxt)

    def clear_selection(self):
        self.selected_cell = ""
        self.selected_parity = ""
        self.mode = "weights"

    def set_mode_weights(self):
        self.mode = "weights"

    def undo(self):
        if not self.grid_history:
            return
        prev = self.grid_history[-1]
        self.grid_history = self.grid_history[:-1]
        self.redo_stack = self.redo_stack + [self.grid]
        self.grid = prev
        self.bit_input = grid_to_bits(prev)

    def redo(self):
        if not self.redo_stack:
            return
        nxt = self.redo_stack[-1]
        self.redo_stack = self.redo_stack[:-1]
        self.grid_history = self.grid_history[-9:] + [self.grid]
        self.grid = nxt
        self.bit_input = grid_to_bits(nxt)

    def load_bits(self):
        try:
            g = bits_to_grid_80(self.bit_input)
            self.grid = g
            self.bit_input = grid_to_bits(g)
            self.original_bits = grid_to_bits(g)
            self.input_error_bits = ""
            self.grid_history = []
            self.redo_stack = []
        except Exception as e:
            self.input_error_bits = str(e)

    def load_relations(self):
        try:
            obj = parse_relations_flexible(self.rel_input)
            normalized = normalize_relation(obj)
            self.relations = normalized
            self.selected_parity = ""
            self.selected_cell = ""
            self.mode = "weights"
            self.input_error_parity = ""
        except Exception as e:
            self.input_error_parity = str(e)

    def load_checksum_relations(self):
        try:
            obj = parse_relations_flexible(self.checksum_input)
            normalized = normalize_relation(obj)
            self.checksum_relations = normalized
            self.selected_parity = ""
            self.selected_cell = ""
            self.mode = "weights"
            self.input_error_checksum = ""
        except Exception as e:
            self.input_error_checksum = str(e)

    def recompute_parity_and_checksum(self):
        updated = [row[:] for row in self.grid]
        updated = apply_relation_xor(updated, self.checksum_relations)
        updated = apply_relation_xor(updated, self.relations)
        self.grid = updated
        self.bit_input = grid_to_bits(updated)

    def reset_all(self):
        g = build_default_grid()
        self.bit_input = DEFAULT_BITSTRING
        self.rel_input = DEFAULT_REL_INPUT
        self.checksum_input = DEFAULT_CHECKSUM_INPUT
        self.relations = _DEFAULT_NORM_REL
        self.checksum_relations = _DEFAULT_NORM_CS
        self.grid = g
        self.original_bits = grid_to_bits(g)
        self.threshold_parity = 2
        self.threshold_data = 2
        self.false_positive = 0
        self.mode = "weights"
        self.selected_cell = ""
        self.selected_parity = ""
        self.input_error_bits = ""
        self.input_error_parity = ""
        self.input_error_checksum = ""
        self.grid_history = []
        self.redo_stack = []

    def copy_bitstring(self):
        bits = grid_to_bits(self.grid)
        return rx.set_clipboard(bits)

    def export_analysis(self):
        a = self.analysis
        data = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "bitstring": grid_to_bits(self.grid),
            "thresholds": {
                "threshold_parity": self.threshold_parity,
                "threshold_data": self.threshold_data,
                "false_positive": self.false_positive,
            },
            "analysis": {
                "normalized_weight": a.get("normalized_weight", 0),
                "raw_matrix_weight": a.get("raw_matrix_weight", 0),
                "parity_correct": a.get("parity_correct", []),
                "parity_incorrect": a.get("parity_incorrect", []),
                "checksum_errors": a.get("checksum_errors", []),
                "probable_data_errors": a.get("probable_data_errors", []),
                "probable_parity_error": a.get("probable_parity_error", []),
                "probable_error_cells": a.get("probable_error_cells", []),
                "cell_weights": a.get("cell_weights", {}),
            },
        }
        json_str = json.dumps(data, indent=2)
        filename = f"parity-analysis-{int(time.time())}.json"
        return rx.download(data=json_str, filename=filename)

    def toggle_dark_mode(self):
        self.dark_mode = not self.dark_mode
        theme = "dark" if self.dark_mode else "light"
        return rx.call_script(
            f'document.documentElement.setAttribute("data-theme", "{theme}");'
            f'localStorage.setItem("parity-dark-mode", "{str(self.dark_mode).lower()}");'
        )

    def toggle_shortcuts(self):
        self.show_shortcuts = not self.show_shortcuts

    def toggle_collapse_analysis(self):
        self.collapsed_analysis = not self.collapsed_analysis

    def toggle_collapse_inspector(self):
        self.collapsed_inspector = not self.collapsed_inspector

    def toggle_collapse_thresholds(self):
        self.collapsed_thresholds = not self.collapsed_thresholds

    def toggle_collapse_load_inputs(self):
        self.collapsed_load_inputs = not self.collapsed_load_inputs

    def set_bit_input_value(self, value: str):
        self.bit_input = value.strip()

    def set_rel_input_value(self, value: str):
        self.rel_input = value

    def set_checksum_input_value(self, value: str):
        self.checksum_input = value

    def set_threshold_parity_value(self, value: float):
        try:
            self.threshold_parity = int(value)
        except (ValueError, TypeError):
            pass

    def set_threshold_data_value(self, value: float):
        try:
            self.threshold_data = int(value)
        except (ValueError, TypeError):
            pass

    def set_false_positive_value(self, value: float):
        try:
            self.false_positive = int(value)
        except (ValueError, TypeError):
            pass

    def handle_escape(self):
        self.show_shortcuts = False
        self.selected_cell = ""
        self.selected_parity = ""
        self.mode = "weights"

    @rx.event
    def on_load(self):
        """Initialize dark mode from localStorage on first page load."""
        return rx.call_script(
            'localStorage.getItem("parity-dark-mode")',
            callback=AppState.init_dark_mode,
        )

    @rx.event
    def setup_keyboard_shortcuts(self):
        """Register global keyboard listener.

        Clicks hidden buttons to dispatch events to the backend.
        """
        return rx.call_script("""
            if (!window.__parity_kbd_registered) {
                window.__parity_kbd_registered = true;
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        document.getElementById('_btn_escape')?.click();
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
                        e.preventDefault();
                        document.getElementById('_btn_redo')?.click();
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
                        e.preventDefault();
                        document.getElementById('_btn_undo')?.click();
                        return;
                    }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
                        e.preventDefault();
                        document.getElementById('_btn_redo')?.click();
                        return;
                    }
                    if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
                        if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
                        document.getElementById('_btn_shortcuts')?.click();
                    }
                });
            }
        """)
