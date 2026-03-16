import { useCallback, useRef, useEffect, useState } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  valueLow: number;
  valueHigh: number;
  onChange: (low: number, high: number) => void;
  formatLabel: (value: number) => string;
  label: string;
}

export default function DualRangeSlider({
  min,
  max,
  valueLow,
  valueHigh,
  onChange,
  formatLabel,
  label,
}: DualRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<"low" | "high" | null>(null);
  const [localLow, setLocalLow] = useState(valueLow);
  const [localHigh, setLocalHigh] = useState(valueHigh);

  useEffect(() => {
    setLocalLow(valueLow);
    setLocalHigh(valueHigh);
  }, [valueLow, valueHigh]);

  const range = max - min;
  const lowPct = range > 0 ? ((localLow - min) / range) * 100 : 0;
  const highPct = range > 0 ? ((localHigh - min) / range) * 100 : 100;

  const getValueFromX = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || range === 0) return min;
      const rect = track.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(min + pct * range);
    },
    [min, range]
  );

  const handlePointerDown = useCallback(
    (thumb: "low" | "high") => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      draggingRef.current = thumb;
    },
    []
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return;
      const val = getValueFromX(e.clientX);
      if (draggingRef.current === "low") {
        const clamped = Math.min(val, localHigh);
        setLocalLow(clamped);
      } else {
        const clamped = Math.max(val, localLow);
        setLocalHigh(clamped);
      }
    },
    [getValueFromX, localLow, localHigh]
  );

  const handlePointerUp = useCallback(() => {
    if (draggingRef.current) {
      draggingRef.current = null;
      onChange(localLow, localHigh);
    }
  }, [localLow, localHigh, onChange]);

  const isActive = localLow > min || localHigh < max;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          {isActive
            ? `${formatLabel(localLow)} – ${formatLabel(localHigh)}`
            : "All"}
        </span>
      </div>
      <div
        ref={trackRef}
        className="relative h-5 flex items-center cursor-pointer"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {/* Background track */}
        <div className="absolute inset-x-0 h-1 rounded-full bg-gray-200 dark:bg-gray-700" />
        {/* Active range */}
        <div
          className="absolute h-1 rounded-full bg-indigo-500"
          style={{ left: `${lowPct}%`, right: `${100 - highPct}%` }}
        />
        {/* Low thumb */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-500 shadow-sm -translate-x-1/2 touch-none"
          style={{ left: `${lowPct}%` }}
          onPointerDown={handlePointerDown("low")}
        />
        {/* High thumb */}
        <div
          className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 border-indigo-500 shadow-sm -translate-x-1/2 touch-none"
          style={{ left: `${highPct}%` }}
          onPointerDown={handlePointerDown("high")}
        />
      </div>
    </div>
  );
}
