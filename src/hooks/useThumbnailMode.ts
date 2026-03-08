import { useCallback, useSyncExternalStore } from "react";
import type { ThumbnailMode } from "../lib/types";

const STORAGE_KEY = "thumbnailMode";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((l) => l());
}

function getSnapshot(): ThumbnailMode {
  return (localStorage.getItem(STORAGE_KEY) as ThumbnailMode) || "cover";
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useThumbnailMode(): [ThumbnailMode, (mode: ThumbnailMode) => void] {
  const mode = useSyncExternalStore(subscribe, getSnapshot);

  const setMode = useCallback((m: ThumbnailMode) => {
    localStorage.setItem(STORAGE_KEY, m);
    notify();
  }, []);

  return [mode, setMode];
}
