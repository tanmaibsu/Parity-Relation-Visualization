"""8x10 interactive grid component."""

import reflex as rx

from ..state import AppState


def render_cell(cell: rx.Var[dict]) -> rx.Component:
    """Render a single grid cell button."""
    return rx.button(
        # Cell value (0 or 1)
        rx.text(
            cell["value_str"],
            font_weight="700",
            font_size="15px",
        ),
        # Diff marker dot (top-left)
        rx.cond(
            cell["is_diff"],
            rx.box(
                position="absolute",
                top="2px",
                left="2px",
                width="6px",
                height="6px",
                border_radius="50%",
                background="var(--diff-marker)",
            ),
        ),
        # Flip-priority badge (top-right)
        rx.cond(
            cell["show_flip_badge"],
            rx.text(
                cell["flip_rank_str"],
                position="absolute",
                top="1px",
                right="2px",
                font_size="8px",
                font_weight="700",
                line_height="1",
                color=rx.cond(
                    cell["is_selected"],
                    cell["text_color"],
                    "var(--cell-weight)",
                ),
            ),
        ),
        # Weight badge (bottom-right)
        rx.cond(
            cell["show_weight_badge"],
            rx.text(
                cell["weight_str"],
                position="absolute",
                bottom="2px",
                right="3px",
                font_size="9px",
                font_weight="700",
                line_height="1",
                color=rx.cond(
                    cell["is_selected"],
                    cell["text_color"],
                    "var(--cell-weight)",
                ),
                background=cell["weight_badge_bg"],
                border_radius="3px",
                padding="0 1px",
            ),
        ),
        class_name="grid-cell",
        width="44px",
        height="44px",
        border_radius="8px",
        background=cell["bg_color"],
        color=cell["text_color"],
        border=cell["border"],
        box_shadow=cell["box_shadow"],
        position="relative",
        padding="0",
        flex_shrink="0",
        cursor="pointer",
        display="flex",
        align_items="center",
        justify_content="center",
        on_click=AppState.select_cell(cell["r"], cell["c"]),
        on_double_click=AppState.toggle_cell(cell["r"], cell["c"]),
    )


def render_row(row_data: rx.Var[list[dict]]) -> rx.Component:
    """Render a grid row with its label."""
    return rx.flex(
        # Row label
        rx.text(
            row_data[0]["r"].to(str),
            width="20px",
            text_align="right",
            flex_shrink="0",
            font_size="10px",
            color="var(--text-muted)",
            font_weight="600",
        ),
        rx.foreach(row_data, render_cell),
        align_items="center",
        gap="6px",
        margin_bottom="6px",
    )


def grid_component() -> rx.Component:
    """The 8x10 interactive grid."""
    return rx.box(
        rx.box(
            # Grid header
            rx.flex(
                rx.text("Grid", font_weight="700", font_size="15px"),
                rx.box(
                    AppState.mode,
                    class_name=rx.cond(
                        AppState.mode == "weights",
                        "mode-badge mode-weights",
                        rx.cond(
                            AppState.mode == "parityCoverage",
                            "mode-badge mode-parityCoverage",
                            "mode-badge mode-reverse",
                        ),
                    ),
                ),
                rx.cond(
                    AppState.diff_count > 0,
                    rx.text(
                        AppState.diff_count.to(str) + " changed",
                        font_size="11px",
                        font_weight="600",
                        color="var(--diff-marker)",
                    ),
                ),
                rx.spacer(),
                rx.button(
                    "Clear ",
                    rx.text("Esc", opacity="0.6"),
                    class_name="btn btn-secondary btn-sm",
                    on_click=AppState.clear_selection,
                ),
                rx.button(
                    "Weight mode",
                    class_name="btn btn-secondary btn-sm",
                    on_click=AppState.set_mode_weights,
                ),
                rx.button(
                    "Undo ",
                    rx.text("^Z", opacity="0.6"),
                    class_name="btn btn-secondary btn-sm",
                    on_click=AppState.undo,
                ),
                rx.button(
                    "Redo ",
                    rx.text("^Y", opacity="0.6"),
                    class_name="btn btn-secondary btn-sm",
                    on_click=AppState.redo,
                ),
                align_items="center",
                gap="8px",
                margin_bottom="12px",
                flex_wrap="wrap",
            ),
            # Grid area
            rx.box(
                # Column labels
                rx.flex(
                    rx.box(width="20px"),  # spacer for row labels
                    rx.foreach(
                        ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
                        lambda c: rx.text(
                            c,
                            width="44px",
                            text_align="center",
                            font_size="10px",
                            color="var(--text-muted)",
                            font_weight="600",
                        ),
                    ),
                    gap="6px",
                    padding_left="0px",
                    margin_bottom="3px",
                ),
                # Grid rows
                rx.foreach(AppState.grid_rows, render_row),
                class_name="grid-scroll-wrapper",
            ),
            class_name="section-card",
            margin_bottom="12px",
        ),
        # Action buttons
        rx.flex(
            rx.button(
                "Reset",
                class_name="btn btn-danger",
                on_click=AppState.reset_all,
            ),
            rx.button(
                "Recompute parity + checksum",
                class_name="btn btn-primary",
                on_click=AppState.recompute_parity_and_checksum,
            ),
            gap="8px",
            flex_wrap="wrap",
            margin_bottom="10px",
        ),
        # Instructions
        rx.text(
            "Click parity cell = coverage · Click data cell = reverse lookup · Double-click = flip bit · Esc = clear · ^Z/^Y = undo/redo · ? = shortcuts",
            font_size="11px",
            color="var(--text-muted)",
            margin_bottom="12px",
        ),
        # Color legend
        rx.box(
            rx.text("Legend", class_name="section-title"),
            rx.box(
                _legend_item("#60a5fa", "Parity"),
                _legend_item("#f9a8d4", "Covered bits"),
                _legend_item("#fde047", "Checksum"),
                _legend_item("#ef4444", "Index"),
                _legend_item("#d946ef", "Orientation"),
                _legend_item("#22c55e", "Data"),
                _legend_item("#fdba74", "Med. weight (>=2)"),
                _legend_item("#fb923c", "Relation hit (reverse)"),
                _legend_item("#f97316", "High weight (>=4)"),
                _legend_item("#fb7185", "Probable error"),
                _legend_item("var(--diff-marker)", "Changed from original"),
                class_name="legend-grid",
            ),
            class_name="section-card",
        ),
    )


def _legend_item(color: str, label: str) -> rx.Component:
    return rx.flex(
        rx.box(
            width="13px",
            height="13px",
            border_radius="3px",
            flex_shrink="0",
            border="1px solid var(--cell-border)",
            background=color,
        ),
        rx.text(label, font_size="11px"),
        class_name="legend-item",
        align_items="center",
        gap="6px",
    )
