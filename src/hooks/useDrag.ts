import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

export function onDragMouseDown(e: MouseEvent) {
  if (e.target === e.currentTarget && e.buttons === 1) {
    e.preventDefault();
    if (e.detail === 2) {
      getCurrentWindow().toggleMaximize();
    } else {
      getCurrentWindow().startDragging();
    }
  }
}
