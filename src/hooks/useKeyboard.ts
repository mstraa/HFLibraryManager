import { useEffect } from "react";

interface KeyBinding {
  key: string;
  meta?: boolean;
  shift?: boolean;
  handler: () => void;
}

export function useKeyboard(bindings: KeyBinding[]) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
        // Only allow Escape in inputs
        if (e.key !== "Escape") return;
      }

      for (const binding of bindings) {
        const metaMatch = binding.meta ? (e.metaKey || e.ctrlKey) : !(e.metaKey || e.ctrlKey);
        const shiftMatch = binding.shift ? e.shiftKey : !e.shiftKey;
        if (e.key === binding.key && metaMatch && shiftMatch) {
          e.preventDefault();
          binding.handler();
          return;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [bindings]);
}
