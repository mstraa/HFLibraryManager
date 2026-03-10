import type { ProjectFilamentDisplay } from "../lib/types";

interface FilamentBadgeProps {
  filament: ProjectFilamentDisplay;
  onFilamentClick?: (id: string) => void;
}

export default function FilamentBadge({ filament: pf, onFilamentClick }: FilamentBadgeProps) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (pf.curated_filament_id) onFilamentClick?.(pf.curated_filament_id);
      }}
      className={`w-4 h-4 rounded-full cursor-pointer hover:scale-125 transition-transform ${
        pf.match_status === "unmatched"
          ? "border-2 border-gray-400 dark:border-gray-500"
          : pf.match_status === "guessed"
            ? "border-2 border-dashed border-gray-300 dark:border-gray-500"
            : "border border-gray-300 dark:border-gray-500"
      }`}
      style={{ backgroundColor: pf.match_status === "unmatched" ? (pf.parsed_color || "#9ca3af") : pf.color }}
      title={pf.match_status === "unmatched"
        ? `Unmatched: ${pf.parsed_brand} ${pf.parsed_name} (${pf.parsed_color})`
        : `${pf.brand} ${pf.name} (${pf.color})`}
    >
      {pf.match_status === "unmatched" && !pf.parsed_color && (
        <span className="text-[8px] font-bold text-white flex items-center justify-center h-full">?</span>
      )}
    </button>
  );
}
