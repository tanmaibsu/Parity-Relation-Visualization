"""Header bar component."""

import reflex as rx

from ..state import AppState


def header() -> rx.Component:
    """App header with title, bitstring preview, and action buttons."""
    return rx.flex(
        # Title
        rx.box(
            rx.text(
                "8x10 Origami Parity Visualizer",
                font_weight="700",
                font_size="15px",
                letter_spacing="-0.01em",
            ),
            rx.text(
                "Weight-based error analysis",
                font_size="11px",
                opacity="0.5",
                margin_top="1px",
            ),
        ),
        rx.spacer(),
        # Bitstring preview
        rx.code(
            AppState.current_bits,
            font_size="10px",
            background="var(--code-bg)",
            padding="4px 10px",
            border_radius="5px",
            letter_spacing="0.08em",
            max_width="340px",
            overflow="hidden",
            text_overflow="ellipsis",
            white_space="nowrap",
            color="var(--text-on-header-dim)",
        ),
        # Action buttons
        rx.button(
            "Copy bits",
            class_name="btn btn-ghost btn-sm",
            color="var(--header-btn-text)",
            border_color="var(--header-btn-border)",
            on_click=AppState.copy_bitstring,
        ),
        rx.button(
            "Export JSON",
            class_name="btn btn-ghost btn-sm",
            color="var(--header-btn-text)",
            border_color="var(--header-btn-border)",
            on_click=AppState.export_analysis,
        ),
        rx.button(
            rx.cond(AppState.dark_mode, "Light", "Dark"),
            class_name="btn btn-ghost btn-sm",
            color="var(--header-btn-text)",
            border_color="var(--header-btn-border)",
            on_click=AppState.toggle_dark_mode,
            title="Toggle dark/light mode",
        ),
        rx.button(
            "?",
            class_name="btn btn-ghost btn-sm",
            color="var(--header-btn-text)",
            border_color="var(--header-btn-border)",
            on_click=AppState.toggle_shortcuts,
            title="Keyboard shortcuts (?)",
        ),
        # Status badge
        rx.box(
            rx.cond(
                AppState.has_errors,
                rx.text(AppState.error_count.to(str) + " error(s)"),
                rx.text("All OK"),
            ),
            background=rx.cond(AppState.has_errors, "#ef4444", "#10b981"),
            border_radius="999px",
            padding="4px 12px",
            font_size="12px",
            font_weight="700",
            white_space="nowrap",
            color="#fff",
        ),
        background="var(--bg-header)",
        color="var(--text-on-header)",
        padding="11px 20px",
        align_items="center",
        gap="14px",
        box_shadow="var(--shadow-header)",
        flex_wrap="wrap",
    )
