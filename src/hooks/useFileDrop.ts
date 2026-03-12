import { useCallback, useEffect, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export function useFileDrop(onDrop: (paths: string[]) => void) {
  const [isDragging, setIsDragging] = useState(false);

  const stableOnDrop = useCallback(onDrop, [onDrop]);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;

    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (cancelled) return;
        if (event.payload.type === "enter") {
          setIsDragging(true);
        } else if (event.payload.type === "leave") {
          setIsDragging(false);
        } else if (event.payload.type === "drop") {
          setIsDragging(false);
          // Ignore drops in the bottom 20% of the window (cancel zone)
          const pos = (event.payload as { position?: { x: number; y: number } }).position;
          if (pos && pos.y > window.innerHeight * 0.8) {
            return;
          }
          if (event.payload.paths && event.payload.paths.length > 0) {
            stableOnDrop(event.payload.paths);
          }
        }
      })
      .then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      })
      .catch((err) => console.error("Failed to register drag-drop listener:", err));

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [stableOnDrop]);

  return { isDragging };
}
