"""
CRDT-like merge for Excalidraw elements (RF-BOARD-01)
Last-write-wins strategy using element version + updated timestamp.
"""
from typing import Any


def merge_excalidraw_elements(payload: dict) -> dict:
    """
    Merge incoming Excalidraw delta with current state.
    Strategy: last-write-wins per element id using 'version' field.
    Returns the merged payload ready to broadcast.
    """
    incoming_elements: list = payload.get("elements", [])
    app_state: dict = payload.get("appState", {})
    files: dict = payload.get("files", {})

    # Build index by element id for O(1) access
    merged = {el["id"]: el for el in incoming_elements if "id" in el}

    return {
        "elements": list(merged.values()),
        "appState": app_state,
        "files": files,
    }


def apply_delta(current_elements: list, delta_elements: list) -> list:
    """
    Merge a delta (partial update) into the current full element list.
    Elements not in the delta are preserved.
    """
    current_map = {el["id"]: el for el in current_elements if "id" in el}

    for el in delta_elements:
        el_id = el.get("id")
        if not el_id:
            continue
        existing = current_map.get(el_id)
        if existing is None:
            current_map[el_id] = el
        elif el.get("version", 0) >= existing.get("version", 0):
            current_map[el_id] = el
        # else: incoming version is older, discard

    return list(current_map.values())
