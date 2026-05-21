"""Main page assembly for the Parity Relation Visualization app."""

import reflex as rx

from .components import grid_component, header, shortcuts_modal, sidebar
from .state import AppState


def index() -> rx.Component:
    """Root page."""
    return rx.box(
        # Header bar
        header(),
        # Main 2-column layout
        rx.box(
            # Left: grid area
            rx.box(grid_component()),
            # Right: sidebar
            sidebar(),
            class_name="main-layout",
        ),
        # Shortcuts modal overlay
        shortcuts_modal(),
        # Hidden buttons for keyboard shortcut JS dispatch
        rx.el.button(
            id="_btn_undo",
            on_click=AppState.undo,
            style={"display": "none"},
        ),
        rx.el.button(
            id="_btn_redo",
            on_click=AppState.redo,
            style={"display": "none"},
        ),
        rx.el.button(
            id="_btn_shortcuts",
            on_click=AppState.toggle_shortcuts,
            style={"display": "none"},
        ),
        rx.el.button(
            id="_btn_escape",
            on_click=AppState.handle_escape,
            style={"display": "none"},
        ),
        min_height="100vh",
        background="var(--bg-page)",
    )


app = rx.App(
    stylesheets=["/styles.css"],
)
app.add_page(index, on_load=[AppState.on_load, AppState.setup_keyboard_shortcuts])
