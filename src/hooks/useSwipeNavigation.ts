import { useEffect, useRef } from "react";

/**
 * Detect macOS two-finger trackpad swipe for back/forward navigation.
 * Uses the wheel event with horizontal delta and a cooldown to prevent
 * multiple triggers per gesture.
 */
export function useSwipeNavigation(onBack: () => void, onForward: () => void) {
  const cooldownRef = useRef(false);
  const cooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onBackRef = useRef(onBack);
  const onForwardRef = useRef(onForward);
  onBackRef.current = onBack;
  onForwardRef.current = onForward;

  useEffect(() => {
    function handleWheel(e: WheelEvent) {
      // Only trigger on predominantly horizontal swipes
      if (Math.abs(e.deltaX) < 30 || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 2) return;
      if (cooldownRef.current) return;

      cooldownRef.current = true;
      cooldownTimerRef.current = setTimeout(() => { cooldownRef.current = false; }, 500);

      if (e.deltaX < 0) {
        onBackRef.current();
      } else {
        onForwardRef.current();
      }
    }

    window.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (cooldownTimerRef.current) clearTimeout(cooldownTimerRef.current);
    };
  }, []);
}
