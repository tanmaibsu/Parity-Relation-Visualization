"""Sidebar with 4 collapsible panels: Analysis, Inspector, Thresholds, Load Inputs."""

import reflex as rx

from ..state import AppState


def _chevron(collapsed: rx.Var[bool]) -> rx.Component:
    return rx.text(
        "\u25BC",
        class_name=rx.cond(collapsed, "chevron chevron-collapsed", "chevron"),
    )


def _collapsible_header(title, collapsed_var, on_click_handler) -> rx.Component:
    return rx.box(
        rx.text(title),
        _chevron(collapsed_var),
        class_name=rx.cond(
            collapsed_var,
            "section-title section-title-collapsible section-title-collapsed",
            "section-title section-title-collapsible",
        ),
        on_click=on_click_handler,
    )


def analysis_panel() -> rx.Component:
    """Analysis summary panel."""
    return rx.box(
        _collapsible_header("Analysis", AppState.collapsed_analysis, AppState.toggle_collapse_analysis),
        rx.cond(
            ~AppState.collapsed_analysis,
            rx.fragment(
                _stat_row("Normalized weight", AppState.normalized_weight_str, ""),
                _stat_row("Raw matrix weight", AppState.raw_matrix_weight.to(str), ""),
                _stat_row(
                    "Correct parity",
                    AppState.parity_correct_count.to(str) + " / " + AppState.total_parity_count.to(str),
                    rx.cond(AppState.parity_incorrect_count == 0, "stat-ok", "stat-warn"),
                ),
                _stat_row(
                    "Parity errors",
                    AppState.parity_incorrect_count.to(str),
                    rx.cond(AppState.parity_incorrect_count > 0, "stat-error", "stat-ok"),
                ),
                _stat_row(
                    "Checksum errors",
                    AppState.checksum_errors_count.to(str),
                    rx.cond(AppState.checksum_errors_count > 0, "stat-error", "stat-ok"),
                ),
                _stat_row(
                    "Probable data errors",
                    AppState.probable_data_errors_count.to(str),
                    rx.cond(AppState.probable_data_errors_count > 0, "stat-warn", "stat-ok"),
                ),
                _stat_row(
                    "Probable parity errors",
                    AppState.probable_parity_error_count.to(str),
                    rx.cond(AppState.probable_parity_error_count > 0, "stat-warn", "stat-ok"),
                ),
                _stat_row(
                    "Total probable error cells",
                    AppState.probable_error_cells_count.to(str),
                    rx.cond(AppState.probable_error_cells_count > 0, "stat-error", "stat-ok"),
                ),
            ),
        ),
        class_name="section-card",
    )


def _stat_row(label: str, value, extra_class="") -> rx.Component:
    return rx.flex(
        rx.text(label, font_size="13px"),
        rx.text(
            value,
            class_name=rx.cond(extra_class != "", "stat-value " + extra_class, "stat-value"),
            font_weight="700",
            font_size="14px",
        ),
        class_name="stat-row",
        justify="between",
        align="center",
        padding_y="5px",
        border_bottom="1px solid var(--border-light)",
    )


def inspector_panel() -> rx.Component:
    """Inspector panel — shows different content based on mode."""
    return rx.box(
        _collapsible_header("Inspector", AppState.collapsed_inspector, AppState.toggle_collapse_inspector),
        rx.cond(
            ~AppState.collapsed_inspector,
            rx.cond(
                (AppState.mode == "parityCoverage") & (AppState.selected_parity != ""),
                # Parity coverage inspector
                rx.fragment(
                    _stat_row("Selected parity", rx.code(AppState.selected_parity, font_size="12px")),
                    _stat_row("XOR(covered)", AppState.relation_info["xor"].to(int).to(str)),
                    _stat_row("Stored parity bit", AppState.relation_info["stored"].to(int).to(str)),
                    _stat_row(
                        "Status",
                        rx.cond(
                            AppState.relation_info["ok"].to(bool),
                            rx.text("OK", class_name="stat-value stat-ok"),
                            rx.text("Mismatch", class_name="stat-value stat-error"),
                        ),
                    ),
                    rx.text(
                        "Covered cells: ",
                        rx.text(
                            AppState.covered_by_selected_parity.length().to(str),
                            as_="b",
                        ),
                        font_size="12px",
                        color="var(--text-secondary)",
                        margin_top="8px",
                    ),
                    rx.box(
                        rx.foreach(
                            AppState.covered_cells_data,
                            _render_covered_row,
                        ),
                        max_height="170px",
                        overflow="auto",
                        margin_top="6px",
                    ),
                ),
                # Data cell inspector (reverse mode or default)
                rx.fragment(
                    _stat_row("Selected cell", rx.code(
                        rx.cond(AppState.selected_cell != "", AppState.selected_cell, "\u2014"),
                        font_size="12px",
                    )),
                    _stat_row(
                        "Weight",
                        rx.text(
                            AppState.selected_weight.to(str),
                            class_name=rx.cond(
                                AppState.selected_weight >= 4,
                                "stat-value stat-error",
                                rx.cond(
                                    AppState.selected_weight >= 2,
                                    "stat-value stat-warn",
                                    "stat-value",
                                ),
                            ),
                        ),
                    ),
                    rx.text(
                        "Parity relations: ",
                        rx.text(
                            AppState.selected_parity_relations_list.length().to(str),
                            as_="b",
                        ),
                        font_size="12px",
                        color="var(--text-secondary)",
                        margin_top="8px",
                    ),
                    rx.box(
                        rx.foreach(
                            AppState.selected_parity_relations_list,
                            lambda pid: rx.text(
                                pid,
                                font_family="'Menlo', 'Monaco', 'Consolas', monospace",
                                font_size="11px",
                                color="var(--text-primary)",
                                padding_y="1px",
                            ),
                        ),
                        max_height="80px",
                        overflow="auto",
                        margin_y="4px",
                        padding_left="18px",
                    ),
                    rx.text(
                        "Checksum relations: ",
                        rx.text(
                            AppState.selected_checksum_relations_list.length().to(str),
                            as_="b",
                        ),
                        font_size="12px",
                        color="var(--text-secondary)",
                    ),
                    rx.box(
                        rx.foreach(
                            AppState.selected_checksum_relations_list,
                            lambda cid: rx.text(
                                cid,
                                font_family="'Menlo', 'Monaco', 'Consolas', monospace",
                                font_size="11px",
                                color="var(--text-primary)",
                                padding_y="1px",
                            ),
                        ),
                        max_height="80px",
                        overflow="auto",
                        margin_top="4px",
                        padding_left="18px",
                    ),
                ),
            ),
        ),
        class_name="section-card",
    )


def _render_covered_row(item: rx.Var[dict]) -> rx.Component:
    return rx.flex(
        rx.text(item["id"].to(str), font_size="11px"),
        rx.text(
            "bit=" + item["bit"].to(str) + " \u00b7 w=" + item["weight"].to(str),
            font_size="11px",
            color="var(--text-muted)",
        ),
        class_name="covered-row",
        justify="between",
    )


def thresholds_panel() -> rx.Component:
    """Threshold inputs with auto-recompute."""
    return rx.box(
        rx.box(
            rx.flex(
                rx.text(
                    "Thresholds",
                    rx.text(
                        " auto-recompute",
                        font_weight="400",
                        text_transform="none",
                        font_size="10px",
                        color="var(--text-muted)",
                        margin_left="6px",
                        as_="span",
                    ),
                ),
                display="inline",
            ),
            _chevron(AppState.collapsed_thresholds),
            class_name=rx.cond(
                AppState.collapsed_thresholds,
                "section-title section-title-collapsible section-title-collapsed",
                "section-title section-title-collapsible",
            ),
            on_click=AppState.toggle_collapse_thresholds,
        ),
        rx.cond(
            ~AppState.collapsed_thresholds,
            rx.box(
                rx.flex(
                    rx.text("Parity threshold", font_size="13px"),
                    rx.el.input(
                        type="number",
                        value=AppState.threshold_parity,
                        on_change=AppState.set_threshold_parity_value,
                    ),
                    justify="between",
                    align="center",
                    margin_bottom="8px",
                ),
                rx.flex(
                    rx.text("Data threshold", font_size="13px"),
                    rx.el.input(
                        type="number",
                        value=AppState.threshold_data,
                        on_change=AppState.set_threshold_data_value,
                    ),
                    justify="between",
                    align="center",
                    margin_bottom="8px",
                ),
                rx.flex(
                    rx.text("False positive budget", font_size="13px"),
                    rx.el.input(
                        type="number",
                        value=AppState.false_positive,
                        on_change=AppState.set_false_positive_value,
                    ),
                    justify="between",
                    align="center",
                ),
            ),
        ),
        class_name="section-card",
    )


def load_inputs_panel() -> rx.Component:
    """Load bits, parity relations, and checksum relations."""
    return rx.box(
        _collapsible_header("Load Inputs", AppState.collapsed_load_inputs, AppState.toggle_collapse_load_inputs),
        rx.cond(
            ~AppState.collapsed_load_inputs,
            rx.fragment(
                # Bitstring
                rx.box(
                    rx.text(
                        "80-bit string",
                        font_size="12px",
                        color="var(--text-secondary)",
                        margin_bottom="4px",
                    ),
                    rx.el.textarea(
                        value=AppState.bit_input,
                        rows=2,
                        class_name=rx.cond(
                            AppState.input_error_bits != "",
                            "has-error",
                            "",
                        ),
                        on_change=AppState.set_bit_input_value,
                    ),
                    rx.cond(
                        AppState.input_error_bits != "",
                        rx.text(
                            AppState.input_error_bits,
                            class_name="error-msg",
                        ),
                    ),
                    rx.button(
                        "Load bits",
                        class_name="btn btn-primary btn-sm",
                        margin_top="6px",
                        on_click=AppState.load_bits,
                    ),
                    margin_bottom="12px",
                ),
                # Parity relations
                rx.box(
                    rx.text(
                        "Parity relations ",
                        rx.text("(JSON or Python dict)", opacity="0.6", as_="span"),
                        font_size="12px",
                        color="var(--text-secondary)",
                        margin_bottom="4px",
                    ),
                    rx.el.textarea(
                        value=AppState.rel_input,
                        rows=6,
                        class_name=rx.cond(
                            AppState.input_error_parity != "",
                            "has-error",
                            "",
                        ),
                        on_change=AppState.set_rel_input_value,
                    ),
                    rx.cond(
                        AppState.input_error_parity != "",
                        rx.text(
                            AppState.input_error_parity,
                            class_name="error-msg",
                        ),
                    ),
                    rx.button(
                        "Load parity relations",
                        class_name="btn btn-primary btn-sm",
                        margin_top="6px",
                        on_click=AppState.load_relations,
                    ),
                    margin_bottom="12px",
                ),
                # Checksum relations
                rx.box(
                    rx.text(
                        "Checksum relations ",
                        rx.text("(JSON or Python dict)", opacity="0.6", as_="span"),
                        font_size="12px",
                        color="var(--text-secondary)",
                        margin_bottom="4px",
                    ),
                    rx.el.textarea(
                        value=AppState.checksum_input,
                        rows=6,
                        class_name=rx.cond(
                            AppState.input_error_checksum != "",
                            "has-error",
                            "",
                        ),
                        on_change=AppState.set_checksum_input_value,
                    ),
                    rx.cond(
                        AppState.input_error_checksum != "",
                        rx.text(
                            AppState.input_error_checksum,
                            class_name="error-msg",
                        ),
                    ),
                    rx.button(
                        "Load checksum relations",
                        class_name="btn btn-primary btn-sm",
                        margin_top="6px",
                        on_click=AppState.load_checksum_relations,
                    ),
                ),
            ),
        ),
        class_name="section-card",
    )


def sidebar() -> rx.Component:
    """Right sidebar with all panels."""
    return rx.box(
        analysis_panel(),
        inspector_panel(),
        thresholds_panel(),
        load_inputs_panel(),
        display="grid",
        gap="12px",
    )
