"""Shortcuts modal and toast notifications."""

import reflex as rx

from ..state import AppState


def shortcuts_modal() -> rx.Component:
    """Keyboard shortcuts overlay modal."""
    return rx.cond(
        AppState.show_shortcuts,
        rx.box(
            rx.box(
                rx.text("Keyboard Shortcuts", class_name="section-title"),
                rx.box(
                    rx.el.kbd("?"), rx.text("Toggle this help"),
                    rx.el.kbd("Esc"), rx.text("Clear selection / close modal"),
                    rx.el.kbd("Ctrl+Z"), rx.text("Undo"),
                    rx.el.kbd("Ctrl+Shift+Z"), rx.text("Redo"),
                    rx.el.kbd("Ctrl+Y"), rx.text("Redo (alt)"),
                    display="grid",
                    grid_template_columns="auto 1fr",
                    gap="8px 16px",
                    font_size="13px",
                    align_items="center",
                ),
                rx.text(
                    rx.text("Mouse: ", as_="b"),
                    "Click parity cell = coverage view · Click data cell = reverse lookup · Double-click = flip bit",
                    font_size="12px",
                    color="var(--text-secondary)",
                    margin_top="14px",
                ),
                rx.flex(
                    rx.button(
                        "Close",
                        class_name="btn btn-secondary btn-sm",
                        on_click=AppState.toggle_shortcuts,
                    ),
                    justify="end",
                    margin_top="10px",
                ),
                class_name="section-card",
                max_width="420px",
                width="90%",
                on_click=rx.stop_propagation,
            ),
            class_name="shortcuts-overlay",
            on_click=AppState.toggle_shortcuts,
        ),
    )
