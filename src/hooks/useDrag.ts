import { getCurrentWindow } from "@tauri-apps/api/window";
import type { MouseEvent } from "react";

export function onDragMouseDown(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    e.preventDefault();
    getCurrentWindow().startDragging();
  }
}
