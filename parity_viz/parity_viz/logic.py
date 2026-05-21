"""Pure functions for parity/checksum analysis — no Reflex/UI dependencies."""

from __future__ import annotations

import json
import math
import re
from .constants import ROWS, COLS


def id_of(r: int, c: int) -> str:
    return f"{r},{c}"


def parse_id(s: str) -> tuple[int, int]:
    parts = str(s).split(",")
    return int(parts[0]), int(parts[1])


def bits_to_grid_80(bitstr: str) -> list[list[int]]:
    """Convert an 80-character '0'/'1' bitstring into an 8x10 2D grid (row-major)."""
    if not re.fullmatch(r"[01]{80}", bitstr):
        raise ValueError("Bitstring must be exactly 80 characters of 0/1.")
    grid: list[list[int]] = [[0] * COLS for _ in range(ROWS)]
    for i in range(80):
        r = i // COLS
        c = i % COLS
        grid[r][c] = 1 if bitstr[i] == "1" else 0
    return grid


def grid_to_bits(grid: list[list[int]]) -> str:
    """Convert an 8x10 2D grid back into an 80-character bitstring."""
    out: list[str] = []
    for r in range(ROWS):
        for c in range(COLS):
            out.append("1" if grid[r][c] else "0")
    return "".join(out)


def xor_values(values: list[int]) -> int:
    """XOR-reduce an array of 0/1 values into a single bit."""
    result = 0
    for v in values:
        result ^= int(v)
    return result


def normalize_relation(obj: dict) -> dict[str, list[str]]:
    """Normalize a raw relation map into { "r,c": ["r,c", ...] }.

    Strips brackets, parens, and whitespace from keys; converts array-of-pair
    values to "r,c" strings. Returns lists (not sets) for JSON serialization.
    """
    out: dict[str, list[str]] = {}
    if not obj:
        return out
    for raw_key in obj:
        key = re.sub(r"[(){}\[\]\s]", "", str(raw_key))
        value = obj[raw_key]
        if not isinstance(value, list):
            continue
        arr: list[str] = []
        for p in value:
            if isinstance(p, (list, tuple)):
                s = f"{p[0]},{p[1]}"
            else:
                s = re.sub(r"[(){}\[\]\s]", "", str(p))
            if re.fullmatch(r"\d+,\d+", s):
                arr.append(s)
        out[key] = arr
    return out


def parse_relations_flexible(text: str) -> dict:
    """Parse JSON or Python-dict-style relation text."""
    try:
        return json.loads(text)
    except (json.JSONDecodeError, ValueError):
        pass
    t = text.strip()
    t = t.replace("'", '"')
    t = re.sub(
        r"(\(\s*\d+\s*,\s*\d+\s*\))\s*:",
        lambda m: f'"{m.group(1)}":',
        t,
    )
    t = re.sub(r"\(\s*(\d+)\s*,\s*(\d+)\s*\)", r"[\1,\2]", t)
    return json.loads(t)


def apply_relation_xor(
    grid: list[list[int]], relations: dict[str, list[str]]
) -> list[list[int]]:
    """Compute XOR of input cells for each relation; write result to output cell.

    Returns a new grid (does not mutate the original).
    """
    nxt = [row[:] for row in grid]
    for out_id in relations:
        rr, cc = parse_id(out_id)
        if rr < 0 or rr >= ROWS or cc < 0 or cc >= COLS:
            continue
        inputs = relations[out_id]
        vals: list[int] = []
        for cid in inputs:
            r, c = parse_id(cid)
            if r < 0 or r >= ROWS or c < 0 or c >= COLS:
                vals.append(0)
            else:
                vals.append(int(nxt[r][c]))
        nxt[rr][cc] = xor_values(vals)
    return nxt


def build_reverse_map(
    parity_relations: dict[str, list[str]],
) -> dict[str, list[str]]:
    """Invert parity relations: for each data cell, list covering parity cells."""
    reverse: dict[str, list[str]] = {}
    for parity_id, data_ids in (parity_relations or {}).items():
        for data_id in data_ids:
            if data_id not in reverse:
                reverse[data_id] = []
            reverse[data_id].append(parity_id)
    return reverse


def find_parity_status(
    grid: list[list[int]], parity_relations: dict[str, list[str]]
) -> dict[str, list[str]]:
    """Check each parity cell vs XOR of its inputs.

    Returns {"correct": [...ids], "incorrect": [...ids]}.
    """
    correct: list[str] = []
    incorrect: list[str] = []
    for parity_id in parity_relations or {}:
        pr, pc = parse_id(parity_id)
        if pr < 0 or pr >= ROWS or pc < 0 or pc >= COLS:
            continue
        inputs = parity_relations[parity_id]
        vals: list[int] = []
        for cid in inputs:
            r, c = parse_id(cid)
            if r < 0 or r >= ROWS or c < 0 or c >= COLS:
                vals.append(0)
            else:
                vals.append(int(grid[r][c]))
        xor = xor_values(vals)
        if int(grid[pr][pc]) == xor:
            correct.append(parity_id)
        else:
            incorrect.append(parity_id)
    return {"correct": correct, "incorrect": incorrect}


def find_checksum_status(
    grid: list[list[int]], checksum_relations: dict[str, list[str]]
) -> dict[str, list[str]]:
    """Check each checksum cell vs XOR of its inputs.

    Returns {"checksum_errors": [...ids], "checksum_related_errors": [...ids]}.
    """
    checksum_errors: list[str] = []
    checksum_related_errors: list[str] = []
    for checksum_id in checksum_relations or {}:
        cr, cc = parse_id(checksum_id)
        if cr < 0 or cr >= ROWS or cc < 0 or cc >= COLS:
            continue
        inputs = checksum_relations[checksum_id]
        vals: list[int] = []
        for cid in inputs:
            r, c = parse_id(cid)
            if r < 0 or r >= ROWS or c < 0 or c >= COLS:
                vals.append(0)
            else:
                vals.append(int(grid[r][c]))
        xor = xor_values(vals)
        stored = int(grid[cr][cc])
        if xor != stored:
            checksum_errors.append(checksum_id)
            checksum_related_errors.extend(inputs)
    return {
        "checksum_errors": checksum_errors,
        "checksum_related_errors": checksum_related_errors,
    }


def counter(arr: list[str]) -> dict[str, int]:
    """Count occurrences of each element."""
    m: dict[str, int] = {}
    for x in arr:
        m[x] = m.get(x, 0) + 1
    return m


def find_checksum_relations_for_cell(
    cell_id: str, checksum_relations: dict[str, list[str]]
) -> list[str]:
    """Find all checksum cells whose input set includes the given cell."""
    hits: list[str] = []
    for checksum_id, inputs in (checksum_relations or {}).items():
        if cell_id in inputs:
            hits.append(checksum_id)
    return hits


def find_parity_relations_for_cell(
    cell_id: str, parity_relations: dict[str, list[str]]
) -> list[str]:
    """Find all parity cells whose input set includes the given cell."""
    hits: list[str] = []
    for parity_id, inputs in (parity_relations or {}).items():
        if cell_id in inputs:
            hits.append(parity_id)
    return hits


def get_matrix_weight_advanced2(
    grid: list[list[int]],
    parity_relations: dict[str, list[str]],
    checksum_relations: dict[str, list[str]],
    threshold_parity: int = 2,
    threshold_data: int = 2,
    false_positive: int = 0,
) -> dict:
    """Complete weight-based error analysis (v2 with checksum bonus).

    Returns a dict with: parity_correct, parity_incorrect, checksum_errors,
    checksum_related_errors, cell_weights, probable_error_cells,
    probable_parity_error, probable_data_errors, normalized_weight,
    raw_matrix_weight, false_positive.
    """
    parity_status = find_parity_status(grid, parity_relations)
    parity_incorrect = parity_status["incorrect"]
    parity_correct = parity_status["correct"]

    probable_error_indexes: list[str] = []
    for pid in parity_incorrect:
        probable_error_indexes.extend(parity_relations.get(pid, []))

    cs_status = find_checksum_status(grid, checksum_relations)
    checksum_errors = cs_status["checksum_errors"]
    checksum_related_errors = cs_status["checksum_related_errors"]
    for cid in checksum_errors:
        probable_error_indexes.append(cid)

    counted_probable = counter(probable_error_indexes)
    cell_weights: dict[str, int] = {}
    probable_data_error_by_weight: dict[int, list[str]] = {}

    checksum_related_set = set(checksum_related_errors)
    checksum_errors_set = set(checksum_errors)

    for pos, count in counted_probable.items():
        is_in_related = pos in checksum_related_set
        is_in_errors = pos in checksum_errors_set

        extra = 0
        if is_in_related and is_in_errors:
            extra = 2
        elif is_in_related or is_in_errors:
            extra = 1

        weight = count + extra
        cell_weights[pos] = weight

        if weight not in probable_data_error_by_weight:
            probable_data_error_by_weight[weight] = []
        probable_data_error_by_weight[weight].append(pos)

    data_bit_to_parity_bit = build_reverse_map(parity_relations)
    all_probable_parity: list[str] = []
    for pos in cell_weights:
        linked = data_bit_to_parity_bit.get(pos, [])
        all_probable_parity.extend(linked)
    all_probable_parity.extend(parity_incorrect)

    counted_parity_errors = counter(all_probable_parity)

    matrix_weight = 0
    probable_parity_error: list[str] = []
    probable_data_errors: list[str] = []

    false_positive_data = 0
    false_positive_parity = 0
    fp_data_limit = (false_positive + 1) // 2
    fp_parity_limit = false_positive // 2

    for pid, weight in counted_parity_errors.items():
        matrix_weight += weight
        pr, pc = parse_id(pid)
        current_value = (
            int(grid[pr][pc])
            if 0 <= pr < ROWS and 0 <= pc < COLS
            else 0
        )
        if weight >= threshold_parity:
            if current_value == 0:
                probable_parity_error.append(pid)
            elif false_positive_parity < fp_parity_limit:
                probable_parity_error.append(pid)
                false_positive_parity += 1
            cell_weights[pid] = max(cell_weights.get(pid, 0), weight)

    sorted_data_weights = sorted(probable_data_error_by_weight.keys(), reverse=True)
    for weight in sorted_data_weights:
        cells = probable_data_error_by_weight[weight]
        if weight >= threshold_data:
            for pos in cells:
                pr, pc = parse_id(pos)
                current_value = (
                    int(grid[pr][pc])
                    if 0 <= pr < ROWS and 0 <= pc < COLS
                    else 0
                )
                if current_value == 0:
                    probable_data_errors.append(pos)
                elif false_positive_data < fp_data_limit:
                    probable_data_errors.append(pos)
                    false_positive_data += 1
        matrix_weight += weight * len(cells)

    probable_error_cells = list(
        dict.fromkeys(probable_data_errors + probable_parity_error)
    )
    normalized_weight = (
        matrix_weight / len(parity_correct)
        if len(parity_correct) > 0
        else matrix_weight
    )

    return {
        "parity_correct": parity_correct,
        "parity_incorrect": parity_incorrect,
        "checksum_errors": checksum_errors,
        "checksum_related_errors": checksum_related_errors,
        "cell_weights": cell_weights,
        "probable_error_cells": probable_error_cells,
        "probable_parity_error": probable_parity_error,
        "probable_data_errors": probable_data_errors,
        "normalized_weight": normalized_weight,
        "raw_matrix_weight": matrix_weight,
        "false_positive": false_positive,
    }


def build_default_grid() -> list[list[int]]:
    """Build the initial grid from the default bitstring and recompute checksum + parity."""
    from .constants import (
        DEFAULT_BITSTRING,
        DEFAULT_CHECKSUM_RELATIONS,
        DEFAULT_RELATIONS,
    )

    g = bits_to_grid_80(DEFAULT_BITSTRING)
    norm_checksum = normalize_relation(DEFAULT_CHECKSUM_RELATIONS)
    norm_parity = normalize_relation(DEFAULT_RELATIONS)
    g = apply_relation_xor(g, norm_checksum)
    g = apply_relation_xor(g, norm_parity)
    return g
